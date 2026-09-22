-- ===========================================================================
-- One Shared View — full database setup
-- Paste this whole file into the Supabase SQL Editor and press Run.
-- Safe to re-run: the migration history table prevents double-application
-- bookkeeping, and the seed block is idempotent.
-- ===========================================================================

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations
  (version text primary key, statements text[], name text);

-- ---------------------------------------------------------------------------
-- Migration 20260918120000_one_shared_view_init
-- ---------------------------------------------------------------------------
-- One Shared View — initial schema
-- Single source of truth for weekly project status reporting.
-- Identity is NTID-based: profiles is the CMO Digital LT roster, keyed by NTID,
-- and each roster row is linked to a Supabase auth user on first sign-in.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('owner', 'lead', 'exec', 'admin');
create type public.lifecycle_status as enum ('proposed', 'active', 'on_hold', 'complete', 'cancelled');
create type public.health_status as enum ('on_track', 'at_risk', 'blocked');
create type public.reporting_cadence as enum ('weekly', 'monthly');
create type public.cycle_status as enum ('upcoming', 'open', 'locked', 'closed');
create type public.update_status as enum ('draft', 'submitted');
create type public.milestone_status as enum ('planned', 'in_progress', 'complete', 'missed');
create type public.decision_status as enum ('open', 'resolved', 'cancelled');

-- ---------------------------------------------------------------------------
-- Roster / people
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  ntid text not null unique,
  display_name text not null,
  -- No e-mail column by design: the sign-in address is derived from the NTID,
  -- so storing it again would duplicate personal data for no functional gain.
  job_title text,
  role public.user_role not null default 'owner',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_ntid_format check (ntid ~ '^[a-z0-9]{3,20}$')
);

comment on table public.profiles is 'CMO Digital LT roster. NTID is the enterprise identity; auth_user_id links to the Supabase auth user after first sign-in.';

create index profiles_role_idx on public.profiles (role) where active;

-- ---------------------------------------------------------------------------
-- Portfolios & projects
-- ---------------------------------------------------------------------------
create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  lead_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  portfolio_id uuid not null references public.portfolios (id) on delete restrict,
  owner_profile_id uuid references public.profiles (id) on delete set null,
  lead_profile_id uuid references public.profiles (id) on delete set null,
  lifecycle_status public.lifecycle_status not null default 'active',
  current_health public.health_status,
  reporting_cadence public.reporting_cadence not null default 'weekly',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portfolio_id, name)
);

create index projects_owner_idx on public.projects (owner_profile_id);
create index projects_portfolio_idx on public.projects (portfolio_id);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  target_date date not null,
  status public.milestone_status not null default 'planned',
  owner_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index milestones_project_idx on public.milestones (project_id, target_date);

-- ---------------------------------------------------------------------------
-- Reporting cycles
-- ---------------------------------------------------------------------------
create table public.reporting_cycles (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  name text not null,
  cadence public.reporting_cadence not null default 'weekly',
  starts_at timestamptz not null,
  due_at timestamptz not null,
  closes_at timestamptz not null,
  status public.cycle_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portfolio_id, name),
  constraint cycle_dates_ordered check (starts_at < due_at and due_at <= closes_at)
);

create index reporting_cycles_portfolio_idx on public.reporting_cycles (portfolio_id, due_at desc);

-- ---------------------------------------------------------------------------
-- Weekly updates
-- ---------------------------------------------------------------------------
create table public.project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  reporting_cycle_id uuid not null references public.reporting_cycles (id) on delete cascade,
  author_profile_id uuid references public.profiles (id) on delete set null,
  health public.health_status not null,
  executive_summary text not null,
  accomplishments text,
  next_steps text,
  blocker_or_risk text,
  leadership_ask text,
  health_change_reason text,
  next_action text,
  next_action_owner_profile_id uuid references public.profiles (id) on delete set null,
  next_milestone_name text,
  next_milestone_date date,
  status public.update_status not null default 'draft',
  submitted_at timestamptz,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, reporting_cycle_id)
);

create index project_updates_cycle_idx on public.project_updates (reporting_cycle_id, status);
create index project_updates_project_idx on public.project_updates (project_id, created_at desc);

-- Health-dependent validation lives in the database as well as the UI, so a
-- bad record cannot be written by any client.
create or replace function public.validate_project_update()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'submitted' then
    if coalesce(trim(new.executive_summary), '') = '' then
      raise exception 'Executive summary is required to submit an update.';
    end if;
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

