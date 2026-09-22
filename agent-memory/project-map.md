# Project Map

> **Purpose**: Living catalog of project info, pages, forms, components, APIs, features.
> **Update**: Every time you create, modify, or discover entities.

## Project Info

| Property | Value | Last Updated |
|----------|-------|--------------|
| Spark Build Project ID | 2814 | 2026-09-18 |
| Launchpad Project ID | unknown — lookup tool errored ("host is unreachable"); retry | 2026-09-18 |
| Launchpad Last Checked | 2026-09-18 (failed) | 2026-09-18 |
| Has Requirements in MCP | no (source of truth is the uploaded handoff brief) | 2026-09-18 |

### Launchpad Summary

Lookup unavailable. Business context came from the user's uploaded
`One-Shared-View-Handoff.zip` (implementation brief + clickable HTML prototype +
static SVG mockup).

**Product**: "One Shared View" — one weekly structured update per project becomes
the portfolio view AND the leadership report. Audience: CMO Digital LT team.
Login by NTID. All entries stored in the database with a full audit trail.

---

## Pages

| Route | Name | Purpose | Key Components | Last Updated |
|-------|------|---------|----------------|--------------|
| `/login` | Sign in | NTID sign-in, plus the secondary "Preview the solution" read-only entry point. `?switch=1` lets it render for an existing (preview) session | LoginForm | 2026-09-21 |
| `/` | Portfolio health | Dashboard: stat cards, project table with health/freshness filters, reporting readiness, exception callout, upcoming decisions | StatCard, CyclePicker, ProjectTable, ReportingReadiness, ExceptionCallout, UpcomingDecisions | 2026-09-18 |
| `/my-update` | Weekly project update | Owner submits/drafts the structured weekly update | UpdateForm, CyclePicker | 2026-09-18 |
| `/reports` | Leadership report | Generate/version the leadership brief, edit narrative, print/PDF | ReportBuilder, ReportPaper, CyclePicker | 2026-09-18 |
| `/projects/[id]` | Project detail | Update history with attribution, milestones, decisions | UpdateHistory, HealthBadge | 2026-09-18 |
| `/audit` | Audit trail | Filterable audit log (lead/admin only) | AuditFilters, AuditTable | 2026-09-18 |
| `/admin` | Administration | Manage projects, people/roles, reporting cycles (admin only) | ProjectAdmin, PeopleAdmin, CycleAdmin | 2026-09-18 |

Route groups: `src/app/(app)/` is the authenticated shell (header + nav + footer);
`/login` has its own minimal layout.

## Forms

| Name | Location | Fields | Purpose | Last Updated |
|------|----------|--------|---------|--------------|
| LoginForm | src/components/auth/login-form.tsx | ntid (+ "Preview the solution" button) | NTID sign-in; secondary outline control starts the read-only preview | 2026-09-21 |
| UpdateForm | src/components/updates/update-form.tsx | project, health, accomplishments, next steps, blocker, leadership ask, health reason, next action + owner, next milestone + date | Weekly update; health-conditional required fields; draft + submit. Impact is shown read-only in the project-context aside | 2026-09-22 |
| ReportBuilder | src/components/reports/report-builder.tsx | title, audience, 3 content toggles, narrative | Generate report version, edit narrative, print | 2026-09-18 |
| ProjectAdmin | src/components/admin/project-admin.tsx | name, executive summary, expected value, impact, owner, lead, lifecycle, cadence | Create/edit projects | 2026-09-22 |
| PeopleAdmin | src/components/admin/people-admin.tsx | ntid, name, job title, role, active | Roster + role/access management; guarded deletion of inactive, unreferenced entries | 2026-09-22 |
| CycleAdmin | src/components/admin/cycle-admin.tsx | name, cadence, starts/due/closes, status | Create/edit cycles; permanently delete older locked/closed cycles with confirmation | 2026-09-22 |

## Components

