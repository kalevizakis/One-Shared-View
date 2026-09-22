-- ===========================================================================
-- One Shared View — FIX: table privileges for signed-in users
-- Paste this whole file into the Supabase SQL Editor and press Run.
-- Safe to re-run.
-- ===========================================================================

grant usage on schema public to authenticated;

-- Profile deletion is deliberately absent. Inactive roster entries are removed
-- only through delete_inactive_profile(), which checks every reference.
grant select, insert, update on table public.profiles to authenticated;
revoke delete on table public.profiles from anon, authenticated;

grant select, insert, update, delete on table
  public.portfolios,
  public.projects,
  public.milestones,
  public.reporting_cycles,
  public.project_updates,
  public.decisions,
  public.reminders,
  public.generated_reports
to authenticated;

grant select on table public.audit_events to authenticated;

grant execute on all functions in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations
  (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260918200000', 'one_shared_view_grants') on conflict do nothing;
