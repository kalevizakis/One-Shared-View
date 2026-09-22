-- One Shared View — NTID sign-in, step 2.
--
-- Run this whole file in the SQL Editor. It replaces the earlier version of
-- step 2, which failed with:
--
--   ERROR 42703: record "old" has no field "status"
--
-- That error was not caused by the script. It exposed a real bug in the audit
-- trigger, which PART 1 below fixes first. Safe to run even if you already ran
-- the earlier version — nothing here depends on that having succeeded.

-- ===========================================================================
-- PART 1 — Repair the audit trigger's column access.
-- ===========================================================================
-- WHY IT FAILED
-- One audit_trigger() serves nine tables. Its UPDATE branch read old.status /
-- new.status directly to recognise a weekly update being submitted. Only four of
-- the nine audited tables have a `status` column:
--
--     has status : milestones, reporting_cycles, project_updates, decisions
--     has none   : profiles, portfolios, projects, generated_reports, reminders
--                  (projects names the column lifecycle_status)
--
-- The `tg_table_name = 'project_updates'` test looks like it guards the field
-- access, but it does not. PL/pgSQL hands the whole IF condition to the SQL
-- engine as one expression, and every identifier in it is resolved at plan time,
-- before any comparison runs. There is no left-to-right short-circuit here. So
-- on a table without a `status` column the trigger fails regardless of what
-- tg_table_name actually is.
--
-- HOW BROAD THIS IS
-- It aborts EVERY update on those five tables: changing a role or access,
-- editing a project, renaming a portfolio, touching a report or a reminder. It
-- is the second half of the same story as the missing INSERT policy on
-- audit_events — audit bookkeeping taking down the very change it was only meant
-- to describe.
--
-- It is also why clearing login records failed: deleting an auth user sets
-- profiles.auth_user_id to null (`on delete set null`), and that update on
-- profiles fired this trigger.
--
-- The earlier safety net could not catch it. The exception handler added in
-- 20260921084500 wraps the audit INSERT, but this failure happens earlier, at
-- the IF — never inside the protected block.
--
-- THE FIX
-- The UPDATE branch already has v_old and v_new as jsonb. Reading status through
-- those (`v_old ->> 'status'`) is a valid question for every table: a missing key
-- yields NULL rather than failing to plan, so the comparison simply never matches
-- where there is no status. The 'submit' and 'edit_after_submission' actions are
-- still recorded for project_updates exactly as before.

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

    -- Read status through jsonb, not as a record field. A table without the
    -- column yields NULL here instead of failing to plan, which is what lets one
    -- function serve all nine audited tables.
    if tg_table_name = 'project_updates'
       and v_old ->> 'status' = 'draft'
       and v_new ->> 'status' = 'submitted' then
      v_action := 'submit';
    elsif tg_table_name = 'project_updates'
       and v_old ->> 'status' = 'submitted' then
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

  -- An audit row matters, but never more than the change it describes being
  -- allowed to happen.
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

comment on function public.audit_trigger() is
  'Appends an audit_events row for every insert, update and delete on the audited tables. Reads per-table columns such as status through jsonb, because one function serves tables with differing shapes and PL/pgSQL resolves every identifier in an IF condition at plan time regardless of which branch would run.';

-- ===========================================================================
-- PART 2 — Clear login records left over from the old password screen.
-- ===========================================================================
-- Those records still hold the password their owner chose. Sign-in now uses a
-- credential the server derives from the NTID, which can never match an old
-- password, so they fail permanently with "Invalid login credentials". This
-- includes the existing admin account.
--
-- WHAT THIS DOES NOT TOUCH — the important part:
-- Roster entries in public.profiles are left alone, including every role.
-- profiles.auth_user_id is declared `on delete set null`, so removing a login
-- record blanks that one link and nothing else; the row, the NTID, the display
-- name and the admin role all survive. link_auth_user_to_roster re-attaches the
-- new login on the next sign-in.
--
-- The administrator stays the administrator. Roles live in the roster, never in
-- the login record.

-- Show what is about to be removed, before removing it.
select
  u.email,
  p.ntid,
  p.display_name,
  p.role,
  u.email_confirmed_at is not null as was_confirmed
from auth.users u
join public.profiles p on p.ntid = lower(split_part(u.email, '@', 1))
order by p.role, p.ntid;

-- Remove them. Scoped to addresses that map to a real roster entry, so no
-- unrelated login record can be caught by this.
delete from auth.users u
where exists (
  select 1
    from public.profiles p
   where p.ntid = lower(split_part(u.email, '@', 1))
);

-- Confirm the roster came through untouched, with the admin still an admin.
-- auth_user_id will read null here — that is expected, and the next sign-in
-- fills it back in.
select ntid, display_name, role, active, auth_user_id
from public.profiles
order by role, ntid;

-- ===========================================================================
-- Bookkeeping so this counts as an applied migration.
-- ===========================================================================
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations
  (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260921120000', 'one_shared_view_audit_trigger_field_fix')
  on conflict do nothing;

-- ===========================================================================
-- REMAINING MANUAL STEP (cannot be done in SQL)
-- ===========================================================================
-- In the Supabase dashboard:
--   Authentication -> Sign In / Providers -> Email
--   turn OFF "Confirm email", then Save.
--
-- Sign-in issues the session on the visitor's behalf, so there is no inbox step
-- for anyone to complete and no confirmation link to click. Leaving this on means
-- every first-time sign-in stops at "Email not confirmed".
--
-- This does not weaken access control. Access is decided by the roster gate
-- (ntid_signin_check) plus the company sign-in gate in front of the app; the mail
-- confirmation loop was never part of either.
