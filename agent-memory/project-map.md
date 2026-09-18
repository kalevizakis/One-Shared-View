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
| `/login` | Sign in | NTID + password sign-in and first-time registration | LoginForm | 2026-09-18 |
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
| LoginForm | src/components/auth/login-form.tsx | ntid, password, displayName (register tab) | NTID sign-in / first-time registration | 2026-09-18 |
| UpdateForm | src/components/updates/update-form.tsx | project, health, executive summary, accomplishments, next steps, blocker, leadership ask, health reason, next action + owner, next milestone + date | Weekly update; health-conditional required fields; draft + submit | 2026-09-18 |
| ReportBuilder | src/components/reports/report-builder.tsx | title, audience, 3 content toggles, narrative | Generate report version, edit narrative, print | 2026-09-18 |
| ProjectAdmin | src/components/admin/project-admin.tsx | name, description, owner, lead, lifecycle, cadence | Create/edit projects | 2026-09-18 |
| PeopleAdmin | src/components/admin/people-admin.tsx | ntid, name, job title, role, active | Roster + role/access management | 2026-09-18 |
| CycleAdmin | src/components/admin/cycle-admin.tsx | name, cadence, starts/due/closes, status | Create/edit reporting cycles | 2026-09-18 |

## Components

| Name | Path | Purpose | Used In | Last Updated |
|------|------|---------|---------|--------------|
| AppHeader | src/components/layout/app-header.tsx | Sticky app header, brand, nav, theme, user menu; hidden in print | (app) layout | 2026-09-18 |
| AppNav | src/components/layout/app-nav.tsx | Role-filtered navigation links | AppHeader | 2026-09-18 |
| UserMenu | src/components/layout/user-menu.tsx | Initials avatar, NTID · role, sign out | AppHeader | 2026-09-18 |
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
| lookupNtid / signIn / register / signOut | src/app/actions/auth.ts | NTID auth (maps ntid → `<ntid>@pfizer.com`) | 2026-09-18 |
| saveProjectUpdate / sendReminder | src/app/actions/updates.ts | Idempotent upsert of weekly update; reminders | 2026-09-18 |
| generateReport / updateReportNarrative | src/app/actions/reports.ts | Report versions with source traceability | 2026-09-18 |
| saveProject / saveProfileAccess / addRosterPerson / saveCycle | src/app/actions/admin.ts | Admin management | 2026-09-18 |

## Data layer

| Name | Location | Purpose |
|------|----------|---------|
| queries.ts | src/lib/data/queries.ts | All server-side reads + `buildPortfolioMetrics` aggregation |
| status.ts | src/lib/domain/status.ts | Labels, staleness, date formatting, permission helpers |
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
  (readiness = 80%, matching the mockup), 3 open decisions.

**Status: written and committed, NOT yet applied** — see current-context.md.

## Features

| Feature | Status | Pages/Components Involved | Notes |
|---------|--------|---------------------------|-------|
| NTID login + roles | Built | `/login`, middleware, auth actions | 4 roles: owner, lead, exec, admin |
| Project directory + portfolio dashboard | Built | `/` | Health + freshness filters |
| Structured weekly update | Built | `/my-update` | Draft/submit, health-conditional validation, DB-backed drafts |
| Leadership report + print/PDF | Built | `/reports` | Versioned, source-traceable, narrative editing |
| Project detail + history | Built | `/projects/[id]` | Author attribution with NTID |
| Audit trail | Built | `/audit` | DB-trigger written, select-only, lead/admin |
| Administration | Built | `/admin` | Projects, people/roles, cycles |
| Reminders | Partial | ReportingReadiness | Recorded in DB; no outbound notification channel (by design) |
| Automated tests | Not built | — | Brief asks for permission/validation/aggregation/report tests |
