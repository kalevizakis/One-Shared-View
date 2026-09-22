-- ============================================================================
-- One Shared View — safely delete unused, inactive roster entries.
-- Run this in the Supabase SQL Editor (nonprod). Safe and re-runnable.
-- ============================================================================
-- This is migration 20260922090000 plus checks and a bookkeeping row.
-- It deletes NO people when applied.
--
-- After this is installed, /admin may delete a person only when:
--   * access is inactive;
--   * the row is not the caller or shared preview identity; and
--   * no portfolio, update, reminder, report, decision, milestone, or audit row
--     references the profile.
-- A profile-owned reminder email may be removed with the roster entry.
--
-- IMPORTANT ORDERING
-- If one-shared-view-remove-demo-roster.sql is still pending, run that cleanup
-- first. It deliberately relied on the original SET NULL/CASCADE behavior to
-- keep demo projects while removing their fabricated people. After this script,
-- referenced profiles are correctly blocked until their references are cleared
-- or reassigned.

-- Preserve business and audit history instead of silently nulling attribution
-- or cascading reminder records when a profile is removed.
alter table public.portfolios
  drop constraint if exists portfolios_lead_profile_id_fkey;
alter table public.portfolios
  add constraint portfolios_lead_profile_id_fkey
  foreign key (lead_profile_id) references public.profiles (id) on delete restrict;

alter table public.projects
  drop constraint if exists projects_owner_profile_id_fkey;
alter table public.projects
  add constraint projects_owner_profile_id_fkey
  foreign key (owner_profile_id) references public.profiles (id) on delete restrict;

alter table public.projects
  drop constraint if exists projects_lead_profile_id_fkey;
alter table public.projects
  add constraint projects_lead_profile_id_fkey
  foreign key (lead_profile_id) references public.profiles (id) on delete restrict;

alter table public.milestones
  drop constraint if exists milestones_owner_profile_id_fkey;
alter table public.milestones
  add constraint milestones_owner_profile_id_fkey
  foreign key (owner_profile_id) references public.profiles (id) on delete restrict;

alter table public.project_updates
  drop constraint if exists project_updates_author_profile_id_fkey;
alter table public.project_updates
  add constraint project_updates_author_profile_id_fkey
  foreign key (author_profile_id) references public.profiles (id) on delete restrict;

alter table public.project_updates
  drop constraint if exists project_updates_next_action_owner_profile_id_fkey;
alter table public.project_updates
  add constraint project_updates_next_action_owner_profile_id_fkey
  foreign key (next_action_owner_profile_id)
  references public.profiles (id) on delete restrict;

alter table public.decisions
  drop constraint if exists decisions_decision_owner_profile_id_fkey;
alter table public.decisions
  add constraint decisions_decision_owner_profile_id_fkey
  foreign key (decision_owner_profile_id)
  references public.profiles (id) on delete restrict;

alter table public.reminders
  drop constraint if exists reminders_recipient_profile_id_fkey;
alter table public.reminders
  add constraint reminders_recipient_profile_id_fkey
  foreign key (recipient_profile_id) references public.profiles (id) on delete restrict;

alter table public.reminders
  drop constraint if exists reminders_sent_by_profile_id_fkey;
alter table public.reminders
  add constraint reminders_sent_by_profile_id_fkey
  foreign key (sent_by_profile_id) references public.profiles (id) on delete restrict;

alter table public.generated_reports
  drop constraint if exists generated_reports_created_by_profile_id_fkey;
alter table public.generated_reports
  add constraint generated_reports_created_by_profile_id_fkey
  foreign key (created_by_profile_id) references public.profiles (id) on delete restrict;

alter table public.audit_events
  drop constraint if exists audit_events_actor_profile_id_fkey;
alter table public.audit_events
  add constraint audit_events_actor_profile_id_fkey
  foreign key (actor_profile_id) references public.profiles (id) on delete restrict;

