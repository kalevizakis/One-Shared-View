# Current Context

> **Purpose**: Track what we're actively working on and recent progress.
> **Update**: Continuously as work progresses.

---

## Current Focus

**Active Task**: "Preview the Solution" — read-only access without an NTID. Code is COMPLETE and verified (`check:all` clean).
**Working On**: Nothing blocking in code. THREE SQL scripts now await the user in the SQL Editor — the preview identity plus the two roster scripts from the previous task.
**Last Action**: Built the whole preview feature: migration `20260921150000_one_shared_view_preview_identity.sql` (+ apply copy), `profiles.is_preview`, `SessionContext.isPreview`, `requireWritableSession()` on every mutating action, `startPreview()`, the login-screen entry point, `PreviewBanner`, preview-aware nav/user-menu, audit view gate, read-only `/my-update`, `robots: noindex`, and the `?switch=1` middleware escape hatch.

**Next session must do the live verification** — it needs the migration applied first, so it could not be done now. The checklist is in "Open Items" below.

## Recent Progress

| What | When | Notes |
|------|------|-------|
| **Built "Preview the solution" read-only access** | 2026-09-21 | User chose REAL portfolio data over the recommended fixtures — see the Rule 2 consent record in decisions.md for exactly what is exposed and the three accepted residual risks. Read-only is enforced in the DATABASE: the preview row is `role 'exec'` owning nothing, and every write policy is gated on `can_edit_project()`/`owns_project()`/`is_lead_or_admin()`/`is_admin()`, all false for it. `requireWritableSession()` then guards every mutating Server Action, because a disabled button does nothing against a crafted `next-action` POST. Added no `anon` grant and no write policy. **Two gaps found and closed beyond the plan**: (a) `profiles_update` permits `auth_user_id = auth.uid()`, so a preview visitor could have set `is_preview = false` and switched the whole preview treatment off for everyone — `guard_profile_changes` now makes `is_preview` admin-only and forbids a preview session from touching any roster row; (b) the banner's "sign in" link was a dead end because middleware bounces a signed-in visitor off `/login` — added the explicit `?switch=1` intent flag (a roster lookup in middleware would have cost a DB round trip per request, and the JWT carries no roster data). Verified `reminders_select` needs no preview policy: the readiness tile renders fine with an empty reminders array, so nothing extra was granted | 
| Read handoff brief + prototype + SVG mockup | 2026-09-18 | `/tmp/media/One-Shared-View-Handoff-extract/` |
| Provisioned platform Supabase (user consent) | 2026-09-18 | Project `rwcxuppxkdqsijuvbtmn`; env keys synced |
| Wrote init + seed migrations | 2026-09-18 | 10 tables, RLS, audit triggers, NTID linker, 80% readiness seed |
| Applied "Delivery Intelligence" design identity | 2026-09-18 | globals.css tokens + status spectrum + print rules |
| NTID login, middleware, app shell | 2026-09-18 | `/login`, `(app)` layout, role-filtered nav |
| Portfolio dashboard | 2026-09-18 | Stat cards, filterable table, readiness, decisions |
| Weekly update form | 2026-09-18 | Health-conditional validation, DB-backed drafts, idempotent submit |
| Leadership report + print/PDF | 2026-09-18 | Versioned, source-traceable, narrative editing |
| Project detail, audit viewer, admin area | 2026-09-18 | Completes the chosen scope |
| Removed template header/footer | 2026-09-18 | Barrel export updated |
| Security audit + remediation | 2026-09-18 | Deleted template `src/app/page.tsx`, bumped `next` to 16.3.5, removed `ntid_status` RPC + `anon` grant, dropped `profiles.email`, replaced seed roster with demo personas |
| `check:all` verification build | 2026-09-18 | Clean on Next 16.3.5; routes `/`, `/admin`, `/audit`, `/login`, `/my-update`, `/projects/[id]`, `/reports` |
| Schema applied to nonprod | 2026-09-18 | User ran the combined script; 10 tables, RLS, triggers and pilot seed are live |
| Fixed hanging login (42501) | 2026-09-18 | Root cause: RLS policies without table GRANTs. Added grants migration + `AccessProblem` fallback screen + `SessionUnavailableError` |
| Grants verified applied | 2026-09-18 | User ran the grants script; probed as `alevik` — roster/projects/cycles/updates/decisions all read, audit write correctly refused (403), anon refused (42501) |
| Fixed "unexpected response from the server" | 2026-09-18 | Middleware was answering Server Action POSTs with a 307. Now skips action POSTs; actions use `getSessionForAction`. Reproduced (307) and confirmed fixed |
| Replaced password login with NTID-only sign-in (AWAITING USER APPLY) | 2026-09-21 | Root cause of all sign-up failures finally found: `audit_events` had RLS enabled with a SELECT policy only and no INSERT policy, so the security-definer audit trigger's write was refused — which aborted the statement that fired it. That broke every write on 9 tables, not just sign-up. Fixed with an INSERT policy (trail stays append-only: no update/delete policy, no client insert grant). Sign-in is now NTID-only via `ntid_signin_check` + `link_auth_user_to_roster`; `on_auth_user_created` trigger dropped. Handed over `supabase/apply/one-shared-view-ntid-signin.sql` |
| Earlier sign-up repair was based on a WRONG diagnosis | 2026-09-21 | Blamed `guard_profile_changes`, but a self-assignment is not `IS DISTINCT FROM`, so that guard never fired. Migration 20260921084500 kept (wrapped audit insert is a useful safety net) with a correction header | Every account after the first failed with "Database error saving new user". Linking UPDATE in `handle_new_auth_user` tripped `profiles_guard_changes` (auth.uid() null at sign-up, self-assigned role/active read as a privileged edit) and the audit trigger. Fix: transaction-local `one_shared_view.linking` flag the guard honours, link writes only changed fields, audit write wrapped so it can never abort a sign-up. Handed over `supabase/apply/one-shared-view-signup-repair.sql` (version 20260921084500) |
| Verified NTID sign-in against the live database | 2026-09-21 | Step-1 script confirmed applied and correct: `ntid_signin_check` allows rostered NTIDs, returns identical `denied` for unknown/deactivated, `invalid` for malformed; `link_auth_user_to_roster` refuses an unauthenticated caller (`NOT_AUTHENTICATED`); anon still cannot read `profiles` (42501). **The old "Database error saving new user" is gone** — account creation now succeeds, proving the audit-INSERT-policy fix worked. Two NEW blockers found: (1) `mailer_autoconfirm: false`, so first sign-in dies with `email_not_confirmed` — dashboard setting, not fixable in SQL; (2) login records from the old password screen can never match the derived credential, which affects the `alevik` admin account. Wrote `supabase/apply/one-shared-view-ntid-signin-step2.sql` (deletes roster-linked login records only; `auth_user_id` is `on delete set null` so roster rows and the admin role survive) and added two specific error messages to `auth.ts` so neither blocker is ever silent again |
| Fixed audit trigger 42703 — `record "old" has no field "status"` | 2026-09-21 | Surfaced when step 2 deleted auth users (that sets `profiles.auth_user_id` null via `on delete set null`, firing the trigger on profiles). One `audit_trigger()` serves 9 tables but read `old.status`/`new.status` as record fields; only milestones, reporting_cycles, project_updates and decisions have a `status` column (projects names it `lifecycle_status`). **The `tg_table_name = 'project_updates'` test does NOT guard it** — PL/pgSQL passes the whole IF condition to the SQL engine, which resolves every identifier at plan time, so there is no short-circuit. This aborted EVERY update on profiles, portfolios, projects, generated_reports and reminders — i.e. role changes, project edits, report and reminder writes. The 20260921084500 exception handler could not catch it: the failure is at the IF, before the wrapped INSERT. Fixed by reading `v_old ->> 'status'` / `v_new ->> 'status'` (missing key → NULL, no plan failure); submit/edit_after_submission actions unchanged. Migration 20260921120000, folded into the step-2 apply script as PART 1 |
| Real MRS roster + demo removal scripted (AWAITING USER APPLY) | 2026-09-21 | User asked to delete the demo users and add everyone reporting to Swankoski, Brian R. Refused to invent NTIDs (a guessed NTID either locks out a colleague or grants a stranger access) — asked, and the user supplied the directory list. **Roster is applied from an UNTRACKED script**, because `supabase/apply/` is tracked and the 2026-09-18 decision says real people never enter the repo. NTIDs lower-cased to satisfy the `^[a-z0-9]{3,20}$` check and match sign-in; names stored "First Last" so avatar initials and report text read correctly. Demo delete has two abort guards (no linked logins, at least one active admin survives) and an explicit 8-NTID list rather than `like 'demo%'` |
| Confirmed the demo delete keeps the projects | 2026-09-21 | User chose "delete the people, keep the projects". Verified against the init migration: every profile FK is `on delete set null`, so projects/updates/decisions survive with empty person fields; the single `on delete cascade` is `reminders.recipient_profile_id` (harmless — nothing is delivered). Expect the 5 demo projects to show no owner/lead and no update author until real owners are assigned in `/admin` |
| Fixed audit page crash | 2026-09-18 | Server-rendered table imported `ENTITY_OPTIONS` from a `"use client"` file, so it was a proxy not an array. Moved audit vocabulary to `lib/domain/audit.ts`; added the missing `portfolios` label; swept all other client files for the same pattern (none) |
| Fixed date hydration mismatch | 2026-09-18 | Server renders UTC, browser rendered UTC+3 → different text for the same timestamp. All formatters now pin `timeZone: DISPLAY_TIME_ZONE` and date-times show the zone name; decisions tile uses `formatMonthDay` instead of local `getDate()` |

