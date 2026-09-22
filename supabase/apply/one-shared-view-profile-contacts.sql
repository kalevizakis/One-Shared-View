-- ============================================================================
-- One Shared View — verified corporate contact addresses for local email reminders
-- Run this in the Supabase SQL Editor (nonprod). Safe and re-runnable.
-- ============================================================================
-- This is migration 20260921170000 plus a bookkeeping row at the end.
-- It contains NO personal data rows. Admins enter addresses through /admin.
--
-- WHY A SEPARATE TABLE
--   profiles is readable by every signed-in session (including the shared
--   preview identity). Putting email on that row would expose corporate
--   addresses to anyone who can open the app. Contact addresses live here
--   instead, behind lead/admin SELECT and admin-only write policies.
--
-- WHAT THIS ENABLES
--   The Remind button opens a pre-filled mailto: draft in the sender's local
--   email client. Delivery is confirmed by the sender clicking "Mark sent" —
--   the app cannot prove the OS client actually sent the mail.

create table if not exists public.profile_contacts (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_contacts_email_format check (
    email ~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$'
  )
);

comment on table public.profile_contacts is
  'Verified corporate email addresses for roster members. One-to-one with profiles. Readable by leads and administrators only; writable by administrators only. Kept off profiles so the broadly readable roster never carries email PII.';

comment on column public.profile_contacts.email is
  'Normalized lowercase corporate address used to pre-fill local mailto: drafts.';

create or replace function public.normalize_profile_contact_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(new.email));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profile_contacts_normalize on public.profile_contacts;
create trigger profile_contacts_normalize
  before insert or update of email on public.profile_contacts
  for each row execute function public.normalize_profile_contact_email();

drop trigger if exists profile_contacts_touch on public.profile_contacts;
create trigger profile_contacts_touch
  before update on public.profile_contacts
  for each row execute function public.touch_updated_at();

drop trigger if exists profile_contacts_audit on public.profile_contacts;
create trigger profile_contacts_audit
  after insert or update or delete on public.profile_contacts
  for each row execute function public.audit_trigger();

alter table public.profile_contacts enable row level security;

grant select, insert, update, delete on table public.profile_contacts to authenticated;

drop policy if exists profile_contacts_select on public.profile_contacts;
create policy profile_contacts_select on public.profile_contacts
  for select to authenticated
  using (public.is_lead_or_admin());

drop policy if exists profile_contacts_insert on public.profile_contacts;
create policy profile_contacts_insert on public.profile_contacts
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists profile_contacts_update on public.profile_contacts;
create policy profile_contacts_update on public.profile_contacts
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists profile_contacts_delete on public.profile_contacts;
create policy profile_contacts_delete on public.profile_contacts
  for delete to authenticated
  using (public.is_admin());

comment on policy profile_contacts_select on public.profile_contacts is
  'Leads and administrators may read contact emails for reminder drafts. Preview (role exec) and ordinary owners cannot.';

comment on policy profile_contacts_insert on public.profile_contacts is
  'Only administrators may add a contact address.';

comment on policy profile_contacts_update on public.profile_contacts is
  'Only administrators may change a contact address.';

comment on policy profile_contacts_delete on public.profile_contacts is
  'Only administrators may remove a contact address.';

-- Bookkeeping so this counts as an applied migration.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations
  (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260921170000', 'one_shared_view_profile_contacts')
  on conflict do nothing;
