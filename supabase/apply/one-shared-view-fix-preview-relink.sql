-- ============================================================================
-- One Shared View — FIX: "Preview the solution" only worked once
-- Run this in the Supabase SQL Editor (nonprod). Safe and re-runnable.
-- ============================================================================
-- This is migration 20260921160000 plus a bookkeeping row at the end.
-- It contains NO personal data.
-- SYMPTOM
--   "Preview the solution" worked the very first time and then hung / dead-ended
--   forever after, surfacing as "The read-only preview is not available yet."
--
-- ROOT CAUSE
--   20260921150000 hardened guard_profile_changes() so that a preview session may
--   not modify ANY roster row. That is correct for data edits, but sign-in itself
--   needs one write: link_auth_user_to_roster() UPDATEs profiles.auth_user_id to
--   attach the session to its roster entry.
--
--   The two interact on the SECOND sign-in, not the first:
--     * 1st preview sign-in — profiles.auth_user_id is still null, so the guard's
--       "is the caller a preview session?" lookup (which joins on
--       auth_user_id = auth.uid()) matches nothing. Guard passes, link succeeds,
--       and the row now carries that auth user id.
--     * 2nd sign-in onwards — the same auth user now DOES resolve to the preview
--       profile, so the guard fires and aborts the link with
--       "This is a read-only preview. Sign in with your NTID to make changes."
--       startPreview() treats a link failure as "preview unavailable", signs the
--       session back out, and the visitor is stuck.
--
--   Verified live before this fix: calling link_auth_user_to_roster('preview')
--   with a valid preview token returned P0001 with that exact message.
--
-- THE FIX
--   link_auth_user_to_roster() now sets the transaction-local
--   one_shared_view.linking flag around its UPDATE — the mechanism the guard
--   already honours first, and the same one the preview identity insert in
--   20260921150000 uses. Nothing about the guard is relaxed: the flag is set for
--   exactly one narrow statement and switched off immediately afterwards.
--
--   This does NOT widen what preview can write. The UPDATE touches only
--   auth_user_id and updated_at, and its WHERE clause still restricts it to a row
--   whose ntid matches and which is either unclaimed or already this caller's — so
--   role, active, ntid and is_preview remain untouchable, and a caller still
--   cannot attach itself to somebody else's roster entry. Every write policy
--   continues to refuse the preview identity, because it is still role 'exec'
--   owning nothing.

create or replace function public.link_auth_user_to_roster(p_ntid text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ntid text := lower(trim(p_ntid));
  v_uid uuid := auth.uid();
  v_linked int;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Sign-in linking is the one legitimate write a not-yet-linked (or read-only
  -- preview) session must be allowed to make. Scoped to this transaction and
  -- switched off again below, so it covers only the UPDATE immediately after it.
  perform set_config('one_shared_view.linking', 'on', true);

  -- Only ever links the caller's OWN session, and only to an active roster
  -- entry. A caller cannot attach themselves to somebody else's entry, because
  -- the NTID must match the row and the row must be free or already theirs.
  update public.profiles
     set auth_user_id = v_uid,
         updated_at = now()
   where ntid = v_ntid
     and active
     and (auth_user_id is null or auth_user_id = v_uid);

  -- Captured BEFORE the set_config below: `perform` runs a statement of its own
  -- and would overwrite FOUND / row_count, turning a failed link into a silent
  -- success.
  get diagnostics v_linked = row_count;

  perform set_config('one_shared_view.linking', 'off', true);

  if v_linked = 0 then
    raise exception 'ROSTER_LINK_REFUSED';
  end if;
end;
$$;

comment on function public.link_auth_user_to_roster(text) is
  'Attaches the calling session to its own active roster entry. Sets the transaction-local one_shared_view.linking flag around that single UPDATE so the roster guard permits sign-in linking (including for the read-only preview identity, which otherwise could only ever link once). Only auth_user_id and updated_at are written; role, active, ntid and is_preview stay administrator-only.';

grant execute on function public.link_auth_user_to_roster(text) to authenticated;

-- ============================================================================
-- Check: linking works for a session that is ALREADY linked (the broken case).
-- ============================================================================
-- Expect one row, ntid 'preview', with auth_user_id still set and is_preview true.
select ntid, (auth_user_id is not null) as linked, is_preview, role::text
  from public.profiles
 where ntid = 'preview';

-- Bookkeeping so this counts as an applied migration.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations
  (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260921160000', 'one_shared_view_fix_preview_relink')
  on conflict do nothing;
