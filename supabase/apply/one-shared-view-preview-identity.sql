-- One Shared View — "Preview the solution" read-only identity.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL Editor (nonprod) and
-- run it once. It is re-runnable, so running it twice is harmless.
--
-- WHAT IT DOES
--   1. Adds profiles.is_preview.
--   2. Inserts ONE shared, powerless roster row: ntid 'preview', role 'exec'.
--   3. Adds a single SELECT-only policy so the audit screen has content.
--   4. Hardens the roster guard so the preview treatment cannot be switched off.
--
-- It contains NO personal data, adds NO grant to `anon`, and adds NO write
-- policy anywhere. Read the header comments in the body below before changing
-- any of it — several of them exist specifically to stop a well-meaning "fix"
-- turning the read-only preview into a write-capable shared account.

-- One Shared View — the "Preview the solution" identity.
--
-- WHAT THIS ADDS
-- A single, shared, powerless roster row that lets a Pfizer colleague review the
-- working solution without being on the CMO Digital / MRS roster. It holds no
-- personal data, so this file is safe to commit.
--
-- ===========================================================================
-- WHY THERE IS NO WRITE POLICY HERE — READ BEFORE "FIXING" ANYTHING
-- ===========================================================================
-- The preview row is role 'exec'. It owns no project, leads no portfolio, and is
-- not an administrator. Every write policy in this schema is gated on one of
-- can_edit_project(), owns_project(), is_lead_or_admin() or is_admin(), and all
-- four evaluate to FALSE for such a profile. Read-only is therefore enforced by
-- the DATABASE, not by disabled buttons in the UI — a crafted Server Action POST
-- or a direct REST call carrying a preview session token is refused just the same.
--
-- Consequences to respect:
--
--   * DO NOT promote this row to 'lead' or 'admin' to make some screen look
--     fuller. 'lead' unlocks report generation, narrative editing and reminder
--     sending; 'admin' unlocks everything. Either change silently converts a
--     read-only preview into a write-capable shared account with no per-visitor
--     accountability.
--   * DO NOT add an INSERT/UPDATE/DELETE policy naming the preview identity.
--   * The one SELECT policy below is the deliberate exception, and it is reads
--     only. It exists because audit_events_select requires is_lead_or_admin(),
--     so without it the audit screen would render an empty table.
--
-- ===========================================================================
-- WHY `anon` IS GRANTED NOTHING (unchanged by this migration)
-- ===========================================================================
-- The publishable key ships inside browser JavaScript. Granting `anon` any table
-- access would let anyone who extracted that key query real portfolio data
-- directly, bypassing both this application and the platform's company sign-in
-- gate. 20260918200000_one_shared_view_grants.sql documents that `anon` gets
-- nothing; this migration keeps it that way and adds no grant of any kind.
-- There is likewise no service-role key in this project — RLS is the entire
-- server-side security model.

-- ---------------------------------------------------------------------------
-- 1. A dedicated flag, not a magic NTID string.
-- ---------------------------------------------------------------------------
-- Application code must be able to ask "is this the preview identity?" without
-- string-matching ntid = 'preview'. A future roster row could legitimately
-- collide with that string, and a collision would hand a real colleague the
-- preview's read-only treatment (or worse, the reverse).
alter table public.profiles
  add column if not exists is_preview boolean not null default false;

comment on column public.profiles.is_preview is
  'True for the single shared read-only preview identity. Drives the preview banner, the read-only UI and the server-side write guard. Never string-match ntid = ''preview'' instead of reading this.';

