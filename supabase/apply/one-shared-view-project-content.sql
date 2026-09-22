-- ============================================================================
-- One Shared View — move executive summary and expected value to projects.
-- Run this in the Supabase SQL Editor (nonprod). Safe and re-runnable.
-- ============================================================================
-- This is migration 20260922100000 plus checks and a bookkeeping row.
--
-- Apply one-shared-view-update-value-impact.sql first so the update-level
-- Impact field remains available after Expected value moves.

begin;

alter table public.projects
  add column if not exists executive_summary text,
  add column if not exists expected_value text;

-- Promote only submitted content to projects. Draft-only content remains
-- private and is archived below before the old update columns are removed.
do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'project_updates'
       and column_name = 'executive_summary'
  ) then
    execute $sql$
      update public.projects project
         set executive_summary = (
           select update_row.executive_summary
             from public.project_updates update_row
             join public.reporting_cycles cycle
               on cycle.id = update_row.reporting_cycle_id
            where update_row.project_id = project.id
              and update_row.status = 'submitted'
              and nullif(btrim(update_row.executive_summary), '') is not null
            order by cycle.due_at desc,
                     update_row.submitted_at desc nulls last,
                     update_row.updated_at desc,
                     update_row.id desc
            limit 1
         )
       where nullif(btrim(project.executive_summary), '') is null
         and exists (
           select 1
             from public.project_updates update_row
            where update_row.project_id = project.id
              and update_row.status = 'submitted'
              and nullif(btrim(update_row.executive_summary), '') is not null
         )
    $sql$;
  end if;
end
$$;

-- Use the removed description only when no submitted summary is available.
do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'projects'
       and column_name = 'description'
  ) then
    execute $sql$
      update public.projects
         set executive_summary = description
       where nullif(btrim(executive_summary), '') is null
         and nullif(btrim(description), '') is not null
    $sql$;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'project_updates'
       and column_name = 'expected_value'
  ) then
    execute $sql$
      update public.projects project
         set expected_value = (
           select update_row.expected_value
             from public.project_updates update_row
             join public.reporting_cycles cycle
               on cycle.id = update_row.reporting_cycle_id
            where update_row.project_id = project.id
              and update_row.status = 'submitted'
              and nullif(btrim(update_row.expected_value), '') is not null
            order by cycle.due_at desc,
                     update_row.submitted_at desc nulls last,
                     update_row.updated_at desc,
                     update_row.id desc
            limit 1
         )
       where nullif(btrim(project.expected_value), '') is null
         and exists (
           select 1
             from public.project_updates update_row
            where update_row.project_id = project.id
              and update_row.status = 'submitted'
              and nullif(btrim(update_row.expected_value), '') is not null
         )
    $sql$;
  end if;
end
$$;

comment on column public.projects.executive_summary is
  'Stable leadership summary for the project, independent of reporting cycle.';
comment on column public.projects.expected_value is
  'Stable value the project is expected to deliver.';

-- Keep the removed source values without exposing them through the public API.
create schema if not exists one_shared_view_private;
revoke all on schema one_shared_view_private from public, anon, authenticated;

create table if not exists one_shared_view_private.project_content_legacy (
  project_id uuid primary key,
  description text,
  archived_at timestamptz not null default now()
);

