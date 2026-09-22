# Changelog

All notable changes to `essence-dev-team` (lean edition) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Semver policy (forward-looking only, adopted 2026-08-07)

**Patch** (`x.y.Z`): fixes only — corrected claims, bug fixes, doc/wording repairs, no new
guards/rules/references/behavior. **Minor** (`x.Y.0`): new guards, rules, references, or
features, or a change to a runtime contract (e.g. the lean-core/playbook split). **Major**
(`X.0.0`): a breaking restructure of the skill's contract. This policy is not applied
retroactively — several past releases (e.g. a directory deletion shipped as a patch, a new
guard shipped as a patch) predate it and are not renumbered, since the version number is
load-bearing (self-update does a semver comparison against it).

## [2.8.0] - 2026-08-11

Ships the 2026-08-06 six-dimension review's remediation plan (`docs/REMEDIATION-PLAN-2026-08.md`,
Phases 0–7.1; Phase 7.2/7.3 follow after this release per the plan's own sequencing).
**Semver rationale:** minor, not patch — the core-slimming change to the lean core / playbook
split (Added/Changed below) alters the runtime contract, which the semver policy above
classifies as minor even though most individual items are corrections.

### Added
- **Fresh-context verification (R#2).** EVALUATE — the final phase of the Generator/Critic
  loop — no longer runs in the context that produced the work. On multi-file/complex
  deliverables and anything under CC#2/CC#5/CC#6, it is delegated to a separate
  `runSubagent` that receives only the artifact, checks a real signal (test exit code,
  command output, file contents) rather than the author's claim of success, and returns
  PASS/CONDITIONAL/FAIL with cited evidence. The author never grades its own work and the
  verifier never implements; where a host offers no subagent mechanism the check runs
  in-context but must be declared as self-performed. Rationale: LLM self-evaluation carries
  a self-preference bias causally linked to self-recognition (Panickssery, Bowman & Feng,
  arXiv:2404.13076), and LLM-as-judge setups show the same self-enhancement bias (Zheng et
  al., NeurIPS 2023 Datasets & Benchmarks Track, arXiv:2306.05685). R#2 previously said only
  "review your own output before delivering" — which the research shows is a weak check by
  construction, not by effort.
- **Three behavioural principles promoted into the always-on core** — previously either
  absent or reachable only through an on-demand reference:
  - **Don't over-engineer (R#3).** Ship the simplest thing that satisfies the actual ask —
    no abstraction for a single call site, no config knob for a constant, no error handling
    for impossible states, no unrequested features; introduce the abstraction on the 2nd/3rd
    real case, never the 1st. The KISS/YAGNI/DRY prose already existed in
    `references/a1-development.md`, but that file only loads when A1 activates, so the
    principle did not apply to non-A1 work. Now stated in the lean core and expanded in the
    playbook, with "solving more than asked is scope growth, not generosity."
  - **Not a people-pleaser (R#4).** New clause: the user's authorship of an idea is not
    evidence for it. Never validate a weak plan because the user proposed it, never open
    with praise, never demote a real objection into an optional-sounding suggestion; say
    "that won't work, here's why" and name the better option. Agreement is earned by
    evidence, not offered as courtesy. R#4 previously covered only *reporting bad news*
    ("no sugarcoating") — it said nothing about refusing to endorse a bad plan.
  - **Verify before asserting (CC#3).** Any claim about *this* repo or system — a file's
    contents, whether a test passes, what a command outputs, whether a symbol exists — must
    come from an actual read/run/grep in the current session, not recall or inference.
    Asserting a negative ("X isn't there") now requires a search that genuinely covers where
    X would live, and an empty tool result counts as *unknown*, not *clean*. CC#3 previously
    mandated *citing* evidence but not *obtaining* it before speaking.
- **Platform Adaptation clause** (lean core) — tool names are now documented as capability
  contracts, not literal bindings, with an explicit fallback mapping (`vscode_askQuestions`,
  `session_store_sql`/Chronicle, `manage_todo_list`, browser tools, `runSubagent`/Explore).
  Makes `skill.json`'s `["claude","copilot"]` platform claim honest — previously several
  MUST/MANDATORY directives were satisfiable only in VS Code.
- **7 new drift-lint checks (a–g)**: footer-priority parity between agent and playbook;
  non-`.md` files banned inside `references/`; missing version frontmatter now FAILs instead
  of silently skipping; `examples/` header version must match `skill.json`; ARCHITECTURE.md's
  "Last verified" date must be ≥ the latest CHANGELOG release; both derived HTML views must
  carry the current version stamp; `changelog:`/`last_updated:` reference frontmatter must be
  internally consistent with CHANGELOG history. Total drift-lint coverage: 79 checks.
- **`tools/release_check.ps1` / `.sh`** — single gate entry point that locates a working
  Python interpreter and runs drift_lint + measure-tokens, exiting non-zero on any FAIL.
- **`tools/hooks/pre-commit`** — git pre-commit shim (installed per `docs/RELEASE-CHECKLIST.md`)
  that runs the release gate automatically on any commit touching `agent/`, `references/`,
  `SKILL.md`, `skill.json`, or `docs/ARCHITECTURE.md`.
- **`tools/render_docs.py`** — regenerates `docs/ARCHITECTURE.html` from its markdown source
  and templates the version/stat strings in `essence-one-view.html`, so both derived views can
  be kept current mechanically at every release instead of by manual promise.
- **`docs/RELEASE-CHECKLIST.md`** — durable, version-agnostic release procedure (one-time
  hook install, the manual gate command, telemetry sync, doc regeneration, and this release's
  version-bump/CHANGELOG/tag sequence).
- **`docs/adr/0002-lean-core-playbook-split.md`** and **`0003-self-update-gh-api.md`** —
  backfilled ADRs recording why the lean-core/playbook split and the authenticated `gh api`
  self-update check were adopted.
- **Local git repository** for the canonical SSOT workspace — the workspace had no version
  control at all before 2026-08-07; history, diffs, and the pre-commit gate now exist.
- `infrastructure/telemetry/pricing.py` `get_pricing()` now returns a matched-flag; the
  dashboard renders a "⚠ estimated" marker next to any model whose cost used the unmatched
  fallback tier (previously silent, could under-price an unrecognized model ~20× unflagged).
- Receiver hardening: `before_request` Host-header allowlist (`localhost`/`127.0.0.1`, else
  403); optional `ESSENCE_RECEIVER_TOKEN` env var gates the two read (`GET`) endpoints with a
  bearer token when set (unset by default — behavior unchanged unless configured).

### Changed
- **Core slimming** (per the review's D2 decision): the lean core's `## Token Dashboard` and
  `## Self-Update` sections are condensed to 2–3-line pointers; full operational detail now
  lives only in `agent/essence.playbook.md` (previously duplicated in both). Token-budget
  claims re-measured post-slim and now pass `measure-tokens.py` (previously 20–22% stale).
- Footer Policy priorities synced across agent and playbook: update-check=1, R#1=2, R#8=3,
  R#12=4 (the playbook had drifted to a stale 3-slot numbering).
- Canonical `ORDER` now includes A8 (`A7→A8→A6→A9→A1/A3→A9→A2→A4→A5→A10`), matching the
  long-standing dependency rule that A6 works after A8 scopes.
- Non-Negotiable #1 now defines the `{personas}`/`{rules}`/`{refs}` header placeholders with a
  worked example (previously undefined, left to model inference).
- Non-Negotiable #4 reworded to reference the Footer Policy's T8/T12+ schedule explicitly,
  replacing an "after turn 8" phrasing that read as firing every turn.
- R#1's "Cost of 4 questions" corrected to "Cost of 2–3 questions" (matches the rule's own
  stated cap and the playbook's existing wording).
- `DASHBOARD-PULL` step lists in the agent file and playbook — previously two independently
  maintained copies that disagreed on step order — replaced with a single pointer to the
  a5-infrastructure reference's canonical protocol (that reference's own content is unchanged
  this release).
- Semver policy adopted (see the policy note above this entry) — forward-looking only.
- `persona:` frontmatter normalized to one convention (`A<N> <Domain>` / `Cross-cutting`)
  across all 21 references (previously four inconsistent styles).
- `a1-development.md`'s inline Sources line promoted to a proper `## Sources` section;
  `a9-reusable-components.md` gained a `## Red Flags — Stop and Reconsider` section (9 of 10
  persona domains already carried this pattern).
- `docs/ARCHITECTURE.md` re-verified end-to-end against the current agent file (previously
  frozen at v2.6.0-generation prose under a newer badge); added Self-Update, Footer Policy,
  and worktree-isolation to the request-lifecycle description; corrected the §10 file
  inventory.
- Logo debris relocated: 2 SVGs → `docs/assets/`; screenshots and analysis docs (belonging to
  an unrelated project) → `_archive/logo-platform/`, excluded from packaging.
  `DASHBOARD_COST_SOURCE.md` moved into `infrastructure/telemetry/`, next to `pricing.py`.
- `.code-workspace` folder entries labeled (multi-root workspace mounts this skill alongside
  the v3.0 rebuild and other reference material — wrong-tree edits were an open risk).

### Fixed
- Shipped `essence-token-dashboard.html` (530 KB) embedded real internal engagement names and
  the author's own usage/cost profile — replaced with a genuine empty-state template (43 KB),
  regenerated against a throwaway database and verified to contain zero internal names.
- Hardcoded personal paths removed from `docs/ARCHITECTURE.md` and `evals/run-ab-eval.ps1`
  (the latter now takes `-TextOnlyPath`/`-ImageHybridPath` params with `$PSScriptRoot`
  defaults, making it runnable by anyone).
- `infrastructure/telemetry/setup.py`'s `COPY_FILES` sync manifest never included
  `pricing.py`, even though `updater.Dockerfile` requires it in the build context — any
  sync-triggered updater rebuild would fail. Found and fixed while executing this release's
  own Phase 7.1 telemetry sync; a stale directory-level Windows ReadOnly attribute on the
  deployed `receiver/` folder (blocking `rmtree` even though empty) was cleared in the same
  pass.
- `~/.essence-telemetry`'s deployed `receiver/` directory was empty (the pricing.py
  single-source refactor never reached the deployed copy) — resynced; all 4 containers
  (postgres, receiver, aspire, updater) verified healthy post-sync.
- One-shot session artifacts removed from `infrastructure/telemetry/`: `_fix_encoding.py`,
  `verify-workspace-spike.ps1`. `FILTER-BUG-HANDOFF.md` marked `[RESOLVED 2026-06-04]` and its
  stale "all 14 models" claim corrected to the actual 11 entries.
- `cookie.txt` (an empty but primed SSO-token leak vector), a stale `infrastructure/telemetry/.env`
  lacking required keys, 4× `__pycache__/`, and 2 stale `references/*.bak_*` backups removed
  (the new local git history makes on-disk backups redundant).

**Retroactively logged** (per the existing precedent for undated past fixes): the GenAI RAMP
documentation addition is logged under `[2.6.0]`; the telemetry-script DB connection leak fix
was already logged under `[2.6.1]`; a10's Quality Verdict formula replacement is logged under
`[2.4.2]`.

## [2.7.2] - 2026-08-06

### Fixed
- **CC#1 destructive-op triggers were Unix/database flavoured.** The recursive-force-delete and disk/volume-wipe triggers now name PowerShell forms (`Remove-Item -Recurse -Force`, `rd /s`, `del /s`, `rmdir /s`, `Clear-Disk`, `Format-Volume`, `diskpart clean`) alongside the Unix originals in `agent/essence.agent.md`'s `GUARDS[8]` table, with a new `cc1Equivalents[6]` mapping and "judge the effect, not the spelling" clarification in `agent/essence.playbook.md` (PowerShell aliases `rm`/`del`/`rd`/`rmdir` to `Remove-Item`, so the literal `rm -rf` trigger alone was not valid PowerShell).
- **Self-update version check used an unauthenticated raw-URL fetch that always 404s.** `pfizer-oneweb/skills` is a private repository, so `raw.githubusercontent.com` cannot serve the published manifest to any user. The check in `agent/essence.agent.md`, `agent/essence.playbook.md`, and the *ESSENCE Self-Update Runbook* (`references/a5-infrastructure.md`) now uses an authenticated `gh api repos/pfizer-oneweb/skills/contents/...` call, and reports the check as *unknown* (never blocking the session) when `gh` is unavailable. Versions 2.7.0 and 2.7.1 shipped with the broken raw-URL check and could never detect an update.

### Changed
- Version bump: `2.7.1` → `2.7.2`.

## [2.7.1] - 2026-07-20

### Added
- **A1 — Run isolation via git worktrees (documented practice).** New `references/a1-git-workflow.md §8 Run Isolation via Worktrees` covers isolating scheduled/autonomous/loop-triggered runs in a dedicated `git worktree` keyed by run-id, a registry pattern in `/memories/repo/` to prevent double-claiming, and treating worktree/branch removal as a CC#1 destructive op. New Red Flags row (`redFlags[6]→[7]`) for two runs sharing one working tree.
- **R#6 (Delegate) design update.** `agent/essence.playbook.md` and the `agent/essence.agent.md` rule index now note that autonomous/loop delegation must isolate per-run via worktree, cross-linking to the new `a1-git-workflow.md §8`.

### Changed
- Version bump: `2.7.0` → `2.7.1`.

## [2.7.0] - 2026-07-16

### Added
- **Self-update (version notify + approval-gated upgrade).** New `## Self-Update` section in `agent/essence.agent.md` plus a full *ESSENCE Self-Update Runbook* in `references/a5-infrastructure.md` and expanded prose in `agent/essence.playbook.md`. On workspace-grounded session starts (Non-Negotiable #3), throttled to ≤1/24h via `~/.essence-telemetry/.update-check`, ESSENCE compares its installed `skill.json` version against the published manifest on `pfizer-oneweb/skills@main` (HTTP GET, [CC#7] untrusted-data parse of the semver only). If a newer version exists it raises a one-line update-available footer; on explicit "update ESSENCE" it backs up the active install ([CC#1]), runs `npx skills update essence-dev-team -y`, warns about hand-synced copies the CLI does not manage, then verifies (header + `drift_lint`). Never auto-applies (CC#1 + CC#4).
- **Footer Policy priority-1 slot for the update notice.** `FOOTER[3]` → `FOOTER[4]`: the update-available line takes priority 1; the R#1 model-cost hint, R#8 retrospective note, and R#12 session-health footer shift to priorities 2/3/4. Still one arbitrated slot, never stacked. R#1/R#8/R#12 slot references updated to match.
- **VS Code 1.128 managed-telemetry precheck.** The `DASHBOARD-PULL` SETUP gate in `references/a5-infrastructure.md` now flags that, since VS Code 1.128, an org-managed OpenTelemetry `telemetry` block overrides `OTEL_*` env vars and user settings (managed always wins) — the likely cause of a silently empty local Token Dashboard.

### Changed
- Non-Negotiable #3 now also runs the throttled update-check on workspace-grounded session starts.
- Version bump: `2.6.1` → `2.7.0`.

## [2.6.1] - 2026-07-06

### Added
- **A2 — UAT comparison-workbook methodology.** `references/a2-testing.md` gains a *Building UAT Comparison Workbooks (Dashboard / Data-Validation)* section: the two-scenario-class model (functional `RA-NN` vs data-validation `C-NN`), reference-sheets-first structure, dual-block system-vs-baseline layout, live-linked rollup sheet, requirements-gathering discipline (Done-only, acceptance-criteria-derived), the agent-as-baseline comparison pattern (incl. the AGGREGATE-row rounding artifact), executor-friendly filter formatting, and multi-day session-continuity practice. Proven on RADAR+ v3.1 (47 scenarios).
- **A2 — Excel workbook automation (Python win32com).** New *Excel Workbook Automation* section: when openpyxl drops x14 dropdowns (READ-only), the binary-copy-then-COM-edit pattern, COM robustness (kill EXCEL.EXE, retry Open/Worksheets, index-based sheet delete), the late-bound `Characters()` gotcha requiring `EnsureDispatch`, common ops (row-format replication, cell-sized image embed, text→date prevention, BGR color ints), and agent-PS-shell recovery.
- Reference catalog `load-when` for `a2-testing.md` now advertises UAT-comparison-workbooks and Excel-COM-automation; `SKILL.md`'s Testing bullet updated to match.

### Changed
- Version bump: `2.6.0` → `2.6.1`.

### Fixed (retroactively logged)
- **Telemetry query-script DB connection leak on exception.** `infrastructure/telemetry/query-summary.py` and `full-summary.py` did not close their PostgreSQL connection if an exception occurred mid-query. Added `atexit.register(conn.close)` so the connection closes on any exit path, not just the success path. Undated at the time; attributed to this release per the maintainer PR-review record naming it as "Fixed in v2.6.1" alongside the `pricing.py` SSOT refactor.

## [2.6.0] - 2026-07-05

### Fixed
- **D1-D5 drift (ship-blockers).** `SKILL.md` said "the 7 guards" (world is 8 since CC#7 landed in v2.5.1); `SKILL.md`'s Text References list was missing `chronicle-session-history.md` (20 bullets vs `REFS[21]`); `agent/essence.playbook.md`'s authority blockquote anchored `REFS[20]`; `docs/ARCHITECTURE.md` stated "7 guards," `REFS[20]`, and a 20-file reference catalog in three places; `SKILL.md`'s Token Budget table printed stale ~3,900/~4,900 while the prose two lines above already said ~4,000/~5,000. Also found and fixed while auditing: `references/architecture.md` still said `CC#0-6` and claimed `agent/` held 1 file (missing the playbook); `tools/drift_lint.py` checks #3 and #8 were themselves asserting/printing the stale 7-guard figure.

### Added
- **Lint hardening (L1-L4).** `docs/ARCHITECTURE.md` is now in drift-lint scope: version-stamp check, guard/rule presence, stale-count scan, mojibake, and link integrity (48 relative links now checked). New stale-**guard**-count check mirrors the existing stale-rule-count check. `evals/measure-tokens.py` now verifies token claims in both `SKILL.md` and `docs/ARCHITECTURE.md` (4 claims, was 2). New check compares `SKILL.md`'s Text References bullet count against `REFS[N]` — this is what would have caught the missing `chronicle-session-history.md` row (D2). Lint went from 48 to 52 checks, all passing.
- **`## Footer Policy` section in `agent/essence.agent.md`.** R#1's model-cost hint, R#8's retrospective cost note, and R#12's session-health footer previously carried full prose (with mutual-suppression clauses) inline in `RULES[12]`, duplicating the cost-hint machinery across two of the fattest rows in the lean core. Consolidated into one `FOOTER[3]` TOON table with an explicit priority order (R#1 > R#8 > R#12) and a single-slot, never-stack rule; `agent/essence.playbook.md` prose updated to match.

### Changed
- **Non-Negotiable #3 gated (T2).** The Chronicle query + Token Dashboard setup check on session first turn now only fires when the request carries workspace/codebase grounding (references files, code, "this repo", or continuation language). A standalone request with no workspace grounding (e.g. a general-knowledge question) skips both checks, removing a fixed tool-call tax from the sessions the lean design is meant to keep cheap. Synced across `agent/essence.agent.md`, `agent/essence.playbook.md`, and `references/chronicle-session-history.md`.
- Version bump: `2.5.1` → `2.6.0`.

### Fixed (hygiene)
- Added `.gitignore` (`__pycache__/`, `*.pyc`, `*.bak*`, `cookie.txt`, `_env`/`.env`).

### Added (retroactively logged)
- **Pfizer GenAI RAMP (Risk Assessment & Mitigation Plan) assembly.** A4 gained the ability to author a 12-risk-domain / 33-question triage RAMP document, with A7 owning risk-severity calls, documented in `references/a4-documentation.md § GenAI RAMP`. No contemporaneous CHANGELOG entry was made; dated here from the pre-RAMP working backup's mtime (2026-06-30), placing the work in the earliest release after that date.
- `infrastructure/telemetry/update-dashboard.py`'s hardcoded `LOCAL_TZ = timezone(timedelta(hours=3))` is now `DASHBOARD_TZ_OFFSET_HOURS` (env var, defaults to 3), wired through `docker-compose.yml`.

## [2.5.4] - 2026-07-01

### Added
- **Pre-Push / Pre-PR Gate.** A mandatory pre-flight checklist now fires on any git-remote action (push, "open a PR", "ship it", commit-and-push). R#8 (Build/Run/Verify) carries the trigger in the always-on lean core; the full 10-step checklist lives in `references/a1-git-workflow.md → §3 Pre-Push/Pre-PR Gate`. Steps: `git fetch` first (never reason off a stale base) → ahead/behind vs fresh remote → `git diff --check` → author identity → `.gitattributes` → dependency-already-on-main → project linter → draft PR description → CHANGELOG + semver bump for any behavior change → refresh the marketplace "What's new" copy. Promotes a previously informal habit into an enforced, rule-owned gate so it survives fresh sessions and model changes.

### Changed
- **Version bump:** `2.5.3` → `2.5.4`.

## [2.5.3] - 2026-06-30

### Added
- **R#2 / R#3 doctrine framings.** EVALUATE-phase gut-check ("would a staff engineer approve this?") and a "feels hacky → redo it the elegant way" elegance trigger added to R#2 (Generator/Critic); a "work goes sideways → STOP and re-plan, don't keep pushing" trigger added to R#3 (Scope Control). Both carry an explicit "skip for simple/obvious fixes" caveat so they don't encourage over-engineering. Adapted from a community `CLAUDE.md`; redundant directives were rejected as already covered by R#1/R#5/R#6/R#8.
- **drift-lint cross-fork body-sync check (#14).** `tools/drift_lint.py` now verifies that every deployed fork of `agent/essence.agent.md` / `agent/essence.playbook.md` — the global agent (`~/.copilot/agents/essence-global.agent.md`) plus any paths from the `$ESSENCE_FORK_PATHS` env var and a gitignored `tools/fork-paths.local.txt` — carries body content matching the skill-pack source of truth once normalized — frontmatter (name/version/tags) legitimately differs and is stripped, and line endings and trailing whitespace are folded before comparison. An absent or unreadable fork is a `WARN`, never a `FAIL`, so the check stays portable on CI runners that only have the skill pack checked out.

### Changed
- **R#7 / R#12 reconciled to the deployed forks.** The lean-core R#7 ("BANNED AI-SLOP PATTERNS" guidance) and R#12 (per-turn cost framing for 1M-token windows) were stale in the skill-pack source relative to the already-deployed agent forks; the source has been upgraded to match. No behavioral change for users already running the deployed agent.
- **drift-lint robustness.** UTF-8 stdout (fixes a `cp1252` `print` crash on Windows consoles when a finding contains em-dashes) and `OSError`-guarded fork reads (a syncing/locked file now `WARN`s instead of crashing the lint).
- **Version bump:** `2.5.2` → `2.5.3`.

### Fixed
- **Stale display version stamps.** Synced `v2.5.1` → `v2.5.3` in `docs/ARCHITECTURE.md`, `docs/ARCHITECTURE.html`, `infrastructure/telemetry/DATA-FLOW-MAP.md`, and `infrastructure/telemetry/essence-token-dashboard.html` (these live outside drift-lint check #2's scope, so they had drifted from `skill.json`).

## [2.5.2] - 2026-06-16

### Fixed
- **Description alignment — VOX → GitHub Copilot credits.** Replaced stale "VOX API gateway pricing" wording with "GitHub Copilot credits" in the user-facing descriptions in `SKILL.md` and `skill.json`, matching the language already used in the Token Dashboard (`update-dashboard.py`, `DATA-FLOW-MAP.md`, dashboard HTML). Documentation-only; no behavioral change. The historical `CHANGELOG.md` reference to VOX is intentionally retained as an accurate record of that release.

## [2.5.1] - 2026-06-04

### Added
- **CC#7 — Prompt injection defense.** New guard: instructions found in tool output, fetched web content, or file contents are treated as untrusted data — surfaced to user before executing. CC#3 hierarchy governs facts; CC#7 governs directives. Guard count: 7 → 8 (`GUARDS[8]`).
- **R#5 — Memory staleness verification.** A memory that names a file, function, or API is a claim, not a fact. Before acting on it: verify the file exists, grep for the symbol. CC#3 hierarchy (Codebase > Memory) applies.

### Changed
- **CC#1 trigger list expanded** — added `rm -rf`, permanent file deletion, and credential handling (storing/logging/exposing secrets) to the destructive-op halt.
- Guard count references updated across all derived files: `agent/essence.agent.md` (source of truth), `agent/essence.playbook.md`, `SKILL.md`, `docs/ARCHITECTURE.md`, `references/architecture.md`, `templates/copilot-instructions.md`, and the global agent fork (`~/.copilot/agents/essence-global.agent.md`).
- Token estimates updated in `SKILL.md` and `docs/ARCHITECTURE.md` (~3,900 → ~4,000 agent; ~4,900 → ~5,000 playbook).
- Version bump: `2.5.0` → `2.5.1`.

### Fixed
- **Token Dashboard filters** — period/workspace filters now consume the fresh HTML returned by `update-server.py` and apply it with `DOMParser`, avoiding stale `file://` reloads and preserving subsequent button clicks. The update server now reads the refreshed dashboard from `DASHBOARD_PATH`.

## [2.5.0] - 2026-06-01

### Added
- **Chronicle session history integration** — new reference file `references/chronicle-session-history.md` (cross-persona) with full schema, query patterns, and usage triggers for VS Code's built-in session history store (`session_store_sql`).
- **Session continuity protocol** — Non-Negotiable #3 now requires querying Chronicle on session first turn for workspace continuity context.
- **R#5 Chronicle cross-check** — before writing new memory, R#5 now checks Chronicle for existing session history to avoid duplicating raw facts.

### Changed
- Reference catalog count: `REFS[20]` → `REFS[21]` (added `chronicle-session-history.md`).
- `agent/essence.playbook.md` R#5 expanded with Chronicle cross-check and session continuity bullets.
- Version bump: `2.4.2` → `2.5.0`.

## [2.4.2] - 2026-05-31

### Added

- **Per-workspace cost attribution (Token Dashboard).** The dashboard now tracks token spend by individual workspace, with a dashboard-wide filter to isolate a single project. `update-dashboard.py` gained a `--workspace` argument and an index-friendly attribute predicate; `update-server.py` accepts a `workspace` query parameter. A self-healing functional index (`idx_spans_workspace_name`, created idempotently on every refresh) keeps filtered queries fast and heals existing installs automatically. The workspace dropdown renders on its own row beneath the period filter and stays within the header card.
- **`essence-code` launcher scripts** (`infrastructure/telemetry/essence-code.ps1`, `essence-code.sh`) — tag each VS Code window with `OTEL_RESOURCE_ATTRIBUTES=workspace.name=<name>` so its sessions are attributed to the right project in the dashboard. Historical (pre-tag) spans surface as `(untagged)`.
- **`evals/measure-tokens.py`** — a deterministic, re-runnable token-budget harness that measures the lean-core and playbook token counts from the shipped files (replaces the retired unverifiable efficacy percentage). **`evals/test-lean-load-behavior.md`** — a fixture verifying the playbook auto-load contract.
- **`docs/ARCHITECTURE.md`** (+ `.html`) — human-facing system architecture reference, replacing the deleted architecture diagram.

### Fixed

- **Self-description drift sync (Round 1)** — brought the metadata layer into agreement with `agent/essence.agent.md` (now declared the canonical source of truth). Truth set: 7 guards (CC#0–CC#6), 12 rules (R#1–R#12), 20 reference files, 4 rejection domains.
  - `agent/essence.agent.md` — fixed `GUARDS[6]` → `GUARDS[7]` (block lists 7 guards CC#0–CC#6; count label was off by one). Added source-of-truth declaration.
  - `references/architecture.md` — version 2.3.1 → 2.4.2; loading order/precedence corrected to `CC#0-6, R#1-12` (was `CC#1-6, R#1-10`); added CC#0 Input Normalization to Layer 1 and R#11 Observability / R#12 Session Health to Layer 2; reference count 16 → 20.
  - `templates/copilot-instructions.md` — restored the missing **CC#0 Input Normalization** constraint (list silently started at CC#1); clarified that Persona Dependency Validation is Routing → `DEPENDENCY-RULES` logic, not a numbered rule.
  - `SKILL.md` — qualified the unproven "100% accuracy" claim to "12/12 on the v2.3.0 A/B suite" with a method caveat; expanded the 47% with token counts.
  - `images/essence-architecture.svg` (+ regenerated `.png`) — footer version 2.3.0 → 2.4.2; added the 4th rejection domain (Tableau → essence-tableau-developer).
- **Version alignment** — bumped every canonical stamp to 2.4.2 (`skill.json`, `references/architecture.md`, `images/essence-architecture.svg`); brought the two stale reference images (`images/a3-ux-reference.svg`, `images/a6-business-analysis-reference.svg`) from 2.3.0 up to 2.4.2.
- **Added `tools/drift_lint.py`** — CI-ready consistency checker. Parses `agent/essence.agent.md` + `skill.json` as the single source of truth and fails the build when any satellite disagrees (count labels vs real rows, version stamps, CC#0/R#11/R#12 presence, stale rule counts, reference count, rejection domains, mojibake, error-envelope field name). Caught the version drift this entry resolves.
- **Error-envelope contract unified (finding K)** — the shipped "Standard Error Response" JSON disagreed on its trace field: `a1-error-handling.md` used `correlationId` while `a1-project-scaffolding.md` used `request_id`. Standardized on `correlationId` (matches the tracing layer already wired through `a1-logging-observability.md`). The drift-lint envelope check was narrowed to the JSON `"error"` body only, so it no longer flags language-idiomatic variable names (`correlation_id` in Python) or the wire header (`x-correlation-id`).
- **Mojibake repaired (finding I)** — `a1-input-validation.md` and `a6-business-analysis.md` had double-encoded (UTF-8→cp1252→UTF-8) characters corrupting their ASCII-art diagrams and the ROI formula. Byte-level repair restored `┐` (box corner), `←` (arrow), and `×` (multiplication sign); both files now decode as clean UTF-8.
- **Reference-file version stamps unified** — all 20 `references/*.md` frontmatter `version:` fields were stale (`2.3.0`/`2.3.1`) while the marketplace release is 2.4.2. Bumped every reference file to `2.4.2` so the per-file stamp matches the published release. `tools/drift_lint.py` check #2 now validates every `references/*.md` frontmatter version against `skill.json` (previously only `architecture.md` was checked), closing the blind spot that let the whole set pass silently.
- **Rule-count history clarified** — the earlier `RULES[13]` → `[12]` change was "Persona Dependency Validation" being relocated from a numbered behavioral rule into Routing → `DEPENDENCY-RULES` (no capability lost); previously unlogged.
- **A10 Quality Verdict formula replacement (retroactively logged).** The weighted 0.0–1.0 Quality Score formula in `references/a10-quality-control.md` was replaced with a per-component **PASS / CONDITIONAL / FAIL** Quality Verdict: the 0.0–1.0 sub-scores were unmeasurable (the model cannot reliably count its own claims or quantify its own hallucination rate), and multiplying invented numbers by precise weights created theatrical precision. No contemporaneous CHANGELOG entry was made; dated here to this release from the file's own `last_updated: 2026-05-30` stamp, one day before this release.

Drift-lint was green after this round; the final check count for the release is reconciled at the end of this entry.

### Changed

- **Lean conversion — image-hybrid retired (2026-05-30).** The mandatory architecture image was removed as a runtime dependency. The agent now ships as a two-tier text model: a lean always-on core plus a full rule playbook auto-loaded on demand. No SSOT counts changed (7 guards / 12 rules / 20 references / 4 rejection domains all preserved); drift-lint stayed 39/39 green throughout.
  - `agent/essence.agent.md` — now the **lean always-on core**: 7 guards, routing table, a one-line index of all 12 rules, and the 20-file reference catalog (~3,900 text tokens). Dropped the Non-Negotiable image-processing mandate, the "Architecture Image" and "Image References" sections, and the verbose Token Dashboard prose. Added a `## Playbook Auto-Load` contract and kept CC#1's destructive-op table inline.
  - `agent/essence.playbook.md` — **new** companion holding the full rule prose (4-phase R#2, full R#1/R#8 detail, governance/CC#6 table, collaboration examples, output catalog; ~4,900 text tokens). Auto-loaded only for reasoning-heavy, compliance-sensitive (PHI/PII, auth, prod, CC#6), scaffolding, or destructive (CC#1) requests; contributes 0 tokens on simple execution tasks. Placed in `agent/` (not `references/`) so REFS stays 20 and no cascade is triggered.
  - `agent/essence.agent.fulltext.md` — **removed**; superseded by the playbook split.
  - `images/` diagrams (architecture, A3, A6) are now **optional, human-facing references** — no longer processed by the agent and not required at runtime. Vision is no longer a requirement; the agent is model-agnostic and runs entirely from text.
  - `skill.json`, `SKILL.md`, and this file's tagline updated from "image-hybrid edition" to "lean edition".
  - **Stale efficacy numbers retired (finding H).** The previous "~47% token savings (~2,368 vs ~4,500)" claim credited the now-removed architecture image and could not be reproduced from actual file sizes; it is intentionally not carried forward. `SKILL.md` now reports measured text-token counts only (lean core ~3,900 always-on; playbook ~4,900 pay-per-use) with no fabricated percentage. The v2.3.0 12/12 A/B pass rate predates the lean split and has not been re-run — flagged accordingly; re-evaluate `evals/` before making any current pass-rate claim.

### Removed

- **`images/` directory deleted entirely (2026-05-30).** A 38-concept gap analysis confirmed the three diagrams (`essence-architecture`, `a3-ux-reference`, `a6-business-analysis-reference`, each as `.png` + `.svg`) encoded **zero** LLM-consumable information not already present in full prose in the persona reference files — and the lean agent never loaded them. Deleting them is provably zero-capability-loss for a model-agnostic, text-only skill.
  - `agent/essence.agent.md` — dropped the loading-protocol image clause, the routing/REFS `Load image:` directives for A3/A6, the `## Persona Images` section, and the `images/essence-architecture.svg` entry from the source-of-truth list.
  - `tools/drift_lint.py` — retired the three SVG version-sync checks and the SVG mojibake/stale scans; **repointed check #5 (rejection-domain coverage)** from the architecture SVG to the text SSOT (the `REJECT[4]` block in `agent/essence.agent.md` **and** `SKILL.md`). Check total 49 → 47.
  - `skill.json` — removed the `docs[]` entry pointing at `images/essence-architecture.png`.
  - `SKILL.md`, `docs/ARCHITECTURE.md`, `docs/ARCHITECTURE.html` — removed image inventory rows, the subsystem-map image node, and the "human-facing diagrams" descriptions; pointed readers to `docs/ARCHITECTURE.md` instead.
- **`evals/test-image-comprehension.md` deleted.** The fixture tested vision comprehension of the now-removed architecture diagram and is obsolete for a text-only skill; the historical run record in `evals/RESULTS.md` is retained as a point-in-time record.

Drift-lint is fully green for the release: **47/47 checks** (image-removal retired the three SVG checks, taking the total 49 → 47).

## [2.4.1] - 2026-05-24

### Fixed

- **R#1 Interview regression** — `vscode_askQuestions` and `ASSUMPTIONS I'M MAKING` block now marked MANDATORY (not suggestive). Omitting assumptions linked to CC#3 violation. Added cost justification: "cost of 4 questions << cost of wrong plan".
- **R#6 Delegation regression** — strengthened from "use" to "MUST use" Explore agent for files >100 lines. Added HALT-and-reroute instruction and compaction consequence warning. Explicit note that R#12 Token Economy does NOT override R#6.
- **R#12 Token Economy scope** — split into INPUT vs OUTPUT scopes. Token Economy governs output efficiency only; R#6 delegation governs input gathering. Added: "NEVER skip Explore agent or vscode_askQuestions to 'save time'".

### Removed

- **`companion-rules.md`** — deleted. Was a stale subset of `essence.agent.md` (showed `RULES[10]` while agent had `RULES[13]`). All content already exists in the canonical agent file. Eliminates multi-fork drift risk. SVG subtitle updated to reference `agent/essence.agent.md` instead.

## [2.4.0] - 2026-05-22

### Added

- **ESSENCE Token Dashboard** — full-stack observability pipeline shipped with the skill at `infrastructure/telemetry/`.
  - Auto-suggest on first session: detects when dashboard isn't set up and offers one-click activation.
  - Manual activation: "set up the token dashboard" triggers `setup.py`.
  - Cross-platform setup script (`setup.py`): copies files to `~/.essence-telemetry/`, starts Docker containers, configures VS Code OTLP settings, opens dashboard.
  - 4 Docker containers: PostgreSQL 16 (:5433), OTLP Receiver (:4318), Aspire Dashboard (:18888), Dashboard Updater (:4319).
  - HTML dashboard with: KPI row, Cost by Model (per-category cost + token breakdown), Cache Efficiency ring, Token Composition, Token Breakdown by Model, Efficiency metrics, Cumulative Tokens timeline, TTFT distribution, Agent Types, Tools, Context Growth, Model Pricing Reference table.
  - VOX API gateway pricing with cache rates (Anthropic 0.1×, OpenAI 0.5× base input).
  - One-click browser refresh via updater server.
  - Uninstall support: `setup.py --uninstall`.
- Token Dashboard routing in `essence.agent.md` — auto-suggest trigger + manual invocation handling.
- `telemetry-dashboard` and `observability` tags in `skill.json`.

## [2.3.0] - 2026-05-18

### Added

- **Image-hybrid architecture** — multimodal optimization using architecture diagrams as vision inputs for structural priming + compressed TOON text for behavioral enforcement.
- `images/essence-architecture.png` (1200×1200px) — always-loaded structural map showing 5 layers, guard chain, 10 personas in routing order, quality loop, reference library, and rejection boundary.
- `images/essence-architecture.svg` — editable vector source for the architecture image.
- `images/a3-ux-reference.svg/png` — visual reference for A3 UX persona (DAVINCI protocol, Pfizer 2026 color palette, component patterns, slide design system, Visual Argument principles).
- `images/a6-business-analysis-reference.svg/png` — visual reference for A6 BA persona (analysis workflow, requirements taxonomy, DFD levels, ERD notation, UML diagram types, CRUD matrix, physical ERD process).
- `companion-rules.md` — standalone compressed behavioral rules reference (TOON notation).
- `requirements.multimodal` field in `skill.json` — declares vision capability as a requirement with graceful text-only fallback.
- "When NOT to use" section noting text-only LLM limitation.
- Token budget comparison table in SKILL.md.

### Changed

- `agent/essence.agent.md` — rewritten as compressed TOON notation (~800 tokens vs ~4500 in text-only edition). Contains all Critical Constraints (CC#0-6), Behavioral Rules (R#1-10), Routing Table, Minimum Chains, Domain Rejection, and Reference Loading catalog. References architecture image for structural context.
- `SKILL.md` — updated to document image-hybrid architecture, loading protocol, and visual reference files.
- `skill.json` — added `multimodal`, `image-hybrid`, `token-optimized` tags; updated description and longDescription; added `requirements` field.

### Unchanged (from text-only v2.3.0)

- All 20 reference files in `references/` — identical content, loaded on-demand as before.
- `templates/copilot-instructions.md` — unchanged.
- `evals/` — both test scenarios unchanged.
- `examples/` — both gold standard examples unchanged.

### Technical Details

- Always-loaded context reduced from ~4,500 tokens to ~2,368 tokens (47% savings).
- Architecture image costs ~1,568 vision tokens (capped by encoder at 1200px).
- Behavioral rules text costs ~800 tokens in TOON notation.
- A3/A6 reference images add ~1,568 tokens each only when those personas activate.
- Total per-request overhead (worst case, A3+A6 both active): ~5,504 tokens vs ~6,500 in text-only — still 15% savings even in worst case.
- Best case (simple A1 task): ~2,368 tokens vs ~4,500 — 47% savings.
- Image design optimized for LLM vision: minimum 11-14px text, high contrast, Pfizer 2026 colors, clear spatial grouping.
- SVG sources maintained for editability; PNG exports are the LLM-consumable artifacts.
- Validated via extraction test: Claude Opus 4 achieved 90%+ structural accuracy from image alone on first attempt.

## [2.2.0] - 2026-05-13

### Added

- **A9 Reusable Components persona** — new persona for proactive codebase scanning, reusability assessment (6-dimension scoring), enhancement advisory, capability mapping, cross-product component registry with dual-layer storage model, quality gates, staleness detection, and project retrospective protocol
- **6 new A1 reference files** — `a1-project-scaffolding.md` (feature-based organization, 3-tier layering), `a1-error-handling.md` (error classes, boundaries, centralized handlers), `a1-git-workflow.md` (branching, commit hooks, PR templates), `a1-logging-observability.md` (structured logging, correlation IDs), `a1-input-validation.md` (validation layers, sanitization), `a1-async-patterns.md` (task queues, retry logic, dead letter queues)

### Changed

- **Persona count: 9 → 10** across all files (`essence.agent.md`, `SKILL.md`, `skill.json`)
- **Reference file naming** — all 16 old reference files renamed to persona-prefixed convention (`development-methodology.md` → `a1-development.md`, `business-analysis.md` → `a6-business-analysis.md`, etc.) — total now 23 reference files
- **LLM token efficiency optimization** — 26% reduction in always-loaded token budget:
  - `SKILL.md` stripped of duplicated CC/R summaries and Rule Traceability Protocol (single source of truth in `essence.agent.md`)
  - Routing table converted from prose paragraphs to TOON `routingTable[14]` format for faster LLM pattern matching
  - Cross-cutting reference files given explicit load/skip conditions instead of blanket "All personas" loading
- **Routing order** updated: `A7 → A6 → A9 → A1/A3 → A9 → A2 → A4 → A5 → A10` (A9 pre-check before build, post-check after)

## [2.1.0] - 2026-05-12

### Added

- `templates/copilot-instructions.md` — Copilot-native instructions for GitHub Copilot agent discovery and activation
- `"copilot"` tag in `skill.json` for marketplace discoverability

### Changed

- `installCmd` now includes `--agent claude-code --agent github-copilot` for multi-platform targeting
- `docs` array includes Copilot Instructions entry

## [2.0.0] - 2026-05-11

### Added

- **A6 BA/Systems Analyst persona** — new persona for business analysis and systems analysis, covering requirements taxonomy (functional, nonfunctional, domain, constraints), use case modeling (10-field template, CRUD matrix, discovery methods), DFD (4 elements, 3 levels, logical vs physical), logical ERD (Crow's Foot notation, 3 entity types, normalization 1NF–3NF), UML diagrams (use case, class via textual analysis, sequence, state machine), physical ERD (5-step process, data type mapping for Snowflake/PostgreSQL/SQL Server, indexing strategy), feasibility analysis (technical/economic/organisational, ROI formula, decision matrix), generic SDLC framework (4-phase, MASPA mapping), architecture pattern selection (4 software functions, thin/thick client, NFR→architecture mapping), SAD input/output design, and handoff protocols to A1/A2/A3
- **CC#0 Input Normalisation** — new critical constraint: silently normalise requests (fix typos, expand abbreviations, resolve ambiguous pronouns) before routing
- **VS Code Extension OAuth Pattern** in `security-compliance.md` — PKCE flow for VS Code extensions, session management rules, security checklist for extension auth
- **RLS PostgreSQL Pattern** in `security-compliance.md` — `CREATE POLICY` example, `FORCE ROW LEVEL SECURITY`, RLS review checklist (5 items)
- **Test Case Derivation from Use Cases** in `testing-qa.md` — testing pyramid, 3 derivation rules (Normal Course → system test, Alternative Courses → additional test, Exceptions → negative test), test case template, test data strategy, regression rule, coverage targets
- **Visual Testing Expansion** in `testing-qa.md` — DevTools console classification TOON, Playwright integration with Simple Browser (two-tier verification model), static HTML verification with DevTools, application UI verification with console monitoring
- **Conversion Strategy** in `infrastructure-devops.md` — 2 dimensions (conversion style + rollout location), strategy selection matrix, go/no-go criteria checklist
- **A6 routing trigger** in `essence.agent.md` — routes to A6 for new features with data persistence, multi-actor workflows, integrations, requirements gathering, feasibility analysis, use case modeling, DFD/ERD/UML, architecture selection
- **A6 collaboration example** in `essence.agent.md` — "Analyse requirements for an order management system" → requirements taxonomy → use case modeling → DFD → ERD → UML → physical ERD → architecture selection → handoff to A1

### Changed

- **Persona count: 8 → 9** across all files (agent.md, SKILL.md, copilot-instructions.md, skill.json)
- **Routing order** updated: `A7 → A6 → A1/A3 → A2 → A4 → A5 → A10` (A6 inserted between A7 and A1)
- **Persona dependency validation** updated: "A1 should not build without A6 analysis for non-trivial systems"
- **Pre-Development Analysis Phase** in `development-methodology.md` — replaced with cross-reference to A6 `business-analysis.md`
- **Generic SDLC Framework + Feasibility Analysis** in `project-management.md` — replaced with cross-reference to A6 `business-analysis.md`
- **Architecture Design Framework** in `infrastructure-devops.md` — replaced with cross-reference to A6 `business-analysis.md` → Architecture Pattern Selection (H/W + S/W Specification retained in A5)

## [1.4.0] - 2026-05-08

### Added

- **Persona Dependency Validation** in `essence.agent.md` — before executing a multi-persona plan, verify the handoff sequence is coherent: no circular dependencies (e.g., A2 testing before A1 builds), no orphaned personas (selected but no downstream consumer), no missing prerequisites (e.g., A5 deploy before A2 tests). Includes valid/invalid routing examples
- **Progressive Clarification Pacing** in `essence.agent.md` R#1 — 5-step sequence (Initial Parse → Confidence Check → Targeted Questions → Assumptions Block → Route) that prevents front-loading users with too many questions. Max 2–3 specific questions per round
- **TOON Structured Output Rule** in `essence.agent.md` R#7 — TOON notation (`tableName[rowCount]{col1,col2,...}:` with comma-delimited rows) replaces markdown tables for machine-readable structured data, reducing token output by 50–60%. Markdown tables retained for human-facing rendered content
- **Architecture Quick Reference** (`architecture.md`) — system component map, loading order, request flow diagram, rule precedence layers, and file inventory
- **Session Continuity Checklist** in `development-methodology.md` — 5-step resume protocol (acknowledge phase, verify context, check Git state, surface open questions, confirm scope) for mid-conversation or cross-session work
- **Frontend Status Protocol** in `development-methodology.md` — 3-tier classification (OPERATIONAL / DEGRADED / FAILING) with console log capture protocol and 7-step verification workflow using VS Code Simple Browser
- **Defect Classification** in `testing-qa.md` — 4-tier severity table (CRITICAL / HIGH / MEDIUM / LOW) with escalation rules and delivery-blocking criteria
- **Simple Browser Open Methods** in `testing-qa.md` — 3 methods for opening VS Code Simple Browser (Command Palette, terminal link, split view)
- **Console Log Classification** in `testing-qa.md` — 5-row classification for console output (errors → FAILING, warnings → DEGRADED, clean → OPERATIONAL) with prescribed actions
- **Verification Tiers** in `testing-qa.md` — 2-tier verification (Manual via Simple Browser + DevTools, Automated via Playwright) with when/purpose guidance
- **Adversarial Review Phase** in `quality-control.md` — systematic failure vector probing across 5 categories (Security Vulnerabilities, Edge Case Failures, Integration Breaking Points, Data Quality Issues, Performance Degradation) with adversarial scoring formula
- **Quality Score Formula** in `quality-control.md` — weighted formula (Citation 25% + Hallucination 30% + Adversarial 25% + Template 15% + Confidence 5%) with component scoring guide and 4-tier threshold table (EXCELLENT / GOOD / NEEDS IMPROVEMENT / FAIL)
- **Port Registry Convention** in `infrastructure-devops.md` — `PORTS.md` template for multi-service projects to prevent local port conflicts, with conflict resolution commands and maintenance rules
- **Destructive Ops 5-Step Pre-Flight** in `security-compliance.md` — expanded pre-flight protocol (Identify → Scope → Backup → Announce → Execute+Verify)
- **STRIDE Threat Modeling** in `security-compliance.md` — 6-category threat model (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) with risk score formula and assessment template
- **OWASP Top 10 Coverage Checklist** in `security-compliance.md` — A01–A10 with ESSENCE persona ownership mapping and verification methods
- **Local Developer Credential Storage** in `security-compliance.md` — approved/banned storage patterns for dev credentials with platform-specific guidance
- **Row-Level Security (RLS)** in `security-compliance.md` — Snowflake RLS implementation pattern using secure views + CURRENT_ROLE() with testing protocol
- **TOON for Living Documents** in `documentation-standards.md` — syntax reference, when-to-use decision table (TOON for machine-readable data, markdown for human-rendered prose), examples (sprintBacklog, riskRegister, envConfig), and version-control guidance

### Changed

- **21 markdown tables → TOON notation** across 6 reference files: `testing-qa.md` (5 tables), `quality-control.md` (1 table), `development-methodology.md` (6 tables), `infrastructure-devops.md` (0 tables, new section only), `security-compliance.md` (4 tables), `documentation-standards.md` (5 tables). All conversions preserve original content; Pfizer-specific references (WTTE, MSB, Edison/Lite3, MASPA) retained
- SKILL.md updated with TOON notation mention, architecture.md reference, and persona dependency validation in Key Behavioral Rules

## [1.3.0] - 2026-04-28

### Added

- **Visual Argument & Excalidraw Diagramming** in `ux-davinci.md` — Visual Argument Philosophy (diagrams must argue, not just display), Isomorphism Test (structure must communicate without text labels), Depth Assessment Protocol (L1 Conceptual vs L2 Technical), Excalidraw JSON generation with Pfizer 2026 palette, Evidence Artifacts for technical diagrams, and Diagramming Tool Selection guide. Methodology adopted from the [Pfizer Excalidraw Diagram](https://skills.pfizerstatic.io/agent-skills/pfizer-excalidraw-diagram) skill (`github.com/pfizer/ednlt-skills` → `skills/pfizer-excalidraw-diagram`)
- **A3 routing trigger** for Visual Argument & Excalidraw — agent now auto-routes to A3 when user asks for mockups, wireframes, visual arguments, design decision diagrams, or `.excalidraw` file generation
- **Confluence On-Prem Publishing** reference file (`confluence-publishing.md`) — SSO auth via Playwright, XHTML storage format, ac:tag placeholder swap, attachment management, SVG encoding fixes, multi-page workflows
- **Confluence routing trigger** in agent — auto-routes when user asks about Confluence on-prem publishing, HTML-to-storage conversion, or attachment management

### Changed

- A3 persona description updated to include "Visual Argument diagramming (Excalidraw)"
- SKILL.md description and reference list updated with Excalidraw and Confluence capabilities
- Cross-Cutting Reference Files section updated with `confluence-publishing.md` entry

### Attribution

- Visual Argument methodology (philosophy, isomorphism test, depth assessment, Excalidraw JSON generation) adopted from the **Pfizer Excalidraw Diagram** skill by the Edison Lite3 team. Original skill: [pfizerstatic.io](https://skills.pfizerstatic.io/agent-skills/pfizer-excalidraw-diagram) · [GitHub](https://github.com/pfizer/ednlt-skills/tree/live/skills/pfizer-excalidraw-diagram)

## [1.2.0] - 2026-04-26

### Added

- **Decision Provenance Tags** in `development-methodology.md` — 6-tag vocabulary (`[FROM_SPEC]`, `[FROM_CODEBASE]`, `[FROM_DOCS]`, `[TEAM_DECISION]`, `[ASSUMPTION]`, `[CONVENTION]`) for traceable implementation decisions with usage rules and code examples
- **Requirement Anchoring** in `development-methodology.md` — convention for linking every code block back to the requirement it fulfills, with anchoring format and anti-pattern guidance
- **Confidence Hygiene Protocol** (Section 14) in `shared-protocols.md` — prohibited phrases table (8 banned phrases with replacements), self-audit questions, per-persona activation rules
- **Task-Type Scope Classification** in `project-management.md` — 5 task types (API/Backend, Data Pipeline, Dashboard, Security Review, Bug Fix) with pre-defined scope boundaries (Always/Conditional/Excluded) and usage workflow
- **Evidence Conflict Resolution** in `knowledge-sources.md` — 7-row resolution hierarchy for when sources disagree, with winner determination, rationale, and structured conflict reporting format

## [1.1.0] - 2026-04-22

### Changed

- **BREAKING:** Rule structure reorganized — 4 Critical Constraints (CC#1–CC#4, BLOCKING) + 9 Behavioral Rules (R#1–R#9) replace flat 11-rule list
- **R#1 Requirements Discovery:** Expanded from 5 to 8 greenfield areas — added Data (sources, shape, volume), Auth & identity (SSO/OAuth, roles, multi-tenant), Existing systems (migration, API compatibility)
- **R#2 Generator/Critic:** Upgraded from 4-lens analysis to 4-phase quality loop (CRITIQUE → ADVERSARIAL → REFINE → EVALUATE) with cycle guidance
- **CC#1 Destructive Op Detection:** Expanded from 3-step to 4-step protocol — added Rollback Plan step, reordered to Impact Assessment → Safe Alternative → User Confirmation → Rollback Plan
- **R#3 Scope Control:** Added SMALL/MEDIUM/LARGE classification table with criteria and actions
- **R#5 Memory:** Expanded to 8-section template (added Tech Stack persistence), added Learning Extraction protocol and Context Hygiene guidance
- **R#7 Concise Output:** Added Rule Traceability — header format with persona/rule/reference citations + inline rule tags
- **CC#3 Evidence-based:** Added 5-tier evidence hierarchy reference (Memory → Context7 → Codebase → Reasoning → LLM knowledge)

### Added

- **R#9 Deferred Tool Loading** — new behavioral rule for VS Code deferred tool management
- **Rule Traceability Protocol** in SKILL.md — CC#/R# reference key table, header format documentation, inline tag examples
- **Project Context routing** — Denali/Deal Insights project folder with trigger keywords
- **Data Engineering** updated to 14-phase methodology (was 12-phase) including Phase 5.5 Script Comparison
- Generator/Critic 4-Mode Protocol in development-methodology.md (ARCHITECT/INSPECTOR/OPTIMIZER/ORCHESTRATOR)
- DAVINCI Scoring framework in ux-davinci.md
- Phase-Specific Quality Gates (P1–P5) in testing-qa.md
- Code Commenting Standards in documentation-standards.md
- 4-Layer Backup Protocol in infrastructure-devops.md
- Learning Extraction protocol (Section 13) in shared-protocols.md
- Evidence Hierarchy (5-tier table) in knowledge-sources.md

### Fixed

- UTF-8 encoding across all reference files (arrow characters `→` `—` now render correctly)

## [1.0.0] - 2026-04-20

### Added

- Initial release of ESSENCE Dev Team skill
- 8-persona orchestration: Development, Testing, UX, Documentation, Infrastructure, Security, Project Management, Quality Control
- Generator/Critic review pattern with 4-lens analysis (Correctness, Security, Performance, Consistency)
- Destructive operation safeguards with mandatory pause and impact assessment
- ADLC 6-phase lifecycle management (A8)
- WCAG 2.1 AA and Material-UI UX protocols (A3 DAVINCI)
- HIPAA/GDPR compliance checks (A7)
- 11 reference files covering all persona methodologies
- Agent file with full routing logic and behavioral rules
