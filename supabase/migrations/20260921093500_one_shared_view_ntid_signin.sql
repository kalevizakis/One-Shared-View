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