## Open Items

| Item | Priority | Waiting On | Notes |
|------|----------|------------|-------|
| ~~Apply step 3~~ | Done 2026-09-21 | — | Verified end to end: first sign-in issues a session, roster link returns 204, `alevik` is still `admin`/active, an UPDATE on `projects` (the table 42703 was breaking) succeeds and is recorded in the audit trail attributed to `alevik`, `audit_events` refuses UPDATE and DELETE (42501), off-roster and unknown NTIDs are denied identically, anon cannot read the roster |
| ~~Turn OFF "Confirm email" in the dashboard~~ | Superseded | — | User could not access that setting; replaced by the step-3 SQL trigger |
| ~~Apply step 2~~ | Done 2026-09-21 | — | Verified live: audit trigger repaired, stale logins cleared, roster + admin role intact (`ntid_signin_check` for `alevik` → allowed, `already_linked: false`) |
| Change the `alevik` password | ~~Medium~~ Resolved by design | — | Password sign-in no longer exists; step 2 deletes that login record entirely, so the leaked password is void |
| Apply `supabase/apply/one-shared-view-preview-identity.sql` | High | User | Until this runs, the "Preview the solution" button returns "the read-only preview is not available yet" — there is no roster row for the session to link to. Contains no PII; safe and re-runnable. `supabase_cli` is disabled, so it must go through the SQL Editor like every other script |
| **Verify the preview live, once the migration is applied** | High | The apply above | Not yet done — needs the DB. (1) **Writes**: while in preview, call `saveProjectUpdate`, `sendReminder`, `generateReport`, `updateReportNarrative` and each `/admin` action *as crafted Server Action POSTs* (a `next-action` header bypasses all UI disabling), not just by clicking — each must return the read-only message. (2) **Audit integrity**: preview can SELECT `audit_events` but UPDATE/DELETE are refused (42501), and no audit row is ever attributed to the preview identity (it cannot write, so it should generate none). (3) **No `anon` widening**: re-run the roster-oracle check — an unauthenticated client with the publishable key still reads nothing from every table. (4) **Screens**: all four render with real data; `/admin` unreachable; banner on every screen and absent from the PDF. (5) **Real sign-in unaffected**: an NTID sign-in lands on a non-preview session with its correct role and no banner, and a preview visitor can reach `/login?switch=1` and sign in properly. (6) **Edge cases**: locked cycle; the 5 demo projects have no owner/lead (ProjectTable and UpdateHistory were code-checked as null-safe — confirm live); two concurrent preview visitors sharing the one identity |
| Apply the two roster scripts | High | User | `supabase/apply/one-shared-view-remove-demo-roster.sql` (committed, no PII) and `supabase/local-scratch/add-mrs-roster.sql` (git-ignored, real data). Either order works — the demo delete does not touch the new rows |
| Assign real project owners in `/admin` | Medium | After the scripts are applied | The 5 demo projects will have no owner/lead once the personas are deleted. Also: the real portfolio/projects for MRS are not yet created — the 5 demo projects are still CMO-Digital-flavoured placeholders |
| `supabase/local-scratch/` must stay git-ignored | Ongoing | — | Contains real names/titles/NTIDs. Never move its contents into `supabase/migrations/` or `supabase/apply/`, both of which are tracked |
| Automated tests (permissions, validation, aggregation, report generation) | Medium | Scope decision | Explicit MVP acceptance criterion in the brief; not built |
| Retry Launchpad project-id lookup | Low | Tool availability | Errored with "host is unreachable" on 2026-09-18 |
| Dev-only lint-toolchain CVEs (`brace-expansion`, `browserslist`, `js-yaml`, `baseline-browser-mapping`) | Low | Upstream `eslint-config-next` | 7 high + 1 moderate, all in dev dependencies not shipped to users. Do NOT add blanket top-level overrides (breaks the production toolchain) |

