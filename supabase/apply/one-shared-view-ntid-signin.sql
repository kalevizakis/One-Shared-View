-- One Shared View — NTID-only sign-in + audit write fix
-- Run this whole file in the SQL Editor. Safe to run more than once.

-- =============================================================
-- PART 1 of 2 — allow the audit trigger to write its rows
-- =============================================================
drop policy if exists audit_events_insert on public.audit_events;
-- One Shared View — let the audit trigger write its rows under RLS.
--
-- BACKGROUND
-- audit_events has RLS enabled and, by design, only a SELECT policy: the init
-- migration reasoned that rows are "written exclusively by the security-definer
-- audit trigger" and therefore needed no INSERT policy. That reasoning is
-- fragile. SECURITY DEFINER satisfies the GRANT layer, and a table owner
-- normally bypasses RLS — but that bypass depends on which role actually owns
-- the function and the table in this managed database, which is not something
-- the app can rely on. If the effective role is subject to row security, an
-- INSERT with no matching policy is refused.
--
-- That matters far beyond sign-up: audit_trigger fires AFTER INSERT/UPDATE/
-- DELETE on nine tables, so a refused audit write propagates outwards and
-- aborts the statement that caused it — submitting an update, editing a project,
-- linking a new login. Sign-up surfaced it first only because linking a login
-- updates profiles.
--
-- THE FIX
-- State the permission explicitly instead of depending on owner-bypass: add an
-- INSERT policy covering every role, so the trigger's append always succeeds.
-- The trail stays tamper-proof through the layer that actually guarantees it —
-- there is still NO update policy and NO delete policy, so rows can never be
-- altered or removed, and `authenticated` holds no INSERT *grant* on this table
-- (see the grants migration), so the app cannot forge entries of its own.
--
-- Row security is deliberately NOT forced here: forcing it would subject the
-- owner to RLS as well and remove the very fallback that may be keeping other
-- writes alive.

create policy audit_events_insert on public.audit_events
  for insert
  with check (true);

comment on policy audit_events_insert on public.audit_events is
  'Permits the security-definer audit trigger to append rows regardless of which role it runs as. The trail stays append-only: no update or delete policy exists, and clients hold no insert grant, so entries can be neither forged nor altered through the API.';

-- =============================================================
-- PART 2 of 2 — NTID-only sign-in
-- =============================================================
-- One Shared View — NTID-only sign-in (MVP).
--
-- WHAT CHANGES
-- Sign-in becomes: type your NTID. If it is on the roster and active, you are
-- in; otherwise access is denied. No password is set, chosen, or checked.
--
-- WHY THIS IS ACCEPTABLE HERE, AND WHAT IT RELIES ON
-- Real enterprise SSO (OIDC/SAML) cannot be registered from this environment,
-- so the app cannot verify a person's identity by itself. Identity is instead
-- supplied by the layer in front of the app: the platform's preview sign-in
-- gate, which is genuine company authentication. This app then answers the
-- second question — what may this person see — from the roster.
--
-- The consequence, accepted explicitly by the project owner on 2026-09-21 and
-- recorded in agent-memory/decisions.md: within the group allowed past that
-- gate, one person could enter another's NTID. The mitigation is that the gate
-- stays ON and its viewer list is kept short. This is an MVP posture, not a
-- production one; it is replaced wholesale when real SSO becomes available,
-- and nothing else has to change because every row, permission check and audit
-- entry already keys off profiles.ntid rather than the login.
--
-- HOW IT WORKS
-- Sessions still come from Supabase Auth, so Row Level Security, the audit
-- trigger and every existing policy keep working untouched — they all resolve
-- the caller through auth.uid(). The only difference is how an auth user comes
-- to exist: instead of the visitor choosing a password, the server signs them
-- in with a per-NTID credential that the visitor never sees or supplies.
--
-- This function is the roster gate. It is the ONLY thing the anonymous role may
-- call, it takes an NTID and returns a verdict, and it deliberately reveals
-- nothing else about the roster.

create or replace function public.ntid_signin_check(p_ntid text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ntid text := lower(trim(p_ntid));
  v_profile public.profiles;
begin
  -- Reject anything that is not NTID-shaped before touching the table.
  if v_ntid !~ '^[a-z0-9]{3,20}$' then
    return jsonb_build_object('allowed', false, 'reason', 'invalid');
  end if;

  select * into v_profile from public.profiles where ntid = v_ntid;

  -- Not on the roster, or deactivated by an administrator.
  -- Both answer identically so this cannot be used to enumerate the team:
  -- a caller learns only "you may not sign in", never whether the NTID exists.
  if v_profile.id is null or not v_profile.active then
    return jsonb_build_object('allowed', false, 'reason', 'denied');
  end if;

  return jsonb_build_object(
    'allowed', true,
    'ntid', v_profile.ntid,
    'display_name', v_profile.display_name,
    'already_linked', v_profile.auth_user_id is not null
  );
end;
$$;

comment on function public.ntid_signin_check(text) is
  'Roster gate for NTID-only sign-in. Returns whether an NTID may sign in, without disclosing whether an unknown NTID exists. Callable anonymously by design — it is the one pre-authentication lookup the app needs.';

-- The login screen must be able to ask this before a session exists.
grant execute on function public.ntid_signin_check(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Linking a login to its roster entry, without the sign-up trigger.
-- ---------------------------------------------------------------------------
-- The old flow linked profiles to auth users inside a trigger on auth.users,
-- which is what has been failing opaquely. This replaces it with an explicit,
-- callable step the app runs immediately after signing someone in, so any
-- failure surfaces as a normal error the app can report instead of a generic
-- "Database error saving new user".
create or replace function public.link_auth_user_to_roster(p_ntid text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ntid text := lower(trim(p_ntid));
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Only ever links the caller's OWN session, and only to an active roster
  -- entry. A caller cannot attach themselves to somebody else's entry, because
  -- the NTID must match the row and the row must be free or already theirs.
  update public.profiles
     set auth_user_id = v_uid,
         updated_at = now()
   where ntid = v_ntid
     and active
     and (auth_user_id is null or auth_user_id = v_uid);

  if not found then
    raise exception 'ROSTER_LINK_REFUSED';
  end if;
end;
$$;

comment on function public.link_auth_user_to_roster(text) is
  'Attaches the calling session to its own active roster entry. Replaces the auth.users trigger, so linking failures surface as reportable errors rather than opaque auth 500s.';

grant execute on function public.link_auth_user_to_roster(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Retire the sign-up trigger.
-- ---------------------------------------------------------------------------
-- Nothing creates accounts through public sign-up any more: the server creates
-- them deterministically and calls link_auth_user_to_roster explicitly. Keeping
-- the trigger would mean two mechanisms racing to link the same row, and it is
-- the component whose failures have been impossible to read.
drop trigger if exists on_auth_user_created on auth.users;

-- ---------------------------------------------------------------------------
-- Protect the bootstrap admin.
-- ---------------------------------------------------------------------------
-- The original trigger granted 'admin' to whoever signed up first. With that
-- trigger gone, nothing can silently mint an administrator, which is a security
-- improvement. The existing admin keeps the role they already hold; new roster
-- entries default to 'owner' as before and only an administrator can change a
-- role (guard_profile_changes, unchanged).

-- =============================================================
-- Bookkeeping so the tooling knows these were applied
-- =============================================================
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations
  (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260921093000', 'one_shared_view_audit_insert_policy'),
  ('20260921093500', 'one_shared_view_ntid_signin')
  on conflict do nothing;
