-- Move owner-assessed impact from cycle updates to the project.
--
-- Impact describes the project, not the week. Holding it on project_updates
-- meant it read as blank on every project whose owner had not yet reported, and
-- the same assessment had to be restated each cycle. It now sits on projects
-- next to executive_summary and expected_value.
--
-- Only submitted values are promoted to the broadly readable project row;
-- draft-only values are archived without being exposed.

begin;

-- The enum already exists once 20260921180000 has run. Creating it defensively
-- keeps this migration valid against a database that never carried the
-- update-level column.
do $$
begin
  create type public.impact_level as enum ('high', 'medium', 'low');
exception
  when duplicate_object then null;
end
$$;

alter table public.projects
  add column if not exists impact public.impact_level;

-- Prefer the most recent submitted assessment. Ordering by cycle first keeps
-- the migration deterministic even when rows were edited out of order.
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

-- Preserve every update-level value, drafts included, before the public column
-- is dropped. The private schema is not exposed through the Supabase API and
-- grants are explicitly revoked from browser roles.
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
