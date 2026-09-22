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
| 2026-09-21 | Real MRS roster (Swankoski + 5 reports) applied from an UNTRACKED script, never a migration | Upholds the 2026-09-18 decision. `supabase/apply/` is tracked in git, so putting real names/titles/NTIDs there would have committed personal data. Created `supabase/local-scratch/` with a `*` .gitignore; verified `git check-ignore` and `git grep` show no real name/NTID tracked | Adding the roster as a normal seed migration (commits PII); entering 6 people by hand in /admin (user preferred a script) |
| 2026-09-21 | Rule 2: real names + job titles + reporting line added to the app's roster | User supplied the list on request after being told NTIDs would not be guessed | Data stays inside the platform Supabase behind NTID sign-in + RLS + the preview SSO gate — the protection already chosen on 2026-09-21. No new exposure surface; nothing outbound. Roles: 4 owners, Prince lead, Swankoski exec |
| 2026-09-21 | No admin rights granted to the six new people | User selected "Keep roles exactly as given" when offered Prince as a second admin | `alevik` remains the only administrator, so only the user can change roles or read the audit trail | Making Prince (PMO Director) a second admin |
| 2026-09-21 | **Rule 2: "Preview the solution" exposes REAL portfolio data to any Pfizer colleague holding the link** | Agent recommended built-in sample/fixture data with no database connection; **user chose real data**, read-only, all four screen groups, mutating controls visible but disabled | **Exposed**: full roster (real names, job titles, reporting line), project health, blockers, leadership asks, and the audit trail (actor NTIDs + per-field change diffs — the most revealing of the four screens). Seven of ten tables have `using (true)` SELECT policies, so the preview identity reads the whole portfolio. **Protection**: the platform's company sign-in gate (the only identity layer, per the 2026-09-21 NTID decision) + read-only enforced in the DATABASE not just the UI + no `anon` grant + no service-role key + `robots: noindex`. **Accepted residual risks**: (1) anyone inside Pfizer with the link sees all of the above; (2) preview is ONE shared identity, so reviewers are indistinguishable — no per-reviewer accountability; (3) the audit trail exposes actor NTIDs and field-level history. **Cheapest future narrowing**: swap the preview session's data source for fixtures (the original recommendation) — all the UI work stays | Fixture/sample-data preview (recommended, declined); adding each reviewer to the roster (rejected — roster membership IS the access grant, so reviewers would gain real standing access); granting `anon` table access (**forbidden** — the publishable key ships in browser JS, so anyone who extracted it could query real data directly, bypassing both the app and the company gate) |
| 2026-09-21 | Rule 2: Remind opens a local email draft using a verified corporate address stored off-roster | User chose local draft + stored email + explicit "Mark sent" confirmation | Addresses live in `profile_contacts` (lead/admin read, admin write only) — NOT on `profiles`, which is broadly readable including by preview. No outbound mailer; `mailto:` cannot prove delivery, so the reminder row is written only after the sender confirms. Residual: leads/admins who can manage reporting can see contact emails | Assuming `<ntid>@pfizer.com`; Microsoft Graph auto-send; putting email on `profiles` |

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
| 2026-09-21 | The audit trigger's PRIMARY KEY access is part of that same rule: `v_entity_id` now reads `coalesce(v_row ->> 'id', v_row ->> 'profile_id')`, never `new.id` | `profile_contacts` is one-to-one with `profiles`, so `profile_id` is its key and there is no `id` column. `new.id` aborted every contact write with 42703 — the third instance of this bug in this project, after `old.status` and the missing audit INSERT policy. Reading the key through jsonb means no future table shape can abort a write through this path | Giving `profile_contacts` a surrogate `id` column (fixes one table, leaves the trigger fragile); dropping the audit trigger from the table (loses accountability for PII changes) |
| 2026-09-21 | `profile_contacts.email` is redacted inside `changes_json`, and the audit row is labelled with the person's display name | `audit_events` is readable by leads, admins AND the preview identity (`audit_events_select_preview`), so an unredacted diff would have handed out the very addresses kept off `profiles` — the privacy boundary would hold on the roster and leak one screen over. Who changed whose contact record, when, and in which direction is still recorded | Auditing the address in full (leaks to preview); not auditing contacts at all (no accountability for a PII change) |
| 2026-09-21 | A shared trigger serving tables of differing shapes must read per-table columns through `to_jsonb(...) ->> 'col'`, never as `old.col` / `new.col` | PL/pgSQL hands an entire IF condition to the SQL engine, which resolves every identifier at plan time. A `tg_table_name = '…'` test therefore does NOT guard a field access — there is no short-circuit — so the trigger fails with 42703 on any table lacking that column. A missing jsonb key yields NULL instead | Guarding with `tg_table_name` (does not work); a separate trigger function per table (nine copies to keep in step) |
| 2026-09-21 | Audit bookkeeping must never abort the change it describes — and the guard has to sit around *all* of it, not just the INSERT | Two separate outages came from this: a refused audit INSERT (no RLS INSERT policy) and a 42703 at the IF *before* the wrapped INSERT. The exception handler added for the first could not catch the second | Wrapping only the INSERT statement |
| 2026-09-21 | The preview identity is a REAL roster row made powerless by role, not a special case in code: `ntid = 'preview'`, `role = 'exec'`, owns no project, leads no portfolio | Every write policy in the schema is gated on `can_edit_project()`, `owns_project()`, `is_lead_or_admin()` or `is_admin()`, and all four are already false for such a profile. So read-only is enforced by the DATABASE — a crafted Server Action POST or a direct REST call with a preview token is refused identically. No new write policy, no `anon` grant, no service-role key. **Do not promote the row to `lead`/`admin`** to make a screen look fuller; `lead` unlocks report generation, narrative editing and reminders. The migration header says so at length | A parallel "fake session" mechanism (two auth paths to keep correct); UI-only disabling (bypassable by crafting a POST) |
| 2026-09-21 | Preview is identified by a dedicated `profiles.is_preview` column, never by string-matching `ntid = 'preview'` | A future roster row could collide with that string, which would either hand a real colleague the read-only treatment or, worse, treat the preview as a real user. `is_preview` is also administrator-only in `guard_profile_changes`, alongside role/active/ntid | Matching the NTID string in application code |
| 2026-09-21 | A preview session may not modify ANY roster row, enforced in `guard_profile_changes` | `profiles_update` deliberately permits `auth_user_id = auth.uid()` so a person can maintain their own display name — which meant a preview visitor could have set `is_preview = false` on the shared row and switched the preview treatment off for everyone (banner gone, read-only UI gone, write guard disarmed). RLS would still have refused the writes, but the app would have stopped telling the truth about what it is | Leaving the self-edit path open (silent, and only discoverable by reading the policy) |
| 2026-09-21 | Audit visibility for preview is a SELECT-only RLS policy (`audit_events_select_preview`) plus a separate view-gate helper `canPreviewAudit`, leaving the three write-permission helpers untouched | `audit_events_select` requires `is_lead_or_admin()`, so preview saw an empty trail. The alternative — widening `canManageReporting` — would have unlocked reports, narrative edits and reminders in one move. `audit_events` has no update/delete policy and `authenticated` holds SELECT only, so the trail stays append-only; and since preview cannot write anything, it generates no audit rows and is never an actor | Promoting the preview row to `lead` (unlocks writes); widening `canManageReporting` (same problem) |
| 2026-09-21 | Every mutating Server Action goes through `requireWritableSession()`; read-only actions and `signOut` keep `getSessionForAction()` | A Server Action is an HTTP endpoint, so disabled buttons defend nothing against a crafted POST. The guard sits at the one boundary every write must cross and returns a readable refusal instead of a raw RLS permission error. `signOut` is deliberately unguarded — a preview visitor must always be able to leave | Per-action ad-hoc checks (one missed action = one open write path) |
| 2026-09-21 | `/login` renders for an existing session only with an explicit `?switch=1`, rather than middleware looking up `is_preview` | Middleware runs on every request, so a roster query would be a DB round trip per navigation, and the JWT carries no roster data. Without the escape hatch the preview banner's "sign in" link was a dead end — the middleware bounced the visitor straight back. Also fixes account switching for real users | Querying `profiles` in middleware (per-request DB cost); leaving the redirect absolute (dead-end link) |
| 2026-09-21 | Reminder delivery is a local `mailto:` draft + explicit "Mark sent", with addresses in `profile_contacts` | User chose local client over Graph auto-send; browsers cannot press Send, so the reminder row must not claim delivery until the sender confirms. Contact email stays off `profiles` so preview/owners never see it | Graph/Outlook Web auto-send; treating draft open as sent; email column on profiles |
| 2026-09-22 | Reporting-cycle deletion is administrator-only and limited to locked/closed cycles with a strictly newer same-portfolio cycle remaining; the rule is enforced by both the Server Action and RLS | A cycle delete permanently cascades to updates, reminders and generated reports, so an unrestricted delete would erase the active reporting period. Decisions remain with a null source link, and project health is recomputed from the newest remaining submitted update so it never points to deleted evidence | UI-only protection; allowing leads to delete through the old `FOR ALL` policy; deleting the current/newest cycle |
| 2026-09-22 | Roster deletion is administrator-only, RPC-only, and limited to inactive, non-preview, non-self profiles with zero business or audit-actor references; contact email may cascade | Profile history and attribution must never be silently nulled or cascaded. All business/history profile FKs now restrict deletion, the RPC locks and rechecks eligibility, and broad read policies require an active profile so a deleted/deactivated user's stale auth token cannot retain data access | UI-only checks; retaining direct table DELETE; allowing `SET NULL`/reminder cascades; treating the separate contact row as a permanent blocker |
| 2026-09-22 | Executive summary and expected value are stable project fields; the redundant project description and both update-level copies are removed | The two values describe the project itself, not one reporting cycle. Existing submitted values are promoted deterministically, while all removed source text is retained in a non-API private archive | Keeping cycle-specific copies; retaining a separate description field |
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
| 2026-09-21 | The preview banner is NOT dismissible (the plan said "dismissible-but-returning"; a non-dismissible thin strip achieves the same intent more simply) | Its whole job is that a reviewer never mistakes real portfolio data for sample data and never wonders why a control did nothing. A bar you can close stops doing that job the moment it is closed. Kept to one thin line so it costs almost no vertical space on every screen | `PreviewBanner`, rendered from the `(app)` layout so it covers every authenticated screen |
| 2026-09-21 | In preview, mutating controls stay VISIBLE but disabled, reusing the existing `readOnly` / `canManage` props rather than any new abstraction | The point of the preview is to show what the solution does; hiding the submit and generate controls would misrepresent it. `UpdateForm`'s `readOnly` fieldset + explanatory alert and `ReportBuilder`'s `canManage` already implement exactly this pattern | `UpdateForm`, `ReportBuilder`, `ReportingReadiness` |
| 2026-09-21 | The preview banner carries `data-print="hide"`, so it is absent from the leadership PDF | The exported report is a document about the portfolio, not about how it happened to be viewed | Matches the existing `data-print` convention in `globals.css` |

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
| Agent workflow | All coding-agent interactions concerning this repository must be routed through the `essence-dev-team` before analysis or action; do not silently bypass this requirement | Invoke the Essence development team on every user turn, including non-code questions about this repository | 2026-09-21 |

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