| Name | Path | Purpose | Used In | Last Updated |
|------|------|---------|---------|--------------|
| AppHeader | src/components/layout/app-header.tsx | Sticky app header, brand, nav, theme, user menu; hidden in print | (app) layout | 2026-09-18 |
| AppNav | src/components/layout/app-nav.tsx | Role-filtered navigation links. In preview: Portfolio, My update, Reports, Audit trail — `/admin` hidden | AppHeader | 2026-09-21 |
| UserMenu | src/components/layout/user-menu.tsx | Initials avatar, NTID · role, sign out. In preview: eye icon, "Preview · read-only", "Exit preview" | AppHeader | 2026-09-21 |
| PreviewBanner | src/components/layout/preview-banner.tsx | Persistent non-dismissible read-only notice with a sign-in link; `data-print="hide"` | `(app)` layout, when `session.isPreview` | 2026-09-21 |
| HealthBadge | src/components/shared/health-badge.tsx | Health chip — ALWAYS carries label text (never colour alone) | Everywhere | 2026-09-18 |
| StatCard | src/components/shared/stat-card.tsx | Dashboard metric tile | `/` | 2026-09-18 |
| CyclePicker | src/components/portfolio/cycle-picker.tsx | Reporting-period selector | `/`, `/my-update`, `/reports` | 2026-09-18 |
| ProjectTable | src/components/portfolio/project-table.tsx | Filterable project table (health chips, freshness, lead) | `/` | 2026-09-18 |
| ReportingReadiness | src/components/portfolio/reporting-readiness.tsx | Completeness %, missing list, send reminder | `/` | 2026-09-18 |
| ExceptionCallout | src/components/portfolio/exception-callout.tsx | Highlights the blocked project | `/` | 2026-09-18 |
| UpcomingDecisions | src/components/portfolio/upcoming-decisions.tsx | Decisions awaiting leadership | `/` | 2026-09-18 |
| ReportPaper | src/components/reports/report-paper.tsx | Printable leadership brief (print hooks) | ReportBuilder | 2026-09-18 |
| UpdateHistory | src/components/projects/update-history.tsx | Chronological update log with author + NTID | `/projects/[id]` | 2026-09-18 |
| AuditFilters / AuditTable | src/components/audit/ | Audit log filters and table | `/audit` | 2026-09-18 |

## Server Actions

| Name | Location | Purpose | Last Updated |
|------|----------|---------|--------------|
| signInWithNtid / startPreview / signOut | src/app/actions/auth.ts | NTID auth (maps ntid → `<ntid>@pfizer.com`). `startPreview` issues the shared read-only session via the same `addressFor`/`derivedSecretFor` machinery, skipping `ntid_signin_check` | 2026-09-21 |
| saveProjectUpdate / sendReminder | src/app/actions/updates.ts | Idempotent upsert of weekly update; reminders | 2026-09-18 |
| generateReport / updateReportNarrative | src/app/actions/reports.ts | Report versions with source traceability | 2026-09-18 |
| saveProject / saveProfileAccess / addRosterPerson / saveCycle | src/app/actions/admin.ts | Admin management | 2026-09-18 |

## Data layer

| Name | Location | Purpose |
|------|----------|---------|
| queries.ts | src/lib/data/queries.ts | All server-side reads + `buildPortfolioMetrics`. `SessionContext.isPreview`; `requireWritableSession()` — the guard EVERY mutating action must use |
| status.ts | src/lib/domain/status.ts | Labels, staleness, date formatting, permission helpers. `canPreviewAudit(profile)` is view-gating ONLY — never authorise a change with it |
| validation.ts | src/lib/domain/validation.ts | zod schemas mirroring the DB triggers |
| supabase/client.ts, server.ts | src/lib/supabase/ | `@supabase/ssr` browser + server clients |
| middleware.ts | src/middleware.ts | Session refresh + route protection |
| types/database.ts | src/types/database.ts | Row + view-model interfaces |

## API Routes

| Endpoint | Method | Purpose | Last Updated |
|----------|--------|---------|--------------|
| (none — Server Actions used throughout) | | | 2026-09-18 |

## Database (platform Supabase, project rwcxuppxkdqsijuvbtmn)

Migrations in `supabase/migrations/`:
- `20260918120000_one_shared_view_init.sql` — 8 enums; tables `profiles`,
  `portfolios`, `projects`, `milestones`, `reporting_cycles`, `project_updates`
  (unique `(project_id, reporting_cycle_id)` → idempotent submission), `decisions`,
  `reminders`, `generated_reports`, `audit_events`. RLS on all 10 tables,
  security-definer role helpers, health-conditional validation trigger, project
  health sync, locked-cycle guard, profile-change guard, `ntid_status` RPC,
  `on_auth_user_created` NTID linker (first account bootstraps as admin), and the
  generic audit trigger on 9 tables.