create trigger project_updates_validate
  before insert or update on public.project_updates
  for each row execute function public.validate_project_update();

-- Submitted updates drive the project's current health without manual re-entry.
create or replace function public.sync_project_health()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'submitted' then
    update public.projects
       set current_health = new.health,
           updated_at = now()
     where id = new.project_id;
  end if;
  return new;
end;
$$;

create trigger project_updates_sync_health
  after insert or update of status, health on public.project_updates
  for each row execute function public.sync_project_health();

-- Deleting a historical cycle cascades through its project updates. Keep the
-- denormalized project health tied to the newest submitted update that remains.
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

create trigger project_updates_refresh_health_after_delete
  after delete on public.project_updates
  for each row execute function public.refresh_project_health_after_update_delete();

-- ---------------------------------------------------------------------------
-- Decisions, reminders, generated reports
-- ---------------------------------------------------------------------------
create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  project_update_id uuid references public.project_updates (id) on delete set null,
  title text not null,
  detail text,
  needed_by date,
  decision_owner_profile_id uuid references public.profiles (id) on delete set null,
  audience text,
  status public.decision_status not null default 'open',
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index decisions_status_idx on public.decisions (status, needed_by);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  reporting_cycle_id uuid not null references public.reporting_cycles (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles (id) on delete cascade,
  sent_by_profile_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'manual',
  message text,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index reminders_recipient_idx on public.reminders (recipient_profile_id, created_at desc);

create table public.generated_reports (
  id uuid primary key default gen_random_uuid(),
  reporting_cycle_id uuid not null references public.reporting_cycles (id) on delete cascade,
  title text not null,
  audience text not null,
  configuration_json jsonb not null default '{}'::jsonb,
  narrative text,
  source_update_ids uuid[] not null default '{}',
  version integer not null default 1,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index generated_reports_cycle_idx on public.generated_reports (reporting_cycle_id, version desc);

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles (id) on delete set null,
  actor_ntid text,
  entity_type text not null,
  entity_id uuid,
  entity_label text,
  action text not null,
  changes_json jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_entity_idx on public.audit_events (entity_type, entity_id, created_at desc);
create index audit_events_created_idx on public.audit_events (created_at desc);

-- ---------------------------------------------------------------------------
-- Identity helpers (security definer: used inside RLS policies)
-- ---------------------------------------------------------------------------
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where auth_user_id = auth.uid() and active limit 1;
$$;

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where auth_user_id = auth.uid() and active limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = 'admin', false);
$$;

create or replace function public.is_lead_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in ('lead', 'admin'), false);
$$;

create or replace function public.owns_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects p
     where p.id = p_project_id
       and p.owner_profile_id = public.current_profile_id()
  );
$$;

create or replace function public.can_edit_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or public.owns_project(p_project_id)
      or exists (
        select 1
          from public.projects p
          join public.portfolios f on f.id = p.portfolio_id
         where p.id = p_project_id
           and public.current_role() = 'lead'
           and (p.lead_profile_id = public.current_profile_id()
                or f.lead_profile_id = public.current_profile_id())
      );
$$;

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

-- ---------------------------------------------------------------------------
-- NTID sign-in support
-- ---------------------------------------------------------------------------
-- Roster enforcement lives entirely in this trigger, which runs inside the
-- sign-up transaction. There is deliberately NO function an unauthenticated
-- caller can use to ask "is this NTID on the roster?" — that would be a
-- pre-auth roster enumeration oracle. An off-roster sign-up attempt is simply
-- rejected, and the auth service rate-limits those attempts.
--
-- The very first account to register is promoted to admin so the pilot can be
-- bootstrapped without a service-role key; everyone after that must already be
-- on the roster and active.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ntid text := lower(split_part(new.email, '@', 1));
  v_profile public.profiles;
  v_is_first boolean;
begin
  select not exists (select 1 from public.profiles where auth_user_id is not null)
    into v_is_first;

  select * into v_profile from public.profiles where ntid = v_ntid;

  if v_profile.id is null then
    if not v_is_first then
      raise exception 'NTID_NOT_ON_ROSTER';
    end if;

    insert into public.profiles (auth_user_id, ntid, display_name, role, active)
    values (
      new.id,
      v_ntid,
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), upper(v_ntid)),
      'admin'::public.user_role,
      true
    );
  else
    if not v_profile.active and not v_is_first then
      raise exception 'NTID_NOT_ON_ROSTER';
    end if;

    update public.profiles
       set auth_user_id = new.id,
           display_name = coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), display_name),
           role = case when v_is_first then 'admin'::public.user_role else role end,
           active = case when v_is_first then true else active end,
           updated_at = now()
     where id = v_profile.id;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Guardrails
