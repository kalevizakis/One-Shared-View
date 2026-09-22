-- Add the expected value and impact captured with each reporting-cycle update.
-- Existing updates remain valid; their new fields are null until an owner
-- supplies them.

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
