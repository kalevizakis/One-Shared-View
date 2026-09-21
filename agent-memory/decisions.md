# Decisions Log

> **Purpose**: Record key architectural, design, and implementation decisions.
> **Update**: After any significant decision is made or confirmed.

## Consent & Security Records

| Date | Item | User's reply | Notes |
|------|------|--------------|-------|
| 2026-09-18 | Supabase database provisioned via platform Spark Pro | Selected "Yes, provision the database" | Platform-provisioned Supabase (project `rwcxuppxkdqsijuvbtmn`). No BYO credentials. No service-role key — RLS is the entire server-side security model. |
| 2026-09-18 | Supabase dashboard access | Access reported `granted` for konstantinos.alevizakis@pfizer.com | Needed because `supabase_cli` is disabled; user applies migrations in the SQL Editor. |
| 2026-09-18 | Migrations `20260918120000_one_shared_view_init` + `20260918120100_one_shared_view_seed` handed over and applied | User: "The database script ran successfully" | Applied via `supabase/apply/one-shared-view-schema.sql` in the nonprod SQL Editor, including the `schema_migrations` bookkeeping rows. Do NOT re-hand these. |
| 2026-09-18 | Sensitive data protection (Rule 2) | User asked for NTID login; selected "NTID sign-in on platform auth" | The app holds internal project status + names/NTIDs. Protection = authentication + RLS + roster-restricted registration. Not left unprotected. |
| 2026-09-18 | Security audit (mid_development) run and submitted | — | 6 checks. 0 critical outbound findings (no external calls, AI providers, hosting configs, analytics, or committed secrets). Fixed: template root route removed, `next` 16.2.10 → 16.3.5 (2 critical CVEs cleared), pre-auth `ntid_status` roster oracle deleted, `profiles.email` column dropped, seed roster replaced with fabricated demo personas. |
| 2026-09-18 | Seed roster is fabricated demo data, not the real CMO Digital LT | Agent decision (no real-person data committed) | NTIDs are invented (`demoown1`…), names carry a "(demo)" suffix, and no e-mail addresses are stored anywhere. Real people are added through the admin screen at pilot time, so no personal data enters the repository. |

No outbound external calls exist in this project. No analytics, error tracking,
external AI, or third-party scripts. Nothing to record under Rule 1b.

## Architecture Decisions