-- ---------------------------------------------------------------------------
-- Only an administrator may change a role, the active flag, or an NTID.
create or replace function public.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.active is distinct from old.active
     or new.ntid is distinct from old.ntid then
    raise exception 'Only an administrator can change roles, NTIDs, or access.';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_changes
  before update on public.profiles
  for each row execute function public.guard_profile_changes();

-- A locked or closed cycle cannot be edited by anyone but an administrator.
create or replace function public.guard_locked_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.cycle_status;
begin
  select status into v_status
    from public.reporting_cycles
   where id = coalesce(new.reporting_cycle_id, old.reporting_cycle_id);

  if v_status in ('locked', 'closed') and not public.is_admin() then
    raise exception 'This reporting cycle is % — updates can no longer be changed.', v_status;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger project_updates_guard_locked
  before insert or update or delete on public.project_updates
  for each row execute function public.guard_locked_cycle();

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if to_jsonb(new) ? 'revision' and tg_table_name = 'project_updates' then
    new.revision := coalesce(old.revision, 0) + 1;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'portfolios', 'projects', 'milestones', 'reporting_cycles',
    'project_updates', 'decisions', 'generated_reports'
  ]
  loop
    execute format(
      'create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()',
      t, t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Generic audit trigger
-- ---------------------------------------------------------------------------
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_ntid text;
  v_changes jsonb;
  v_action text;
  v_entity_id uuid;
  v_label text;
  v_old jsonb;
  v_new jsonb;
begin
  select ntid into v_ntid from public.profiles where id = v_actor;

  if tg_op = 'INSERT' then
    v_action := 'create';
    v_changes := to_jsonb(new) - 'created_at' - 'updated_at';
    v_entity_id := new.id;
  elsif tg_op = 'UPDATE' then
    v_action := 'update';
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    select jsonb_object_agg(o.key, jsonb_build_object('from', o.value, 'to', n.value))
      into v_changes
      from jsonb_each(v_old) o
      join jsonb_each(v_new) n on n.key = o.key
     where o.value is distinct from n.value
       and o.key not in ('updated_at', 'revision');

    if v_changes is null or v_changes = '{}'::jsonb then
      return new;
    end if;

    if tg_table_name = 'project_updates'
       and old.status = 'draft' and new.status = 'submitted' then
      v_action := 'submit';
    elsif tg_table_name = 'project_updates' and old.status = 'submitted' then
      v_action := 'edit_after_submission';
    end if;
    v_entity_id := new.id;
  else
    v_action := 'delete';
    v_changes := to_jsonb(old) - 'created_at' - 'updated_at';
    v_entity_id := old.id;
  end if;

  v_label := coalesce(
    to_jsonb(coalesce(new, old)) ->> 'name',
    to_jsonb(coalesce(new, old)) ->> 'title',
    to_jsonb(coalesce(new, old)) ->> 'display_name'
  );

  insert into public.audit_events (
    actor_profile_id, actor_ntid, entity_type, entity_id, entity_label, action, changes_json
  )
  values (v_actor, v_ntid, tg_table_name, v_entity_id, v_label, v_action, v_changes);

  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'portfolios', 'projects', 'milestones', 'reporting_cycles',
    'project_updates', 'decisions', 'generated_reports', 'reminders'
  ]
  loop
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()',
      t, t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.portfolios enable row level security;
alter table public.projects enable row level security;
alter table public.milestones enable row level security;
alter table public.reporting_cycles enable row level security;
alter table public.project_updates enable row level security;
alter table public.decisions enable row level security;
alter table public.reminders enable row level security;
alter table public.generated_reports enable row level security;
alter table public.audit_events enable row level security;

-- Profiles: the roster is visible to the signed-in team, because every screen
-- attributes work to a person (project owner, next-action owner, decision owner,
-- update author, audit actor). The row holds no contact details — name, NTID,
-- job title, role — so this is the minimum needed for attribution to work.
-- Only admins may change it.
create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_insert on public.profiles
  for insert to authenticated with check (public.is_admin());
create policy profiles_update on public.profiles
  for update to authenticated
  using (public.is_admin() or auth_user_id = auth.uid())
  with check (public.is_admin() or auth_user_id = auth.uid());
