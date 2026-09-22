-- ============================================================================
-- One Shared View — safely delete older reporting cycles.
-- Run this in the Supabase SQL Editor (nonprod). Safe and re-runnable.
-- ============================================================================
-- This is migration 20260922080000 plus checks and a bookkeeping row.
-- It contains NO personal data and deletes NO cycle data when applied.
--
-- A later administrator action may delete a locked/closed historical cycle.
-- That delete cascades to its project updates, reminders, and generated reports;
-- decisions remain but lose their source-update link.

create or replace function public.can_delete_reporting_cycle(
  p_portfolio_id uuid,
  p_status public.cycle_status,
  p_due_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
     and p_status in ('locked', 'closed')
     and exists (
       select 1
         from public.reporting_cycles newer
        where newer.portfolio_id = p_portfolio_id
          and newer.due_at > p_due_at
     );
$$;

revoke all on function public.can_delete_reporting_cycle(
  uuid,
  public.cycle_status,
  timestamptz
) from public, anon;
grant execute on function public.can_delete_reporting_cycle(
  uuid,
  public.cycle_status,
  timestamptz
) to authenticated;

comment on function public.can_delete_reporting_cycle(
  uuid,
  public.cycle_status,
  timestamptz
) is
  'RLS predicate for destructive reporting-cycle cleanup. Only administrators may delete a locked or closed cycle, and only when a strictly newer cycle remains in the same portfolio.';

-- Replace the broad FOR ALL policy. Leads keep insert/update access, while
-- deletion is limited to eligible rows and administrators.
drop policy if exists reporting_cycles_write on public.reporting_cycles;
drop policy if exists reporting_cycles_insert on public.reporting_cycles;
drop policy if exists reporting_cycles_update on public.reporting_cycles;
drop policy if exists reporting_cycles_delete on public.reporting_cycles;

create policy reporting_cycles_insert on public.reporting_cycles
  for insert to authenticated
  with check (public.is_lead_or_admin());

create policy reporting_cycles_update on public.reporting_cycles
  for update to authenticated
  using (public.is_lead_or_admin())
  with check (public.is_lead_or_admin());

create policy reporting_cycles_delete on public.reporting_cycles
  for delete to authenticated
  using (
    public.can_delete_reporting_cycle(portfolio_id, status, due_at)
  );

-- Keep denormalized project health traceable after a cycle cascade removes the
-- update that supplied it.
create or replace function public.refresh_project_health_after_update_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_health public.health_status;
begin
  if not exists (
    select 1 from public.projects where id = old.project_id
  ) then
    return old;
  end if;

  select update_row.health
    into v_health
    from public.project_updates update_row
    join public.reporting_cycles cycle
      on cycle.id = update_row.reporting_cycle_id
   where update_row.project_id = old.project_id
     and update_row.status = 'submitted'
   order by
     cycle.due_at desc,
     update_row.submitted_at desc nulls last,
     update_row.updated_at desc,
     update_row.id desc
   limit 1;

  update public.projects
     set current_health = v_health,
         updated_at = now()
   where id = old.project_id
     and current_health is distinct from v_health;

  return old;
end;
$$;

revoke all on function public.refresh_project_health_after_update_delete()
  from public, anon, authenticated;

drop trigger if exists project_updates_refresh_health_after_delete
  on public.project_updates;
create trigger project_updates_refresh_health_after_delete
  after delete on public.project_updates
  for each row execute function public.refresh_project_health_after_update_delete();

comment on function public.refresh_project_health_after_update_delete() is
  'Recomputes projects.current_health from the newest remaining submitted cycle after a project update is deleted. Skips project-level cascades whose parent project is already gone.';

-- ============================================================================
-- Checks
-- ============================================================================
-- Expect old_policy_removed = true and each new policy count = 1.
select
  count(*) filter (where policyname = 'reporting_cycles_write') = 0
    as old_policy_removed,
  count(*) filter (where policyname = 'reporting_cycles_insert') = 1
    as insert_policy_present,
  count(*) filter (where policyname = 'reporting_cycles_update') = 1
    as update_policy_present,
  count(*) filter (where policyname = 'reporting_cycles_delete') = 1
    as delete_policy_present
from pg_policies
where schemaname = 'public'
  and tablename = 'reporting_cycles';

-- Expect health_refresh_trigger_present = true.
select exists (
  select 1
    from pg_trigger
   where tgrelid = 'public.project_updates'::regclass
     and tgname = 'project_updates_refresh_health_after_delete'
     and not tgisinternal
) as health_refresh_trigger_present;

-- Bookkeeping so this counts as an applied migration.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations
  (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260922080000', 'one_shared_view_delete_reporting_cycles')
  on conflict do nothing;