-- ---------------------------------------------------------------------------
-- 2. The preview roster row.
-- ---------------------------------------------------------------------------
-- 'preview' satisfies the profiles_ntid_format check (^[a-z0-9]{3,20}$).
-- Written with on conflict so this migration is safely re-runnable, and under
-- the transaction-local linking flag because guard_profile_changes would
-- otherwise refuse the role/active/ntid values on a re-run (there is no admin
-- session when a migration runs).
do $$
begin
  perform set_config('one_shared_view.linking', 'on', true);

  insert into public.profiles (ntid, display_name, job_title, role, active, is_preview)
  values (
    'preview',
    'Preview (read-only)',
    'Solution preview — read-only access',
    'exec',
    true,
    true
  )
  on conflict (ntid) do update
     set display_name = excluded.display_name,
         job_title    = excluded.job_title,
         role         = excluded.role,
         active       = excluded.active,
         is_preview   = excluded.is_preview,
         updated_at   = now();

  perform set_config('one_shared_view.linking', 'off', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Audit trail visibility — reads only.
-- ---------------------------------------------------------------------------
-- audit_events_select requires is_lead_or_admin(), which the preview identity is
-- not and must not become. This narrow additional SELECT policy gives the audit
-- screen content without unlocking a single write anywhere else.
--
-- The trail stays append-only and unforgeable regardless: audit_events has no
-- UPDATE and no DELETE policy at all, and `authenticated` holds only SELECT on
-- the table, so UPDATE/DELETE are refused at the privilege layer (42501) before
-- RLS is even consulted. Rows are written exclusively by the security-definer
-- audit trigger. Because the preview identity cannot write to anything, it
-- generates no audit rows of its own — nothing is ever attributed to it.
drop policy if exists audit_events_select_preview on public.audit_events;

create policy audit_events_select_preview on public.audit_events
  for select to authenticated
  using (
    exists (
      select 1
        from public.profiles p
       where p.auth_user_id = auth.uid()
         and p.is_preview
         and p.active
    )
  );

comment on policy audit_events_select_preview on public.audit_events is
  'Lets the shared read-only preview identity READ the audit trail. Reads only — audit_events has no update/delete policy and authenticated holds select only.';

-- Deliberately NOT done: a matching reminders_select policy. reminders_select
-- requires is_lead_or_admin() or own-recipient, so the preview identity reads no
-- reminder rows. The reporting-readiness tile degrades correctly — it renders
-- its percentage, its missing-owner list and its disabled reminder buttons from
-- project and cycle data, and an empty reminders array only means no owner shows
-- as "reminded". Nothing blanks out, so nothing extra is granted here.

-- ---------------------------------------------------------------------------
-- 4. Close the self-edit gap on the preview row.
-- ---------------------------------------------------------------------------
-- profiles_update permits `auth_user_id = auth.uid()`, i.e. any session may edit
-- its OWN roster row (that is how a person maintains their display name), and
-- guard_profile_changes only defends role, active and ntid. Left alone, a
-- preview visitor holding a session token could therefore set is_preview =
-- false on the shared row and switch the whole preview treatment off for
-- everybody: banner gone, read-only UI gone, and the server-side write guard
-- disarmed. The role would still be 'exec', so RLS would still refuse every
-- write — but the app would stop telling the truth about what it is.
--
-- Two additions to the existing guard, both narrow:
--   a. is_preview itself is administrator-only, like role/active/ntid.
--   b. a preview session may not modify any roster row, including its own.
-- The transaction-local linking flag is still honoured first, so sign-in can
-- attach the preview session to this row exactly as it does for a real NTID.
create or replace function public.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Set only by the sign-in linking path, and only for that transaction. This is
  -- how a session gets attached to its roster entry before it could be an admin.
  if coalesce(current_setting('one_shared_view.linking', true), '') = 'on' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  -- (b) The shared preview identity is read-only, and that includes the roster.
  if exists (
    select 1
      from public.profiles p
     where p.auth_user_id = auth.uid()
       and p.is_preview
  ) then
    raise exception 'This is a read-only preview. Sign in with your NTID to make changes.';
  end if;

  -- (a) is_preview joins role/active/ntid as an administrator-only field, so the
  --     preview treatment cannot be switched off from a normal session either.
  if new.role is distinct from old.role
     or new.active is distinct from old.active
     or new.ntid is distinct from old.ntid
     or new.is_preview is distinct from old.is_preview then
    raise exception 'Only an administrator can change roles, NTIDs, or access.';
  end if;

  return new;
end;
$$;

comment on function public.guard_profile_changes() is
  'Roster-change guard. Administrator-only fields: role, active, ntid, is_preview. The shared read-only preview identity may not modify any roster row at all. The transaction-local one_shared_view.linking flag lets sign-in attach a session to its own entry.';

-- ===========================================================================
-- Check: the flag, the row, the policy and the guard are all in place.
-- ===========================================================================
select
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'profiles'
       and column_name  = 'is_preview'
  ) as is_preview_column,
  (select role::text from public.profiles where ntid = 'preview') as preview_role,
  (select is_preview from public.profiles where ntid = 'preview') as preview_flagged,
  (select active     from public.profiles where ntid = 'preview') as preview_active,
  exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'audit_events'
       and policyname = 'audit_events_select_preview'
  ) as audit_read_policy,
  -- Must be 1 — and 1 is correct, not a problem. That one row is the deliberate
  -- audit_events_insert policy from 20260921093000, which exists so the
  -- security-definer audit trigger can append rows. It is contained by the grant
  -- layer: `authenticated` holds SELECT only on audit_events, so no client can
  -- insert through it. Anything ABOVE 1 means a write policy was added and the
  -- trail is no longer append-only.
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'audit_events'
      and cmd <> 'SELECT') as audit_write_policies,
  -- Must be 0: `anon` still reads nothing anywhere. This is the guarantee that
  -- the publishable key shipped in browser JS cannot read real data directly.
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon') as anon_grants;

-- Expected: is_preview_column = true, preview_role = 'exec',
-- preview_flagged = true, preview_active = true, audit_read_policy = true,
-- audit_write_policies = 1 (the audit trigger's insert policy — see above),
-- anon_grants = 0.

-- ===========================================================================
-- Bookkeeping so this counts as an applied migration.
-- ===========================================================================
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations
  (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260921150000', 'one_shared_view_preview_identity')
  on conflict do nothing;

-- After this runs, the "Preview the solution" button on the sign-in screen
-- works. Nothing further is needed in the dashboard.
