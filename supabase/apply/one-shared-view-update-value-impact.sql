-- ============================================================================
-- One Shared View — Expected Value and Impact update fields
-- Run this in the Supabase SQL Editor (nonprod). Safe and re-runnable.
-- ============================================================================
-- This is migration 20260921180000 plus a bookkeeping row at the end.

do $$
begin
  create type public.impact_level as enum ('high', 'medium', 'low');
exception
  when duplicate_object then null;
end
$$;

alter table public.project_updates
  add column if not exists expected_value text,
  add column if not exists impact public.impact_level;

comment on column public.project_updates.expected_value is
  'Value the project is expected to deliver, as reported for this cycle.';

comment on column public.project_updates.impact is
  'Owner-assessed project impact for this cycle: high, medium, or low.';

-- Bookkeeping so this counts as an applied migration.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations
  (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260921180000', 'one_shared_view_update_value_impact')
  on conflict do nothing;