| Date | Decision | Reason | Alternatives Rejected |
|------|----------|--------|----------------------|
| 2026-09-18 | NTID identity mapped to `<ntid>@pfizer.com` on platform Supabase Auth | True enterprise SSO (OIDC/SAML) is unavailable in this prototyping environment; NTID still drives ownership, permissions, and audit attribution, and swaps cleanly to real SSO later | Email-based login (loses NTID as the identity); fake/no auth |
| 2026-09-18 | Roster-gated registration; `profiles.ntid` is the roster key; `on_auth_user_created` trigger links auth users to roster rows; first account bootstraps as admin | Only CMO Digital LT people may sign in; avoids needing a service-role key to seed admins | Open self-registration |
| 2026-09-18 | Roster membership is enforced ONLY inside the sign-up trigger (`raise exception 'NTID_NOT_ON_ROSTER'`). No pre-auth roster lookup function exists | A function answering "is this NTID on the roster?" to an anonymous caller is a roster enumeration oracle. Removed the `ntid_status` RPC and its `anon` grant | Keeping the RPC for nicer login copy |
| 2026-09-18 | `profiles` stores no e-mail address; the sign-in address is derived from the NTID | Minimises stored personal data — the column duplicated data already in `auth.users` for no functional gain | Storing e-mail on the roster row |
| 2026-09-18 | Every table needs BOTH an RLS policy AND a `grant` to `authenticated`; `audit_events` gets `select` only | Postgres checks table privileges *before* RLS, so a policy-only table returns 42501 to every signed-in query. `alter default privileges` now covers future tables | Relying on Supabase's default privileges |
| 2026-09-18 | A readable roster/session failure renders `AccessProblem` instead of redirecting to `/login` | Redirecting on a *valid* session deadlocks against the middleware, which sends the user straight back — the "stuck on Please wait" symptom. Failures must be visible, not circular | Returning null and redirecting |
| 2026-09-18 | Middleware never redirects a Server Action POST (detected via the `next-action` header); it only guards document navigations | The action client expects a React Flight stream. A 307 makes it throw "An unexpected response was received from the server." Actions redirect internally, so the middleware guard is redundant for them | Redirecting all requests uniformly |
| 2026-09-18 | Server Actions use `getSessionForAction()` (returns `{error}`) instead of `getSessionContext()` (throws) | An uncaught throw inside an action surfaces as an opaque client error, not a toast. Pages throw and render `AccessProblem`; actions return a message | Letting actions throw |
| 2026-09-18 | Signed-in `/login` honours `?next=` but only for internal paths (`/…`, not `//…`) | Preserves deep links through the sign-in round trip without creating an open redirect | Always redirecting to `/` |
| 2026-09-18 | Four roles: owner, lead, exec, admin | User selected "Four roles from the brief" | Simpler two-role model |
| 2026-09-18 | Audit trail implemented as a generic `security definer` Postgres trigger on 9 tables, writing per-field `{from,to}` diffs; `audit_events` is select-only for lead/admin | Records cannot be forged or suppressed from the app layer; satisfies the user's "an audit trail needs to exist" | Application-level logging (bypassable) |
| 2026-09-21 | E-mail confirmation neutralised in SQL (BEFORE INSERT trigger on `auth.users` stamping `email_confirmed_at`) rather than via the dashboard toggle | The user could not access Authentication → Sign In / Providers, and without this every first sign-in dies with `email_not_confirmed`. Not a weakening: nobody types an address (the server derives `<ntid>@pfizer.com`), a login is only created after `ntid_signin_check` passes, identity comes from the company sign-in gate, and no confirmation mail can be delivered in this environment — so the step could never succeed and protected nothing. Both real gates are untouched | Waiting on dashboard access (blocks the pilot); asking the user for a service-role key (refused — no BYO credentials) |
| 2026-09-21 | A shared trigger serving tables of differing shapes must read per-table columns through `to_jsonb(...) ->> 'col'`, never as `old.col` / `new.col` | PL/pgSQL hands an entire IF condition to the SQL engine, which resolves every identifier at plan time. A `tg_table_name = '…'` test therefore does NOT guard a field access — there is no short-circuit — so the trigger fails with 42703 on any table lacking that column. A missing jsonb key yields NULL instead | Guarding with `tg_table_name` (does not work); a separate trigger function per table (nine copies to keep in step) |
| 2026-09-21 | Audit bookkeeping must never abort the change it describes — and the guard has to sit around *all* of it, not just the INSERT | Two separate outages came from this: a refused audit INSERT (no RLS INSERT policy) and a 42703 at the IF *before* the wrapped INSERT. The exception handler added for the first could not catch the second | Wrapping only the INSERT statement |
| 2026-09-18 | Validation duplicated in zod (UX) and a DB trigger (integrity) | Health-conditional rules must hold regardless of client | Client-only validation |
| 2026-09-18 | Idempotent submission via unique `(project_id, reporting_cycle_id)` + upsert | Non-functional requirement in the brief | Insert-only with dedupe logic |
| 2026-09-18 | Drafts persist to the database, not localStorage | Brief requires drafts to survive a browser refresh; also keeps data server-side | localStorage draft cache |
| 2026-09-18 | Server Actions everywhere; no API routes | App Router idiom, keeps auth/session server-side | REST route handlers |

## Design Decisions

| Date | Decision | Reason | Context |
|------|----------|--------|---------|
| 2026-09-18 | Status is never communicated by colour alone — `HealthBadge` always renders its label; missing/stale/overdue carry text + icon | WCAG 2.2 AA and an explicit non-functional requirement | Applies to every table, card, and report section |
| 2026-09-18 | Print/PDF via `@media print` with `data-print="hide" \| "paper" \| "break-avoid"` attribute hooks | Export must be a real leadership artefact, no extra dependency | `globals.css`, ReportPaper |
| 2026-09-21 | MVP sign-in is NTID-only (no password); roster membership grants or denies access. Rule 2 consent: user chose "NTID-only + keep preview gate ON" when told the app holds names, job titles, project health and leadership asks, and that without a credential any visitor who reaches the app could enter any rostered NTID including an admin one | Real enterprise SSO needs an IT registration unavailable in this environment. The platform's preview SSO gate is genuine company authentication, so it supplies the identity layer while the roster supplies authorisation. Also sidesteps the broken password sign-up entirely | Password sign-up (repeatedly failed, opaque auth errors); open link with no gate (leadership data unprotected — user declined) |
| 2026-09-21 | Audit writes never abort the change they describe (insert wrapped, failure raised as a warning); roster linking runs under a transaction-local privilege flag | An audit row is important but not more important than a legitimate sign-up succeeding — bookkeeping failure silently killed every account creation after the first. Roster enforcement is unaffected: off-roster and deactivated NTIDs are still refused | Leaving the audit insert unguarded (one edge case blocks all sign-ups); dropping the guard entirely (loses role-escalation protection) |
| 2026-09-18 | Constants shared between server and client components live in `src/lib/domain/*`, never exported from a `"use client"` file | A client file's exports arrive in a server component as client-reference proxies, not real values — `ENTITY_OPTIONS.find()` threw at render on `/audit`. Audit vocabulary now sits in `lib/domain/audit.ts`; `ENTITY_LABELS` must cover every table in the audit trigger's `foreach` list | Re-declaring the list on both sides (drifts) |
| 2026-09-18 | All dates render in one fixed zone (`DISPLAY_TIME_ZONE = "UTC"`, zone name shown on date-times) — never the viewer's local zone | A cycle deadline is a single moment for the whole LT, so "closes 17:00" must read the same in every office; an unpinned `toLocaleString` also renders differently on server (UTC) and client, which throws a React hydration mismatch | Formatting per viewer locale |
| 2026-09-18 | Report content derives from SUBMITTED updates only; missing and stale sources are disclosed in a "Source coverage" section | Leadership must never be misled by incomplete data | ReportPaper, `buildPortfolioMetrics` |

