-- ============================================================================
-- One Shared View — FIX: 'record "new" has no field "id"' when saving a
-- reminder e-mail, plus contact addresses leaking into the audit trail.
-- Run this in the Supabase SQL Editor (nonprod). Safe and re-runnable.
-- ============================================================================
-- This is migration 20260921190000 plus a cleanup pass and a bookkeeping row.
-- It contains NO personal data.
--
-- Apply this AFTER supabase/apply/one-shared-view-profile-contacts.sql.
--
-- SYMPTOM
--   ERROR 42703: record "new" has no field "id"
--   Seen when saving a reminder e-mail in /admin, i.e. on any insert, update or
--   delete of public.profile_contacts.
--
-- WHY IT HAPPENS
--   audit_trigger() serves every audited table from one function, and it still
--   read the row's primary key as a record field: `v_entity_id := new.id`.
--   Nine of the audited tables do have an `id` column. profile_contacts does
--   not — it is one-to-one with profiles, so `profile_id` IS its primary key.
--   PL/pgSQL resolves that identifier while planning, so the statement aborts
--   before a single value is compared, and the audit bookkeeping takes down the
--   change it was only supposed to describe.
--
--   This is the same class of failure as 20260921120000 (`old.status`), and the
--   exception handler added in 20260921084500 cannot catch it either: the
--   failure happens at the assignment, well before the wrapped INSERT.
--
-- FIX 1 — read the key through jsonb, like every other per-table column.
--   A missing key yields NULL instead of failing to plan, so `id` is used when
--   the table has one and `profile_id` when it does not. No audited table can
--   abort a write through this path again, whatever shape a future table has.
--
-- FIX 2 — redact profile_contacts.email from changes_json.
--   changes_json records the before/after of every changed column, and
--   audit_events is readable by leads, administrators AND the shared read-only
--   preview identity (audit_events_select_preview). Left alone, the audit trail
--   would hand out the very corporate addresses that 20260921170000 deliberately
--   kept off the broadly readable profiles table — the privacy boundary would
--   hold on the roster and leak one screen over.
--
--   Accountability is unaffected: who changed whose contact record, when, and in
--   which direction is all still recorded. Only the address value is withheld,
--   and the row is labelled with the person it belongs to (a display name the
--   roster already shows everywhere), so the entry reads as something other than
--   a blank line.

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
  v_row jsonb;
begin
  select ntid into v_ntid from public.profiles where id = v_actor;

  -- One jsonb view of the row, used for the key and the label below, so neither
  -- access is ever a record field lookup.
  v_row := to_jsonb(coalesce(new, old));

  if tg_op = 'INSERT' then
    v_action := 'create';
    v_changes := to_jsonb(new) - 'created_at' - 'updated_at';
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

    -- Read status through jsonb, not as a record field. A table without the
    -- column yields NULL here rather than failing to plan, which is what lets
    -- this one function serve every audited table.
    if tg_table_name = 'project_updates'
       and v_old ->> 'status' = 'draft'
       and v_new ->> 'status' = 'submitted' then
      v_action := 'submit';
    elsif tg_table_name = 'project_updates'
       and v_old ->> 'status' = 'submitted' then
      v_action := 'edit_after_submission';
    end if;
  else
    v_action := 'delete';
    v_changes := to_jsonb(old) - 'created_at' - 'updated_at';
  end if;

  -- `id` where the table has one, the owning profile where it does not
  -- (profile_contacts is keyed by profile_id). Same jsonb discipline as above.
  v_entity_id := coalesce(v_row ->> 'id', v_row ->> 'profile_id')::uuid;

  v_label := coalesce(
    v_row ->> 'name',
    v_row ->> 'title',
    v_row ->> 'display_name'
  );

  -- A contact address must not reach a screen the preview identity can read.
  -- The change is still recorded; only the value is withheld.
  if tg_table_name = 'profile_contacts' then
    if jsonb_exists(v_changes, 'email') then
      v_changes := jsonb_set(v_changes, array['email'], '"[redacted]"'::jsonb);
    end if;

    -- The row carries no name of its own; without this the audit screen shows a
    -- dash. The display name is already visible wherever the roster is.
    select p.display_name into v_label
      from public.profiles p
     where p.id = v_entity_id;
  end if;

  -- Kept from 20260921084500: an audit row matters, but never more than the
  -- change it describes being allowed to happen.
  begin
    insert into public.audit_events (
      actor_profile_id, actor_ntid, entity_type, entity_id, entity_label, action, changes_json
    )
    values (v_actor, v_ntid, tg_table_name, v_entity_id, v_label, v_action, v_changes);
  exception when others then
    raise warning 'audit_events write failed for %.%: %', tg_table_name, v_entity_id, sqlerrm;
  end;

  return coalesce(new, old);
end;
$$;

comment on function public.audit_trigger() is
  'Appends an audit_events row for every insert, update and delete on the audited tables. Every per-table column — including the primary key and status — is read through jsonb, because one function serves tables with differing shapes and PL/pgSQL resolves each identifier in an expression at plan time regardless of which branch would run. Falls back to profile_id for tables keyed by their parent. profile_contacts.email is redacted, because audit_events is readable by the shared read-only preview identity.';

-- ---------------------------------------------------------------------------
-- Cleanup: redact any contact address already recorded before this fix.
-- ---------------------------------------------------------------------------
-- Normally matches zero rows — the trigger aborted before writing anything. It
-- exists so a database where one row did land does not keep an address visible
-- in the audit screen. Re-running it is harmless.
update public.audit_events
   set changes_json = jsonb_set(changes_json, array['email'], '"[redacted]"'::jsonb)
 where entity_type = 'profile_contacts'
   and jsonb_exists(changes_json, 'email')
   and changes_json -> 'email' <> '"[redacted]"'::jsonb;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------
-- Expect contacts_table_present = true and audited = true. If the table is
-- missing, apply one-shared-view-profile-contacts.sql first.
select
  to_regclass('public.profile_contacts') is not null as contacts_table_present,
  exists (
    select 1
      from pg_trigger
     where tgrelid = to_regclass('public.profile_contacts')
       and tgname = 'profile_contacts_audit'
  ) as audited;

-- Expect ZERO rows. Any row here is a contact address still readable in the
-- audit screen, which the preview identity can open.
select id, created_at
  from public.audit_events
 where entity_type = 'profile_contacts'
   and jsonb_exists(changes_json, 'email')
   and changes_json -> 'email' <> '"[redacted]"'::jsonb;

-- Bookkeeping so this counts as an applied migration.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations
  (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260921190000', 'one_shared_view_audit_entity_id_fix')
  on conflict do nothing;
