-- ============================================================================
-- One Shared View — move Impact from cycle updates to projects.
-- Run this in the Supabase SQL Editor (nonprod). Safe and re-runnable.
-- ============================================================================
-- This is migration 20260922110000 plus checks and a bookkeeping row.
--
-- Run one-shared-view-project-content.sql first: Impact is the last of the
-- three stable fields to leave project_updates, and this script reuses the
-- private archive table that script creates.

begin;

-- Present once one-shared-view-update-value-impact.sql has run. Created
-- defensively so this also applies where the update-level column never existed.
do $$
begin
  create type public.impact_level as enum ('high', 'medium', 'low');
exception
  when duplicate_object then null;
end
$$;

alter table public.projects
  add column if not exists impact public.impact_level;

-- Promote only submitted assessments to projects. Draft-only values remain
-- private and are archived below before the old update column is removed.
do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'project_updates'
       and column_name = 'impact'
  ) then
    execute $sql$
      update public.projects project
         set impact = (
           select update_row.impact
             from public.project_updates update_row
             join public.reporting_cycles cycle
               on cycle.id = update_row.reporting_cycle_id
            where update_row.project_id = project.id
              and update_row.status = 'submitted'
              and update_row.impact is not null
            order by cycle.due_at desc,
                     update_row.submitted_at desc nulls last,
                     update_row.updated_at desc,
                     update_row.id desc
            limit 1
         )
       where project.impact is null
         and exists (
           select 1
             from public.project_updates update_row
            where update_row.project_id = project.id
              and update_row.status = 'submitted'
              and update_row.impact is not null
         )
    $sql$;
  end if;
end
$$;

comment on column public.projects.impact is
  'Stable owner-assessed project impact: high, medium, or low.';

-- Keep the removed source values without exposing them through the public API.
create schema if not exists one_shared_view_private;
revoke all on schema one_shared_view_private from public, anon, authenticated;

create table if not exists one_shared_view_private.project_update_content_legacy (
  project_update_id uuid primary key,
  project_id uuid not null,
  reporting_cycle_id uuid not null,
  executive_summary text,
  expected_value text,
  archived_at timestamptz not null default now()
);

-- Archived as text so the record survives any later change to the enum.
alter table one_shared_view_private.project_update_content_legacy
  add column if not exists impact text;

revoke all on all tables in schema one_shared_view_private
  from public, anon, authenticated;

do $$
declare
  v_missing integer;
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'project_updates'
       and column_name = 'impact'
  ) then
    execute $sql$
      insert into one_shared_view_private.project_update_content_legacy (
        project_update_id, project_id, reporting_cycle_id, impact, archived_at
      )
      select id, project_id, reporting_cycle_id, impact::text, now()
        from public.project_updates
      on conflict (project_update_id) do update
        set project_id = excluded.project_id,
            reporting_cycle_id = excluded.reporting_cycle_id,
            impact = excluded.impact,
            archived_at = excluded.archived_at
    $sql$;

    execute $sql$
      select count(*)::integer
        from public.project_updates update_row
        left join one_shared_view_private.project_update_content_legacy archived
          on archived.project_update_id = update_row.id
       where archived.project_update_id is null
    $sql$
    into v_missing;

    if v_missing <> 0 then
      raise exception 'Project update impact archive is incomplete (% rows missing).',
        v_missing;
    end if;
  end if;
end
$$;

alter table public.project_updates
  drop column if exists impact;

commit;

-- Make the new project column visible to PostgREST immediately.
notify pgrst, 'reload schema';

-- ============================================================================
-- Checks
-- ============================================================================
-- Expect all three values to be true.
select
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'projects'
       and column_name = 'impact'
  ) as project_impact_present,
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'project_updates'
       and column_name = 'impact'
  ) as update_impact_removed,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'one_shared_view_private'
       and table_name = 'project_update_content_legacy'
       and column_name = 'impact'
  ) as legacy_impact_archived;

-- Review migrated values. Projects without a prior submitted impact
-- legitimately remain null and an administrator sets them in /admin.
select name, impact, expected_value
  from public.projects
 order by name;

-- Expect browser_access = false.
select
  has_table_privilege(
    'authenticated',
    'one_shared_view_private.project_update_content_legacy',
    'select'
  ) as update_archive_browser_access;

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations
  (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260922110000', 'one_shared_view_project_impact')
  on conflict do nothing;
