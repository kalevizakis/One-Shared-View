-- One Shared View — let the audit trigger write its rows under RLS.
--
-- BACKGROUND
-- audit_events has RLS enabled and, by design, only a SELECT policy: the init
-- migration reasoned that rows are "written exclusively by the security-definer
-- audit trigger" and therefore needed no INSERT policy. That reasoning is
-- fragile. SECURITY DEFINER satisfies the GRANT layer, and a table owner
-- normally bypasses RLS — but that bypass depends on which role actually owns
-- the function and the table in this managed database, which is not something
-- the app can rely on. If the effective role is subject to row security, an
-- INSERT with no matching policy is refused.
--
-- That matters far beyond sign-up: audit_trigger fires AFTER INSERT/UPDATE/
-- DELETE on nine tables, so a refused audit write propagates outwards and
-- aborts the statement that caused it — submitting an update, editing a project,
-- linking a new login. Sign-up surfaced it first only because linking a login
-- updates profiles.
--
-- THE FIX
-- State the permission explicitly instead of depending on owner-bypass: add an
-- INSERT policy covering every role, so the trigger's append always succeeds.
-- The trail stays tamper-proof through the layer that actually guarantees it —
-- there is still NO update policy and NO delete policy, so rows can never be
-- altered or removed, and `authenticated` holds no INSERT *grant* on this table
-- (see the grants migration), so the app cannot forge entries of its own.
--
-- Row security is deliberately NOT forced here: forcing it would subject the
-- owner to RLS as well and remove the very fallback that may be keeping other
-- writes alive.

create policy audit_events_insert on public.audit_events
  for insert
  with check (true);

comment on policy audit_events_insert on public.audit_events is
  'Permits the security-definer audit trigger to append rows regardless of which role it runs as. The trail stays append-only: no update or delete policy exists, and clients hold no insert grant, so entries can be neither forged nor altered through the API.';