create or replace function public.get_profile_deletion_eligibility()
returns table (
  profile_id uuid,
  can_delete boolean,
  blockers text[],
  reference_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_current_profile_id uuid := public.current_profile_id();
begin
  if not public.is_admin() then
    raise exception 'Only administrators can inspect roster deletion eligibility.'
      using errcode = '42501';
  end if;

  return query
  select
    profile.id as profile_id,
    (
      not profile.active
      and not profile.is_preview
      and profile.id is distinct from v_current_profile_id
      and totals.reference_count = 0
    ) as can_delete,
    array_remove(
      array[
        case when profile.active then 'Access is active' end,
        case when profile.is_preview then 'Shared preview identity' end,
        case
          when profile.id = v_current_profile_id then 'Your own roster entry'
        end,
        case
          when refs.portfolios > 0
            then format('Portfolio lead (%s)', refs.portfolios)
        end,
        case
          when refs.projects > 0
            then format('Projects (%s)', refs.projects)
        end,
        case
          when refs.milestones > 0
            then format('Milestones (%s)', refs.milestones)
        end,
        case
          when refs.updates > 0
            then format('Project updates (%s)', refs.updates)
        end,
        case
          when refs.decisions > 0
            then format('Decisions (%s)', refs.decisions)
        end,
        case
          when refs.reminders > 0
            then format('Reminders (%s)', refs.reminders)
        end,
        case
          when refs.reports > 0
            then format('Generated reports (%s)', refs.reports)
        end,
        case
          when refs.audit_events > 0
            then format('Audit history (%s)', refs.audit_events)
        end
      ]::text[],
      null
    ) as blockers,
    totals.reference_count
  from public.profiles profile
  cross join lateral (
    select
      (
        select count(*)::integer
          from public.portfolios item
         where item.lead_profile_id = profile.id
      ) as portfolios,
      (
        select count(*)::integer
          from public.projects item
         where item.owner_profile_id = profile.id
            or item.lead_profile_id = profile.id
      ) as projects,
      (
        select count(*)::integer
          from public.milestones item
         where item.owner_profile_id = profile.id
      ) as milestones,
      (
        select count(*)::integer
          from public.project_updates item
         where item.author_profile_id = profile.id
            or item.next_action_owner_profile_id = profile.id
      ) as updates,
      (
        select count(*)::integer
          from public.decisions item
         where item.decision_owner_profile_id = profile.id
      ) as decisions,
      (
        select count(*)::integer
          from public.reminders item
         where item.recipient_profile_id = profile.id
            or item.sent_by_profile_id = profile.id
      ) as reminders,
      (
        select count(*)::integer
          from public.generated_reports item
         where item.created_by_profile_id = profile.id
      ) as reports,
      (
        select count(*)::integer
          from public.audit_events item
         where item.actor_profile_id = profile.id
      ) as audit_events
  ) refs
  cross join lateral (
    select
      refs.portfolios
      + refs.projects
      + refs.milestones
      + refs.updates
      + refs.decisions
      + refs.reminders
      + refs.reports
      + refs.audit_events as reference_count
  ) totals
  order by profile.display_name;
end;
$$;

revoke all on function public.get_profile_deletion_eligibility()
  from public, anon;
grant execute on function public.get_profile_deletion_eligibility()
  to authenticated;

comment on function public.get_profile_deletion_eligibility() is
  'Administrator-only roster cleanup check. A profile is deletable only when inactive, non-preview, not the caller, and unreferenced by portfolio or audit data.';

create or replace function public.delete_inactive_profile(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_eligibility record;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can delete people.'
      using errcode = '42501';
  end if;

  select *
    into v_profile
    from public.profiles
   where id = p_profile_id
   for update;

  if not found then
    raise exception 'That person is no longer on the roster.'
      using errcode = 'P0002';
  end if;

  select eligibility.*
    into v_eligibility
    from public.get_profile_deletion_eligibility() eligibility
   where eligibility.profile_id = p_profile_id;

  if not coalesce(v_eligibility.can_delete, false) then
    raise exception 'This person cannot be deleted: %.',
      array_to_string(v_eligibility.blockers, '; ');
  end if;

  begin
    delete from public.profiles where id = p_profile_id;
  exception
    when foreign_key_violation then
      raise exception
        'This person was referenced by portfolio data before deletion completed. Refresh and try again.';
  end;

  return jsonb_build_object(
    'id', v_profile.id,
    'display_name', v_profile.display_name,
    'ntid', v_profile.ntid
  );
end;
$$;

revoke all on function public.delete_inactive_profile(uuid)
  from public, anon;
grant execute on function public.delete_inactive_profile(uuid)
  to authenticated;

comment on function public.delete_inactive_profile(uuid) is
  'Administrator-only atomic deletion for an inactive, unreferenced, non-preview profile. Locks and rechecks eligibility before deleting; profile_contacts may cascade, while all business/history foreign keys restrict.';

-- The guarded RPC is the only client deletion path.
drop policy if exists profiles_delete on public.profiles;
revoke delete on table public.profiles from anon, authenticated;

-- End data access immediately for deactivated/deleted roster identities, even
-- when an old Supabase Auth token remains valid.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (public.current_profile_id() is not null);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (
    public.is_admin()
    or (auth_user_id = auth.uid() and active)
  )
  with check (
    public.is_admin()
    or (auth_user_id = auth.uid() and active)
  );

drop policy if exists portfolios_select on public.portfolios;
create policy portfolios_select on public.portfolios
  for select to authenticated
  using (public.current_profile_id() is not null);

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (public.current_profile_id() is not null);

drop policy if exists milestones_select on public.milestones;
create policy milestones_select on public.milestones
  for select to authenticated
  using (public.current_profile_id() is not null);

drop policy if exists reporting_cycles_select on public.reporting_cycles;
create policy reporting_cycles_select on public.reporting_cycles
  for select to authenticated
  using (public.current_profile_id() is not null);

drop policy if exists project_updates_select on public.project_updates;
create policy project_updates_select on public.project_updates
  for select to authenticated
  using (
    public.current_profile_id() is not null
    and (
      status = 'submitted'
      or author_profile_id = public.current_profile_id()
      or public.can_edit_project(project_id)
    )
  );

drop policy if exists decisions_select on public.decisions;
create policy decisions_select on public.decisions
  for select to authenticated
  using (public.current_profile_id() is not null);

drop policy if exists generated_reports_select on public.generated_reports;
create policy generated_reports_select on public.generated_reports
  for select to authenticated
  using (public.current_profile_id() is not null);

-- ============================================================================
-- Checks
-- ============================================================================
-- Expect direct_profile_delete_granted = false and direct_delete_policy = false.
select
  has_table_privilege('authenticated', 'public.profiles', 'delete')
    as direct_profile_delete_granted,
  exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'profiles'
       and policyname = 'profiles_delete'
  ) as direct_delete_policy;

-- Expect both values = true.
select
  to_regprocedure('public.get_profile_deletion_eligibility()') is not null
    as eligibility_function_present,
  to_regprocedure('public.delete_inactive_profile(uuid)') is not null
    as guarded_delete_function_present;

-- Expect every delete action = RESTRICT (r). profile_contacts is intentionally
-- absent from this result because its profile-owned row may cascade.
select
  conrelid::regclass as referencing_table,
  conname,
  confdeltype = 'r' as delete_is_restrict
from pg_constraint
where contype = 'f'
  and confrelid = 'public.profiles'::regclass
  and (
    to_regclass('public.profile_contacts') is null
    or conrelid <> to_regclass('public.profile_contacts')
  )
order by conrelid::regclass::text, conname;

-- Bookkeeping so this counts as an applied migration.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations
  (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260922090000', 'one_shared_view_delete_inactive_profiles')
  on conflict do nothing;
