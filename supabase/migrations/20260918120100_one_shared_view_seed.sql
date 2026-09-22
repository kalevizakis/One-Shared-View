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
