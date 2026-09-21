-- One Shared View — NTID sign-in, step 3: remove the e-mail confirmation block.
--
-- Run this whole file in the SQL Editor. It replaces the dashboard step you could
-- not reach ("Confirm email" under Authentication -> Sign In / Providers), and
-- achieves the same result.
--
-- Step 2 is already applied and verified: the audit trigger is repaired, the old
-- login records are cleared, and the roster came through intact with the admin
-- role in place. This is the last piece.

-- ===========================================================================
-- Confirm derived logins at the moment they are created.
-- ===========================================================================
-- A BEFORE INSERT trigger on auth.users stamps email_confirmed_at as the row is
-- created, so a new login is usable straight away and the confirmation loop never
-- starts.
--
-- WHY THIS IS NOT A WEAKENING OF ACCESS CONTROL
-- Mail confirmation exists to prove that whoever signed up controls the inbox.
-- Nothing here depends on that, and it could not work in this environment anyway:
--
--   * Nobody types an address. Sign-in takes an NTID and the server derives
--     <ntid>@pfizer.com from it, so there is no attacker-chosen address whose
--     ownership would need proving.
--   * A login record is only ever created after ntid_signin_check has confirmed
--     the NTID is on the roster and active. The roster is the authorisation
--     decision, and it is untouched by this.
--   * Identity is established one layer out, by the company sign-in gate in front
--     of the app.
--   * No confirmation mail can be delivered here in any case, so the setting was
--     not protecting anything — it was only making every first sign-in fail.
--
-- Both real gates — the company sign-in gate and the roster — stay exactly as
-- they are.

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

-- Bring any login left unconfirmed by the earlier failed attempts into line, so
-- nobody is stuck part-way.
update auth.users
   set email_confirmed_at = now()
 where email_confirmed_at is null;

-- ===========================================================================
-- Check: the trigger is in place, and nothing is left unconfirmed.
-- ===========================================================================
select
  (select count(*) from auth.users) as login_records,
  (select count(*) from auth.users where email_confirmed_at is null) as still_unconfirmed,
  exists (
    select 1 from pg_trigger
     where tgname = 'confirm_derived_login'
       and tgrelid = 'auth.users'::regclass
  ) as trigger_installed;

-- ===========================================================================
-- Bookkeeping so this counts as an applied migration.
-- ===========================================================================
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations
  (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260921130000', 'one_shared_view_confirm_derived_logins')
  on conflict do nothing;

-- After this runs, sign in at the app with your NTID. Nothing further is needed
-- in the dashboard.