- `20260918120100_one_shared_view_seed.sql` — pilot seed: 8 roster NTIDs, "CMO
  Digital" portfolio, 5 projects, 5 milestones, 3 cycles, 4 of 5 updates submitted
  (readiness discounts stale submissions), 3 open decisions.

- `20260921170000_one_shared_view_profile_contacts.sql` — verified corporate
  emails in `profile_contacts` (one-to-one with profiles). Lead/admin SELECT,
  admin-only writes. Kept off `profiles` so preview never sees email PII. Apply
  copy: `supabase/apply/one-shared-view-profile-contacts.sql`.
- `20260921190000_one_shared_view_audit_entity_id_fix.sql` — `audit_trigger` now
  reads the primary key through jsonb (`id`, falling back to `profile_id`), so a
  table without an `id` column no longer aborts every write with 42703, and
  redacts `profile_contacts.email` from `changes_json` because the preview
  identity can read the audit trail. Apply copy:
  `supabase/apply/one-shared-view-audit-entity-id-fix.sql`.
- `20260922100000_one_shared_view_project_content.sql` — replaces
  `projects.description` with project-level `executive_summary`, moves
  `expected_value` from updates to projects, and removes both fields from the
  weekly update. Latest submitted values are promoted; all removed source values
  are retained in the non-API `one_shared_view_private` archive. Apply copy:
  `supabase/apply/one-shared-view-project-content.sql`.
- `20260922110000_one_shared_view_project_impact.sql` — moves `impact` from
  `project_updates` to `projects`, the last of the three stable fields to leave
  the weekly update. Latest submitted assessment is promoted; every update-level
  value including drafts is archived as text in the non-API
  `one_shared_view_private` archive before the column is dropped. Apply copy:
  `supabase/apply/one-shared-view-project-impact.sql`.

- `20260921150000_one_shared_view_preview_identity.sql` — **the read-only preview
  identity.** Adds `profiles.is_preview`; inserts ONE shared powerless roster row
  (`ntid 'preview'`, `role 'exec'`, no project, no portfolio); adds the single
  SELECT-only `audit_events_select_preview` policy; hardens
  `guard_profile_changes` so `is_preview` is admin-only and a preview session may
  not modify any roster row. No `anon` grant, no write policy, no personal data.
  Apply copy: `supabase/apply/one-shared-view-preview-identity.sql`.

**Status: the init/seed/grants/sign-in migrations are applied.
`20260921170000` (profile contacts) must be applied before local email reminders
work. Preview identity and roster scripts — see current-context.md.**

## Features

| Feature | Status | Pages/Components Involved | Notes |
|---------|--------|---------------------------|-------|
| NTID login + roles | Built | `/login`, middleware, auth actions | 4 roles: owner, lead, exec, admin |
| Project directory + portfolio dashboard | Built | `/` | Health + freshness filters |
| Structured weekly update | Built | `/my-update` | Draft/submit, health-conditional validation, DB-backed drafts |
| Leadership report + print/PDF | Built | `/reports` | Versioned, source-traceable, narrative editing |
| Project detail + history | Built | `/projects/[id]` | Author attribution with NTID |
| Audit trail | Built | `/audit` | DB-trigger written, select-only, lead/admin + read-only preview |
| Administration | Built | `/admin` | Projects, people/roles, cycles. Unreachable in preview (nav hidden AND the page's own `canAdminister` redirect) |
| "Preview the solution" read-only access | Built, awaiting DB apply | `/login`, `(app)` layout, PreviewBanner, all four screen groups | One shared `exec`-role identity; read-only enforced by RLS + `requireWritableSession()`, not just disabled UI. Shows REAL portfolio data — see the 2026-09-21 Rule 2 consent record |
| Reminders | Partial | ReportingReadiness | Recorded in DB; no outbound notification channel (by design) |
| Automated tests | Not built | — | Brief asks for permission/validation/aggregation/report tests |
