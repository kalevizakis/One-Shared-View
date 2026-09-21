-- One Shared View — repair first-time sign-up.
--
-- CORRECTION (added 2026-09-21, after this migration failed to fix the problem)
-- The diagnosis below is WRONG about the guard. For a non-first user the linking
-- UPDATE assigned role and active to their own values, and `IS DISTINCT FROM` is
-- false for a self-assignment, so guard_profile_changes never fired. Applying
-- this migration changed nothing, which is what exposed the error.
--
-- The true cause was the audit trigger's INSERT being refused by row security on
-- audit_events (RLS enabled, SELECT policy only, no INSERT policy). See
-- 20260921093000_one_shared_view_audit_insert_policy.sql, which fixes it.
--
-- What is still worth keeping from this file: the audit insert is wrapped so a
-- bookkeeping failure can never again destroy the user's work, and the linking
-- update now writes only the fields that actually change. Both are sound; the
-- reasoning recorded below simply misidentified which trigger was at fault.
--
-- SYMPTOM
-- Every attempt to create an account failed with "Database error saving new
-- user" (HTTP 500 from the auth service), which the app surfaced as the generic
-- "That account could not be created." Rostered and non-rostered NTIDs failed
-- alike, so the roster was not the cause.
--
-- WHY IT HAPPENED
-- Creating an account inserts a row into auth.users, which fires
-- handle_new_auth_user to link that login to its roster entry. For anyone other
-- than the very first user that link is an UPDATE of public.profiles, and that
-- UPDATE fires two more triggers:
--
--   profiles_guard_changes  — refuses role/active/ntid changes unless the caller
--                             is an admin. During sign-up nobody is signed in
--                             yet, so auth.uid() is null and is_admin() is
--                             false. The link statement re-assigned `role` and
--                             `active` to themselves, and a self-assignment
--                             still counts as a change for the first user
--                             bootstrap path.
--   profiles_audit          — records the change, resolving the actor from
--                             auth.uid(), which is likewise null here.
--
-- Any exception raised inside those triggers aborts the whole transaction,
-- including the auth.users insert — so the account was never created and the
-- auth service could only report a generic database error.
--
-- The first account ever made (the bootstrap admin) took the INSERT branch
-- instead, which fires no UPDATE triggers. That is why exactly one account
-- could be created and every later one failed.
--
-- THE FIX, in three parts:
--   1. Teach the guard to recognise the trigger-driven linking update and allow
--      it, while still refusing role/NTID/access edits from ordinary users.
--   2. Only write the fields that actually change when linking, so no
--      self-assignment is mistaken for an edit.
--   3. Make the audit trigger tolerate an unauthenticated actor, so bookkeeping
--      can never be the reason a legitimate sign-up fails.
--
-- Roster enforcement is unchanged: an NTID that is not on the roster, or whose
-- entry is deactivated, is still refused.

-- ---------------------------------------------------------------------------
-- 1 + 2. Linking is a privileged, internal operation — mark it as such.
-- ---------------------------------------------------------------------------
-- The flag is set for the duration of the sign-up transaction only. `true` as
-- the third argument to set_config makes it transaction-local, so it cannot
-- leak into any later statement on the same connection.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ntid text := lower(split_part(new.email, '@', 1));
  v_profile public.profiles;
  v_is_first boolean;
  v_display_name text := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
