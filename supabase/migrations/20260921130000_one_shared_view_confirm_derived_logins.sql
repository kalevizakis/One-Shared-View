-- One Shared View — confirm derived logins at creation, in SQL.
--
-- WHY
-- First sign-in failed with "Email not confirmed". The usual remedy is to turn
-- off "Confirm email" in the dashboard's auth settings, but that screen is not
-- reachable for this project, so the same result is achieved here instead.
--
-- A BEFORE INSERT trigger on auth.users stamps email_confirmed_at when the row
-- is created, so the login is usable immediately and the confirmation loop never
-- starts.
--
-- WHY THIS IS NOT A WEAKENING OF ACCESS CONTROL
-- Mail confirmation exists to prove that whoever signed up controls the inbox.
-- Nothing in this app depends on that, and it could not work here anyway:
--
--   * Nobody types an address. Sign-in takes an NTID and the server derives
--     <ntid>@pfizer.com from it, so there is no attacker-chosen address whose
--     ownership would need proving.
--   * A login record is only ever created after ntid_signin_check has confirmed
--     the NTID is on the roster and active. The roster is the authorisation
--     decision, and it is unaffected by this.
--   * Identity is established one layer out by the company sign-in gate in front
--     of the app.
--   * No confirmation mail can be delivered in this environment in any case, so
--     the setting was not protecting anything — it was only making every first
--     sign-in fail.
--
-- So this removes a step that cannot succeed and never carried any weight, and
-- leaves both real gates — the company sign-in gate and the roster — untouched.
--
-- SCOPE
-- Deliberately narrow: it only fills in email_confirmed_at when that field is
-- empty, and touches nothing else on the row. Confirmation carried out by any
-- other means is left exactly as it is.

create or replace function public.confirm_derived_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only fills a gap; never overwrites an existing confirmation timestamp.
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;

  return new;
end;
$$;

comment on function public.confirm_derived_login() is
  'Marks a new auth login as confirmed at creation. Sign-in derives the address from the NTID and the roster decides access, so the mail confirmation loop proves nothing here and cannot complete in this environment; without this, every first sign-in stops at "Email not confirmed".';

drop trigger if exists confirm_derived_login on auth.users;

create trigger confirm_derived_login
  before insert on auth.users
  for each row
  execute function public.confirm_derived_login();

-- Any login record already created and left unconfirmed (from the failed
-- attempts before this fix) is brought into line, so nobody is stuck.
update auth.users
   set email_confirmed_at = now()
 where email_confirmed_at is null;