create table if not exists one_shared_view_private.project_update_content_legacy (
  project_update_id uuid primary key,
  project_id uuid not null,
  reporting_cycle_id uuid not null,
  executive_summary text,
  expected_value text,
  archived_at timestamptz not null default now()
);

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
       and table_name = 'projects'
       and column_name = 'description'
  ) then
    execute $sql$
      insert into one_shared_view_private.project_content_legacy (
        project_id, description, archived_at
      )
      select id, description, now()
        from public.projects
      on conflict (project_id) do update
        set description = excluded.description,
            archived_at = excluded.archived_at
    $sql$;

    execute $sql$
      select count(*)::integer
        from public.projects project
        left join one_shared_view_private.project_content_legacy archived
          on archived.project_id = project.id
       where archived.project_id is null
    $sql$
    into v_missing;

    if v_missing <> 0 then
      raise exception 'Project description archive is incomplete (% rows missing).',
        v_missing;
    end if;
  end if;

  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'project_updates'
       and column_name = 'executive_summary'
  ) then
    if exists (
      select 1
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'project_updates'
         and column_name = 'expected_value'
    ) then
      execute $sql$
        insert into one_shared_view_private.project_update_content_legacy (
          project_update_id, project_id, reporting_cycle_id,
          executive_summary, expected_value, archived_at
        )
        select id, project_id, reporting_cycle_id,
               executive_summary, expected_value, now()
          from public.project_updates
        on conflict (project_update_id) do update
          set project_id = excluded.project_id,
              reporting_cycle_id = excluded.reporting_cycle_id,
              executive_summary = excluded.executive_summary,
              expected_value = excluded.expected_value,
              archived_at = excluded.archived_at
      $sql$;
    else
      execute $sql$
        insert into one_shared_view_private.project_update_content_legacy (
          project_update_id, project_id, reporting_cycle_id,
          executive_summary, expected_value, archived_at
        )
        select id, project_id, reporting_cycle_id,
               executive_summary, null, now()
          from public.project_updates
        on conflict (project_update_id) do update
          set project_id = excluded.project_id,
              reporting_cycle_id = excluded.reporting_cycle_id,
              executive_summary = excluded.executive_summary,
              expected_value = excluded.expected_value,
              archived_at = excluded.archived_at
      $sql$;
    end if;

    execute $sql$
      select count(*)::integer
        from public.project_updates update_row
        left join one_shared_view_private.project_update_content_legacy archived
          on archived.project_update_id = update_row.id
       where archived.project_update_id is null
    $sql$
    into v_missing;

    if v_missing <> 0 then
      raise exception 'Project update content archive is incomplete (% rows missing).',
        v_missing;
    end if;
  end if;
end
$$;

create or replace function public.validate_project_update()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'submitted' then
    if new.health in ('at_risk', 'blocked') then
      if coalesce(trim(new.blocker_or_risk), '') = '' then
        raise exception 'A blocker or risk is required when health is At risk or Blocked.';
      end if;
      if coalesce(trim(new.leadership_ask), '') = '' then
        raise exception 'A leadership ask is required when health is At risk or Blocked.';
      end if;
      if coalesce(trim(new.health_change_reason), '') = '' then
        raise exception 'A reason is required when health is At risk or Blocked.';
      end if;
    end if;
    if new.health = 'blocked' then
      if coalesce(trim(new.next_action), '') = '' then
        raise exception 'A next action is required when a project is Blocked.';
      end if;
      if new.next_action_owner_profile_id is null then
        raise exception 'An accountable owner for the next action is required when a project is Blocked.';
      end if;
    end if;
    if new.submitted_at is null then
      new.submitted_at := now();
    end if;
  end if;
  return new;
end;
$$;

alter table public.projects
  drop column if exists description;

alter table public.project_updates
  drop column if exists executive_summary,
  drop column if exists expected_value;

commit;

-- Make the new project columns visible to PostgREST immediately.
notify pgrst, 'reload schema';

-- ============================================================================
-- Checks
-- ============================================================================
-- Expect all four values to be true.
select
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'projects'
       and column_name = 'executive_summary'
  ) as project_summary_present,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'projects'
       and column_name = 'expected_value'
  ) as project_value_present,
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'projects'
       and column_name = 'description'
  ) as project_description_removed,
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'project_updates'
       and column_name in ('executive_summary', 'expected_value')
  ) as update_content_removed;

-- Review migrated values. Projects without a prior submitted summary and
-- without a description legitimately remain null.
select name, executive_summary, expected_value
  from public.projects
 order by name;

-- Expect browser_access = false for both archive tables.
select
  has_table_privilege(
    'authenticated',
    'one_shared_view_private.project_content_legacy',
    'select'
  ) as project_archive_browser_access,
  has_table_privilege(
    'authenticated',
    'one_shared_view_private.project_update_content_legacy',
    'select'
  ) as update_archive_browser_access;

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations
  (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260922100000', 'one_shared_view_project_content')
  on conflict do nothing;