## Known Issues

| Issue | Location | Severity | Workaround |
|-------|----------|----------|------------|
| `mcp__buildme_mcp_server__supabase_cli` disabled | Platform | Known | Manual SQL Editor flow per the supabase-integration temporary block; any NEW migration must be handed to the user the same way |
| RLS policies alone are NOT enough — Postgres needs table GRANTs too | `supabase/migrations/20260918200000` | Fixed (pending apply) | The init migration defined every policy but no `grant`, so signed-in reads failed with 42501 *before* RLS ran. Any future table needs both layers; default privileges now cover new tables. |
| Account `alevik` exists in auth but its password appeared in dev-server logs | Supabase auth | Advisory | Server Action args are logged by the dev server. Recommend the user changes that password once the app is usable. |
| Reminders are recorded but not delivered | `reminders` table / ReportingReadiness | By design | No outbound email/Teams channel wired (security rules) |
| The read-only preview shows REAL portfolio data to any Pfizer colleague with the link | `startPreview` / preview identity | Accepted by the user | Not a bug — a consented Rule 2 exposure. Company sign-in gate is the only identity layer; preview is one shared identity so there is no per-reviewer accountability; the audit screen shows actor NTIDs and field-level diffs. **Never widen it**: no `anon` grant, no write policy, and do not promote the preview row above `exec`. To narrow it later, swap its data source for fixtures — the UI work all stays |
| A worktree needs its own `node_modules` before `build:verify` will run | `.claude/worktrees/*` | Known | A symlink to `/workspace/node_modules` fails ("points out of the filesystem root"); Turbopack needs a real directory. `cp -al /workspace/node_modules ./node_modules` (hard links, fast, gitignored) works |

## Session Notes

- The "80% reporting readiness" figure in the mockup is reproduced deliberately:
  the seed submits 4 of 5 updates for the open cycle.
- The first NTID to register bootstraps as admin (`handle_new_auth_user`), so the
  user should register first with their own NTID after the schema is applied.
- `check:all` is clean on Next 16.3.5. Run `publish-changes` when the user asks
  to publish; the whole app is still uncommitted.
- Security evaluation submitted 2026-09-18 (`mid_development`), verdict
  `issues_found` — the only remaining items are dev-dependency CVEs.
- Roster names in the seed are fabricated demo personas; the real LT roster is
  entered through the admin screen so no personal data is committed.

---

## How to Update This File

**Update "Current Focus":**
- When starting new work
- When switching tasks
- After completing something

**Add to "Recent Progress":**
- After completing any meaningful work
- Keep last 10-15 items (remove oldest)

**Add to "Known Issues":**
- When encountering bugs or quirks
- When finding workarounds

**Session Notes:**
- Important context that doesn't fit elsewhere
- Things to remember for later
