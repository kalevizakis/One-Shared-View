# Current Context

> **Purpose**: Track what we're actively working on and recent progress.
> **Update**: Continuously as work progresses.

---

## Current Focus

**Active Task**: One Shared View — core loop end-to-end (from the user's uploaded handoff brief).
**Working On**: Login and all five routes work against the live database. Ready to publish.
**Last Action**: Moved the audit vocabulary out of the client filter component into `lib/domain/audit.ts`, fixing the `/audit` render crash. `check:all` clean, all 9 routes build.

## Recent Progress

| What | When | Notes |
|------|------|-------|
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
| Fixed audit page crash | 2026-09-18 | Server-rendered table imported `ENTITY_OPTIONS` from a `"use client"` file, so it was a proxy not an array. Moved audit vocabulary to `lib/domain/audit.ts`; added the missing `portfolios` label; swept all other client files for the same pattern (none) |
| Fixed date hydration mismatch | 2026-09-18 | Server renders UTC, browser rendered UTC+3 → different text for the same timestamp. All formatters now pin `timeZone: DISPLAY_TIME_ZONE` and date-times show the zone name; decisions tile uses `formatMonthDay` instead of local `getDate()` |

## Open Items

| Item | Priority | Waiting On | Notes |
|------|----------|------------|-------|
| Change the `alevik` password | Medium | User | It was echoed into the dev-server log by Server Action arg logging during debugging |
| Replace the demo roster with the real LT team | Medium | User | Done from `/admin` → People; demo personas can then be deactivated |
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