create policy profiles_delete on public.profiles
  for delete to authenticated using (public.is_admin());

-- Portfolios
create policy portfolios_select on public.portfolios
  for select to authenticated using (true);
create policy portfolios_write on public.portfolios
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Projects: everyone signed in can read; owners/leads/admins can edit.
create policy projects_select on public.projects
  for select to authenticated using (true);
create policy projects_insert on public.projects
  for insert to authenticated with check (public.is_admin());
create policy projects_update on public.projects
  for update to authenticated
  using (public.can_edit_project(id))
  with check (public.can_edit_project(id));
create policy projects_delete on public.projects
  for delete to authenticated using (public.is_admin());

-- Milestones
create policy milestones_select on public.milestones
  for select to authenticated using (true);
create policy milestones_write on public.milestones
  for all to authenticated
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

-- Reporting cycles: leads/admins may create or edit them. Destructive cleanup
-- is administrator-only and limited to historical locked/closed cycles.
create policy reporting_cycles_select on public.reporting_cycles
  for select to authenticated using (true);
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

-- Updates: drafts stay private to their author, owner, lead and admin.
create policy project_updates_select on public.project_updates
  for select to authenticated
  using (
    status = 'submitted'
    or author_profile_id = public.current_profile_id()
    or public.can_edit_project(project_id)
  );
create policy project_updates_insert on public.project_updates
  for insert to authenticated with check (public.can_edit_project(project_id));
create policy project_updates_update on public.project_updates
  for update to authenticated
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));
create policy project_updates_delete on public.project_updates
  for delete to authenticated
  using (public.is_admin() or (status = 'draft' and public.owns_project(project_id)));

-- Decisions
create policy decisions_select on public.decisions
  for select to authenticated using (true);
create policy decisions_write on public.decisions
  for all to authenticated
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

-- Reminders: leads and admins send them; recipients can see their own.
create policy reminders_select on public.reminders
  for select to authenticated
  using (public.is_lead_or_admin() or recipient_profile_id = public.current_profile_id());
create policy reminders_insert on public.reminders
  for insert to authenticated with check (public.is_lead_or_admin());
create policy reminders_update on public.reminders
  for update to authenticated
  using (recipient_profile_id = public.current_profile_id() or public.is_lead_or_admin())
  with check (recipient_profile_id = public.current_profile_id() or public.is_lead_or_admin());

-- Generated reports: everyone reads, leads and admins create and revise.
create policy generated_reports_select on public.generated_reports
  for select to authenticated using (true);
create policy generated_reports_write on public.generated_reports
  for all to authenticated
  using (public.is_lead_or_admin())
  with check (public.is_lead_or_admin());

-- Audit trail: read-only, and only for leads and administrators. Rows are
-- written exclusively by the security-definer audit trigger.
create policy audit_events_select on public.audit_events
  for select to authenticated using (public.is_lead_or_admin());

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260918120000', 'one_shared_view_init') on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Migration 20260918120100_one_shared_view_seed
-- ---------------------------------------------------------------------------
-- One Shared View — pilot seed data for the CMO Digital LT portfolio.
-- Idempotent: safe to re-run, and safe to apply to prod at release time.
--
-- IMPORTANT: every person below is a FABRICATED demo persona, not a real
-- colleague. The NTIDs are invented and no e-mail addresses are stored, so no
-- real personal data is committed to the repository or the database. Replace
-- this roster with the real CMO Digital LT people from the admin screen (or a
-- follow-up migration) when the pilot goes live.

-- ---------------------------------------------------------------------------
-- Roster (demo personas). auth_user_id stays null until each person signs in
-- with their NTID; the auth trigger links the rows up automatically.
-- ---------------------------------------------------------------------------
insert into public.profiles (ntid, display_name, job_title, role)
values
  ('demoown1', 'Maya Chen (demo)',   'Director, Customer Experience',    'owner'),
  ('demoown2', 'Jon Bell (demo)',    'Lead, Medical Affairs Digital',    'owner'),
  ('demoown3', 'Nina Ortiz (demo)',  'Lead, Commercial Enablement',      'owner'),
  ('demoown4', 'Daniel Kim (demo)',  'Director, Clinical Operations',    'owner'),
  ('demolead', 'Alex Morgan (demo)', 'Portfolio Lead, CMO Digital',      'lead'),
  ('demoexe1', 'Ravi Patel (demo)',  'Chief Marketing Officer',          'exec'),
  ('demoexe2', 'Elena Shaw (demo)',  'VP, Digital Strategy',             'exec'),
  ('demoadm1', 'Joy Okafor (demo)',  'PMO Manager, CMO Digital',         'admin')
