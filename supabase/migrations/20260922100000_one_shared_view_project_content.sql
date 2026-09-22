-- Move stable project content out of cycle updates.
--
-- projects.description is replaced by projects.executive_summary, while
-- expected_value moves from project_updates to projects. Only submitted update
-- content is promoted to the broadly readable project row; draft-only content
-- is archived without being exposed.

begin;

alter table public.projects
  add column if not exists executive_summary text,
  add column if not exists expected_value text;

-- Prefer the most recent nonblank submitted summary. Ordering by cycle first
-- keeps the migration deterministic even when rows were edited out of order.
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

-- A legacy project description is the fallback only when no submitted
-- executive summary exists.
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

-- Expected value is independent of summary, so migrate its latest nonblank
-- submitted value separately.
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

-- Preserve every legacy value before contracting the public schema. The
-- private schema is not exposed through the Supabase API and grants are
-- explicitly revoked from browser roles.
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

-- Executive summary is no longer part of update submission validation.
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
