-- One Shared View — remove the 8 fabricated demo personas from the roster.
--
-- WHY THIS IS A MIGRATION (and the real roster is not)
-- This script contains no personal data: every NTID below is an invented demo
-- persona from the pilot seed (20260918120100). It is therefore safe to commit.
-- The REAL CMO Digital / MRS roster is deliberately NOT committed — per the
-- decision recorded on 2026-09-18, real people are entered through /admin or a
-- local scratch script so that no colleague's name, title or NTID ever lands in
-- version control. Do not add real people to this or any other migration.
--
-- WHAT HAPPENS TO THE DEMO CONTENT
-- The user chose: delete the people, KEEP the demo projects. That works without
-- any extra statements because every profile reference is declared
-- `on delete set null`, so the rows survive with an empty person field:
--
--     portfolios.lead_profile_id              -> null
--     projects.owner_profile_id / lead_...    -> null
--     milestones.owner_profile_id             -> null
--     project_updates.author_profile_id       -> null
--     project_updates.next_action_owner_...   -> null
--     decisions.decision_owner_profile_id     -> null
--     generated_reports.created_by_profile_id -> null
--     audit_events.actor_profile_id           -> null  (actor_ntid text is kept,
--                                                       so the trail still says
--                                                       who did what)
--
-- The ONE cascade is deliberate and worth knowing about:
--     reminders.recipient_profile_id is `on delete cascade`
-- A reminder is addressed to a specific person, so a reminder to a deleted
-- persona is meaningless and is removed with them. Reminders are internal
-- bookkeeping only (nothing is actually delivered), so nothing is lost.
--
-- CONSEQUENCE TO EXPECT IN THE UI
-- The 5 demo projects will show no owner and no lead, and their update history
-- will show no author. That is the chosen trade-off; assign the real people as
-- owners from /admin once the real roster is loaded.
--
-- The audit trigger fires on DELETE, so all 8 removals are recorded in
-- audit_events with a full row snapshot.

begin;

-- Explicit NTID list rather than `like 'demo%'`: a pattern could match a real
-- NTID that happens to start with those letters. Naming each row makes the
-- blast radius exactly eight and reviewable at a glance.
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

-- Guard 1: never delete a roster row that a real person has signed in as.
-- If any of these NTIDs somehow has an auth_user_id, it is not a demo persona
-- any more and this migration must not touch it.
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

-- Guard 2: do not strand the application without an administrator.
-- The real admin account (e.g. alevik) is NOT in the list above, so this should
-- always pass — it exists so that a future edit to the list cannot lock everyone
-- out of /admin.
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

commit;