### Design Identity

**Recorded 2026-09-18 — "Delivery Intelligence"**

- **Mood**: precise, trustworthy, calm-under-pressure, executive.
- **Seed**: the project's own subject — portfolio signal clarity. Pfizer blue as
  the institutional anchor, with a dedicated *status spectrum* (green / amber /
  red-clay / neutral blue) that is separate from the brand primary so health
  reads instantly without shouting.
- **Primary**: `oklch(0.3778 0.2618 264.05)` (Pfizer blue #0000c9).
  **Background**: `oklch(0.9814 0.0045 258.32)`. **Foreground**:
  `oklch(0.2297 0.065 268.26)`. Both `:root` and `.dark` blocks written.
- **Status tokens**: `--status-on-track`, `--status-at-risk`, `--status-blocked`,
  `--status-neutral` plus `-bg` pairs, registered in `@theme inline`.
- **Neutral temperature**: cool (blue-leaning greys).
- **Radius**: `0.875rem` — soft enough to feel modern, tight enough for dense tables.
- **Typography**: local Pfizer fonts — PfizerTomorrow (headings), PfizerDiatype (body).
- **Density**: compact — this is a data tool read at a glance.
- **Signature element**: the status spectrum + the exception callout with a
  left-edge status rule.
- **Why**: an executive reporting tool must look institutionally credible while
  making exceptions impossible to miss.

## User Preferences

| Category | Preference | Example | Date Established |
|----------|------------|---------|------------------|
| Identity | NTID is the login and the attribution key | Audit rows carry `actor_ntid` | 2026-09-18 |
| Audience | CMO Digital LT team | Default report audience option | 2026-09-18 |
| Persistence | Entries must be in a database with an audit trail | Platform Supabase + audit triggers | 2026-09-18 |
| Scope | "Core loop end-to-end" first | Login → directory → update → dashboard → report → audit | 2026-09-18 |

## Naming Conventions

| Entity Type | Convention | Example |
|-------------|------------|---------|
| Pages | kebab-case route folders under `src/app/(app)/` | `my-update/page.tsx` |
| Components | kebab-case files, PascalCase exports, grouped by domain | `components/reports/report-paper.tsx` → `ReportPaper` |
| Server Actions | `src/app/actions/<domain>.ts`, verb-first exports | `saveProjectUpdate` |
| Types/Interfaces | PascalCase in `src/types/database.ts`; DB rows keep snake_case fields | `ProjectWithContext` |
| Migrations | `YYYYMMDDHHMMSS_snake_case.sql` | `20260918120000_one_shared_view_init.sql` |

## Patterns Adopted

| Pattern | Where Used | Why |
|---------|------------|-----|
| Server component page + `Suspense` skeleton + client interaction island | every route | Fast first paint, minimal client JS |
| Shared zod schema used by both the client form and the Server Action | UpdateForm / admin forms | One source of validation truth |
| `ActionResult` (`{error?, message?}`) returned from every action, surfaced via sonner toasts | all actions | Consistent, accessible feedback |
| Permission helpers (`canEditProject`, `canManageReporting`, `canAdminister`) mirrored by RLS policies | UI + database | Defence in depth |
| Cycle selection driven by the `?cycle=` search param | `/`, `/my-update`, `/reports` | Shareable, back-button friendly |

---

## How to Update This File

**Add a decision when:**
- User explicitly chooses between options
- You make an architectural choice (and user approves)
- A pattern emerges from multiple implementations
- User expresses a preference ("I like X better than Y")

**Format:**
- Keep entries concise (1-2 sentences max)
- Include the WHY, not just the WHAT
- Date helps track evolution
