-- One Shared View — repair the audit trigger's column access.
--
-- SYMPTOM
--   ERROR 42703: record "old" has no field "status"
--   CONTEXT: SQL expression "tg_table_name = 'project_updates'
--            and old.status = 'draft' and new.status = 'submitted'"
--            PL/pgSQL function audit_trigger() line 33 at IF
--
-- WHY IT HAPPENS
-- One audit_trigger() serves nine tables. Its UPDATE branch tries to recognise
-- a weekly update being submitted by reading old.status / new.status directly.
-- Only four of the nine audited tables have a `status` column at all:
--
--     has status : milestones, reporting_cycles, project_updates, decisions
--     has none   : profiles, portfolios, projects, generated_reports, reminders
--                  (projects names the column lifecycle_status)
--
-- The `tg_table_name = 'project_updates'` test looks like it protects the field
-- access, but it does not. PL/pgSQL hands the whole IF condition to the SQL
-- engine as a single expression, and the engine resolves every identifier in it
-- while planning — before any value is compared. There is no left-to-right
-- short-circuit to rely on. So on a table with no `status` column the trigger
-- fails at plan time, whatever tg_table_name happens to be.
--
-- HOW BROAD THIS IS
-- This aborts EVERY UPDATE on those five tables: changing someone's role or
-- access, editing a project, renaming a portfolio, touching a report or a
-- reminder. It is the second half of the same story as the missing INSERT policy
-- on audit_events — audit bookkeeping taking down the change it was only
-- supposed to describe.
--
-- It also explains the error seen while clearing stale login records: deleting
-- an auth user sets profiles.auth_user_id to null (the column is declared
-- `on delete set null`), and that UPDATE on profiles fired this trigger.
--
-- Note the earlier safety net could not catch it. 20260921084500 wrapped the
-- audit INSERT in an exception handler, but this failure happens well before
-- that INSERT — at the IF on line 33 — so it was never inside the protected
-- block.
--
-- THE FIX
-- The UPDATE branch already builds v_old and v_new as jsonb. Reading the status
-- through those (`v_old ->> 'status'`) asks a question that is valid for every
-- table: a missing key yields NULL instead of failing to plan. The comparison
-- then simply never matches for tables that have no status, which is the
-- intended behaviour.
--
-- Behaviour is otherwise unchanged. The 'submit' and 'edit_after_submission'
-- actions are still recorded for project_updates exactly as before, so the audit
-- trail keeps distinguishing a first submission from a later correction.

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

    -- Read status through jsonb, not as a record field. A table without the
    -- column yields NULL here rather than failing to plan, which is what lets
    -- this one function serve all nine audited tables.
    if tg_table_name = 'project_updates'
       and v_old ->> 'status' = 'draft'
       and v_new ->> 'status' = 'submitted' then
      v_action := 'submit';
    elsif tg_table_name = 'project_updates'
       and v_old ->> 'status' = 'submitted' then
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
  'Appends an audit_events row for every insert, update and delete on the audited tables. Reads per-table columns such as status through jsonb, because one function serves tables with differing shapes and PL/pgSQL resolves every identifier in an IF condition at plan time regardless of which branch would run.';
