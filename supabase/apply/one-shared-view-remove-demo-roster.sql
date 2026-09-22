-- ============================================================================
-- One Shared View — remove the 8 demo personas
-- Run this in the Supabase SQL Editor (nonprod).
-- ============================================================================
--
-- This is migration 20260921140000 plus the bookkeeping row at the end.
-- It contains NO personal data — every NTID here is an invented demo persona
-- from the pilot seed, which is why it is safe to commit.
--
-- The REAL roster is applied separately from an un-committed local script, so
-- that no colleague's name, title or NTID enters version control.
--
-- WHAT THIS DOES
--   Deletes the 8 fabricated demo roster rows (demoown1..4, demolead,
--   demoexe1..2, demoadm1).
--
-- WHAT IT KEEPS (your choice: "delete the people, keep the projects")
--   The 5 demo projects, their milestones, the 4 submitted updates and the 3
--   open decisions all remain. Every profile reference is `on delete set null`,
--   so those rows survive with an empty person field.
--
--   >>> Expect the 5 demo projects to show NO owner and NO lead, and their
--   >>> update history to show NO author. Assign real owners from /admin.
--
--   The audit trail keeps its `actor_ntid` text, so history still reads
--   correctly even though actor_profile_id becomes null.
--
-- THE ONE CASCADE
--   reminders.recipient_profile_id is `on delete cascade`, so reminders
--   addressed to a demo persona are removed with them. Nothing is delivered
--   anywhere in this app, so this is bookkeeping only.
--
-- SAFETY
--   Two guards run before the delete and will ABORT the whole thing rather
--   than do something destructive:
--     1. refuses if any "demo" NTID has a real login attached
--     2. refuses if the delete would leave no active administrator
--   Your own admin account is not in the list, so guard 2 should always pass.
--
-- ============================================================================

begin;

create temporary table _demo_ntids (ntid text primary key) on commit drop;
insert into _demo_ntids (ntid) values
  ('demoown1'),  -- Maya Chen (demo)
  ('demoown2'),  -- Jon Bell (demo)
  ('demoown3'),  -- Nina Ortiz (demo)
  ('demoown4'),  -- Daniel Kim (demo)
  ('demolead'),  -- Alex Morgan (demo)
  ('demoexe1'),  -- Ravi Patel (demo)
  ('demoexe2'),  -- Elena Shaw (demo)
  ('demoadm1');  -- Joy Okafor (demo)

-- Guard 1 — a "demo" NTID with a login is not a demo persona any more.
do $$
declare
  v_linked text;
begin
  select string_agg(p.ntid, ', ')
    into v_linked
    from public.profiles p
    join _demo_ntids d on d.ntid = p.ntid
   where p.auth_user_id is not null;

  if v_linked is not null then
    raise exception
      'Refusing to delete: these "demo" NTIDs have real logins attached (%). Investigate before re-running.',
      v_linked;
  end if;
end;
$$;

-- Guard 2 — never strand the app without an administrator.
do $$
declare
  v_remaining int;
begin
  select count(*)
    into v_remaining
    from public.profiles p
   where p.role = 'admin'
     and p.active
     and p.ntid not in (select ntid from _demo_ntids);

  if v_remaining = 0 then
    raise exception
      'Refusing to delete: this would leave no active administrator on the roster.';
  end if;
end;
$$;

delete from public.profiles
 where ntid in (select ntid from _demo_ntids);

-- Bookkeeping so the migration is not re-applied later.
create table if not exists supabase_migrations.schema_migrations
  (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260921140000', 'one_shared_view_remove_demo_roster')
  on conflict do nothing;

commit;

-- Verify: expect 0 rows.
select ntid, display_name
  from public.profiles
 where ntid like 'demo%';