on conflict (ntid) do nothing;

-- ---------------------------------------------------------------------------
-- Portfolio
-- ---------------------------------------------------------------------------
insert into public.portfolios (name, description, lead_profile_id)
select
  'CMO Digital',
  'Digital delivery portfolio for the Chief Marketing Officer leadership team.',
  (select id from public.profiles where ntid = 'demolead')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
insert into public.projects (
  name, description, portfolio_id, owner_profile_id, lead_profile_id,
  lifecycle_status, current_health, reporting_cadence
)
select
  v.name, v.description,
  (select id from public.portfolios where name = 'CMO Digital'),
  (select id from public.profiles where ntid = v.owner_ntid),
  (select id from public.profiles where ntid = 'demolead'),
  v.lifecycle::public.lifecycle_status,
  v.health::public.health_status,
  'weekly'
from (values
  ('Patient Support Hub',    'Customer Experience — unified patient support journey.',        'demoown1',   'active',   'on_track'),
  ('Medical Content Engine', 'Medical Affairs — accelerated content review and approval.',    'demoown2',   'active',   'at_risk'),
  ('Field Insights Copilot', 'Commercial Enablement — field-facing insight summaries.',       'demoown3',  'active',   'on_track'),
  ('Trial Site Navigator',   'Clinical Operations — site selection and activation tracking.', 'demoown4',    'active',   'blocked'),
  ('One Shared View',        'Spark Portfolio — single source of truth for status reporting.','demolead', 'proposed', 'on_track')
) as v(name, description, owner_ntid, lifecycle, health)
on conflict (portfolio_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- Milestones
-- ---------------------------------------------------------------------------
insert into public.milestones (project_id, name, target_date, status, owner_profile_id)
select
  (select id from public.projects where name = v.project),
  v.name, v.target_date::date, v.status::public.milestone_status,
  (select owner_profile_id from public.projects where name = v.project)
from (values
  ('Patient Support Hub',    'Pilot readiness review', '2026-09-25', 'in_progress'),
  ('Medical Content Engine', 'Legal approval',         '2026-09-23', 'in_progress'),
  ('Field Insights Copilot', 'Wave 2 launch',          '2026-10-04', 'planned'),
  ('Trial Site Navigator',   'Data access granted',    '2026-09-15', 'missed'),
  ('One Shared View',        'Pilot team confirmed',   '2026-09-30', 'planned')
) as v(project, name, target_date, status)
where not exists (
  select 1 from public.milestones m
   where m.project_id = (select id from public.projects where name = v.project)
     and m.name = v.name
);

-- ---------------------------------------------------------------------------
-- Reporting cycles
-- ---------------------------------------------------------------------------
insert into public.reporting_cycles (portfolio_id, name, cadence, starts_at, due_at, closes_at, status)
select
  (select id from public.portfolios where name = 'CMO Digital'),
  v.name, 'weekly',
  v.starts_at::timestamptz, v.due_at::timestamptz, v.closes_at::timestamptz,
  v.status::public.cycle_status
from (values
  ('Week ending Sep 11', '2026-09-07 08:00+00', '2026-09-11 17:00+00', '2026-09-12 17:00+00', 'closed'),
  ('Week ending Sep 18', '2026-09-14 08:00+00', '2026-09-18 17:00+00', '2026-09-19 17:00+00', 'open'),
  ('Week ending Sep 25', '2026-09-21 08:00+00', '2026-09-25 17:00+00', '2026-09-26 17:00+00', 'upcoming')
) as v(name, starts_at, due_at, closes_at, status)
on conflict (portfolio_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- Submitted updates for the current cycle (4 of 5 — one deliberately missing).
-- Readiness can be lower because stale submissions do not qualify as current.
-- Triggers are bypassed for seeding by writing submitted_at explicitly.
-- ---------------------------------------------------------------------------
insert into public.project_updates (
  project_id, reporting_cycle_id, author_profile_id, health,
  executive_summary, accomplishments, next_steps, blocker_or_risk, leadership_ask,
  health_change_reason, next_action, next_action_owner_profile_id,
  next_milestone_name, next_milestone_date, status, submitted_at
)
select
  (select id from public.projects where name = v.project),
  (select id from public.reporting_cycles where name = 'Week ending Sep 18'),
  (select owner_profile_id from public.projects where name = v.project),
  v.health::public.health_status,
  v.summary, v.accomplishments, v.next_steps,
  nullif(v.blocker, ''), nullif(v.ask, ''), nullif(v.reason, ''), nullif(v.next_action, ''),
  case when v.next_action_ntid = '' then null
       else (select id from public.profiles where ntid = v.next_action_ntid) end,
  v.milestone, v.milestone_date::date, 'submitted', v.submitted_at::timestamptz
from (values
  (
    'Patient Support Hub', 'on_track',
    'Pilot cohort is confirmed and onboarding content is ready. Delivery remains on schedule for the September readiness review.',
    E'Completed onboarding journey walkthrough with the support team.\nSigned off accessibility review for the patient-facing flow.',
    E'Run the pilot readiness review.\nFinalise support handover documentation.',
    '', '', '', '', '',
    'Pilot readiness review', '2026-09-25', '2026-09-18 09:12+00'
  ),
  (
    'Medical Content Engine', 'at_risk',
    'Legal review expanded after a late requirement change. The team is evaluating a phased launch to protect the original date.',
    E'Drafted the phased launch option with Medical Affairs.\nCompleted content model validation for wave 1.',
    E'Agree the reduced pilot scope.\nRe-baseline the launch plan once legal confirms.',
    'Legal review scope grew by two weeks after a late requirement change.',
    'Confirm acceptable pilot scope by Sep 21 so we can hold the launch date.',
    'Late requirement change extended the legal review window.',
    'Present the phased launch option to the steering team.', 'demoown2',
    'Legal approval', '2026-09-23', '2026-09-17 16:40+00'
  ),
  (
    'Field Insights Copilot', 'on_track',
    'Wave 1 adoption is ahead of target and wave 2 build is underway with no open risks.',
    E'Wave 1 rollout completed across three regions.\nFeedback loop established with field leadership.',
    E'Complete wave 2 build.\nConfirm training schedule for the next region.',
    '', '', '', '', '',
    'Wave 2 launch', '2026-10-04', '2026-09-16 11:05+00'
  ),
  (
    'Trial Site Navigator', 'blocked',
    'Delivery is stopped pending clinical data access. Six days lost; the next milestone is already overdue.',
    E'Submitted the data access request with Clinical Operations.\nCompleted the site selection data model.',
    E'Secure an executive sponsor for the data access decision.\nResume integration build once access is granted.',
    'Clinical data access has not been approved; no sponsor is assigned to the decision.',
    'Assign an executive sponsor to unblock clinical data access before the Sep 22 steering meeting.',
    'Data access request has been open for six days without an accountable decision owner.',
    'Escalate the data access request to the steering team and name a sponsor.', 'demoexe1',
    'Data access granted', '2026-09-15', '2026-09-12 14:22+00'
  )
) as v(
  project, health, summary, accomplishments, next_steps, blocker, ask, reason,
  next_action, next_action_ntid, milestone, milestone_date, submitted_at
)
on conflict (project_id, reporting_cycle_id) do nothing;

-- ---------------------------------------------------------------------------
-- Decisions awaiting leadership
-- ---------------------------------------------------------------------------
insert into public.decisions (
  project_id, title, detail, needed_by, decision_owner_profile_id, audience, status
)
select
  (select id from public.projects where name = v.project),
  v.title, v.detail, v.needed_by::date,
  (select id from public.profiles where ntid = v.owner_ntid),
  v.audience, 'open'
from (values
  (
    'Trial Site Navigator', 'Confirm Trial Site Navigator data sponsor',
    'An executive sponsor is required to unblock clinical data access.',
    '2026-09-22', 'demoexe1', 'Executive steering team'
  ),
  (
    'Patient Support Hub', 'Approve Patient Support Hub pilot cohort',
    'Sign-off needed on the proposed pilot cohort ahead of readiness review.',
    '2026-09-25', 'demoown1', 'Patient Experience Council'
  ),
  (
    'Medical Content Engine', 'Agree phased launch scope',
    'Decide whether a reduced wave 1 scope is acceptable to hold the launch date.',
    '2026-09-21', 'demoexe2', 'Executive steering team'
  )
) as v(project, title, detail, needed_by, owner_ntid, audience)
where not exists (
  select 1 from public.decisions d
   where d.project_id = (select id from public.projects where name = v.project)
     and d.title = v.title
);

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260918120100', 'one_shared_view_seed') on conflict do nothing;
