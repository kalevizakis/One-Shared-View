-- One Shared View — table privileges for the signed-in role.
--
-- WHY THIS EXISTS
-- Postgres has two independent permission layers, and the app needs both:
--   1. GRANT  — may this role touch the table at all?
--   2. RLS    — which ROWS of it may this role see or change?
-- The initial migration defined the full RLS policy set but relied on Supabase's
-- default privileges to supply layer 1. Those defaults did not apply to these
-- tables, so every query from a signed-in user failed with
-- "permission denied for table profiles" (SQLSTATE 42501) before RLS was ever
-- consulted — which left the login screen spinning on "Please wait".
--
-- The grants below are deliberately narrow:
--   * Only `authenticated` is granted anything. `anon` gets nothing, so an
--     unauthenticated caller holding the publishable key still reads nothing.
--   * audit_events is SELECT-only even for authenticated, so the audit trail
--     stays append-only and tamper-proof from the app. Rows are written by the
--     security-definer audit trigger, which runs as the table owner and is
--     unaffected by these grants.
--   * Every existing RLS policy continues to do the row-level filtering; these
--     grants do not widen what any role can see.

grant usage on schema public to authenticated;

-- Readable and writable by signed-in users, subject to the RLS policies.
grant select, insert, update, delete on table
  public.profiles,
  public.portfolios,
  public.projects,
  public.milestones,
  public.reporting_cycles,
  public.project_updates,
  public.decisions,
  public.reminders,
  public.generated_reports
to authenticated;

-- Audit trail: read-only by design. No insert/update/delete, and the init
-- migration intentionally defines no write policy for it either.
grant select on table public.audit_events to authenticated;

-- RLS policies call helper functions (current_profile_id, current_role,
-- is_admin, is_lead_or_admin, can_edit_project) during evaluation; make the
-- execute privilege explicit rather than depending on PUBLIC defaults.
grant execute on all functions in schema public to authenticated;

-- Keep anything added later consistent without needing another migration.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;