begin
  select not exists (select 1 from public.profiles where auth_user_id is not null)
    into v_is_first;

  select * into v_profile from public.profiles where ntid = v_ntid;

  -- Announce that the statements below are the trigger's own linking work, not
  -- a user editing the roster. guard_profile_changes checks for this.
  perform set_config('one_shared_view.linking', 'on', true);

  if v_profile.id is null then
    -- Not on the roster. The very first account bootstraps itself as the
    -- administrator so the app is usable; everyone else is refused.
    if not v_is_first then
      raise exception 'NTID_NOT_ON_ROSTER';
    end if;

    insert into public.profiles (auth_user_id, ntid, display_name, role, active)
    values (
      new.id,
      v_ntid,
      coalesce(v_display_name, upper(v_ntid)),
      'admin'::public.user_role,
      true
    );
  else
    -- A deactivated entry must not be reclaimed by signing up again.
    if not v_profile.active and not v_is_first then
      raise exception 'NTID_NOT_ON_ROSTER';
    end if;

    -- Link the login to the existing roster entry. Only the fields that
    -- genuinely change are written: re-assigning role or active to their own
    -- values would read as a privileged edit to the guard.
    update public.profiles
       set auth_user_id = new.id,
           display_name = coalesce(v_display_name, display_name),
           updated_at = now()
     where id = v_profile.id;

    -- The bootstrap promotion is a separate, explicit statement so the ordinary
    -- path above never touches role or access at all.
    if v_is_first then
      update public.profiles
         set role = 'admin'::public.user_role,
             active = true,
             updated_at = now()
       where id = v_profile.id;
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. The guard: still strict for people, permissive for the linking trigger.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Set only by handle_new_auth_user, and only for that transaction. This is
  -- how a brand-new account gets attached to its roster entry before any
  -- session exists to be an admin.
  if coalesce(current_setting('one_shared_view.linking', true), '') = 'on' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.active is distinct from old.active
     or new.ntid is distinct from old.ntid then
    raise exception 'Only an administrator can change roles, NTIDs, or access.';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Audit bookkeeping must never be the reason a sign-up fails.
-- ---------------------------------------------------------------------------
-- The actor is unknown during sign-up (no session yet), which is legitimate and
-- already recorded as a null actor shown as "system" in the trail. This wraps
-- the write so that any unforeseen failure is logged as a warning rather than
-- destroying the user's transaction — an audit row is important, but not more
-- important than the change it describes being allowed to happen.
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_ntid text;
  v_changes jsonb;
  v_action text;
  v_entity_id uuid;
  v_label text;
  v_old jsonb;
  v_new jsonb;
begin
  select ntid into v_ntid from public.profiles where id = v_actor;

  if tg_op = 'INSERT' then
    v_action := 'create';
    v_changes := to_jsonb(new) - 'created_at' - 'updated_at';
    v_entity_id := new.id;
  elsif tg_op = 'UPDATE' then
    v_action := 'update';
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    select jsonb_object_agg(o.key, jsonb_build_object('from', o.value, 'to', n.value))
      into v_changes
      from jsonb_each(v_old) o
      join jsonb_each(v_new) n on n.key = o.key
     where o.value is distinct from n.value
       and o.key not in ('updated_at', 'revision');

    if v_changes is null or v_changes = '{}'::jsonb then
      return new;
    end if;

    if tg_table_name = 'project_updates'
       and old.status = 'draft' and new.status = 'submitted' then
      v_action := 'submit';
    elsif tg_table_name = 'project_updates' and old.status = 'submitted' then
      v_action := 'edit_after_submission';
    end if;
    v_entity_id := new.id;
  else
    v_action := 'delete';
    v_changes := to_jsonb(old) - 'created_at' - 'updated_at';
    v_entity_id := old.id;
  end if;

  v_label := coalesce(
    to_jsonb(coalesce(new, old)) ->> 'name',
    to_jsonb(coalesce(new, old)) ->> 'title',
    to_jsonb(coalesce(new, old)) ->> 'display_name'
  );

  begin
    insert into public.audit_events (
      actor_profile_id, actor_ntid, entity_type, entity_id, entity_label, action, changes_json
    )
    values (v_actor, v_ntid, tg_table_name, v_entity_id, v_label, v_action, v_changes);
  exception when others then
    raise warning 'audit_events write failed for %.%: %', tg_table_name, v_entity_id, sqlerrm;
  end;

  return coalesce(new, old);
end;
$$;
