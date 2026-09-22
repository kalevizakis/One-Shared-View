# Known Issues — essence-dev-team

> This file tracks known quality issues for this skill.
> AI agents: when modifying this skill, fix any issues listed below that are in scope of your changes.

## Enforcement

| Issue | Impact | Status |
|-------|--------|--------|
| Guards are prose-enforced only | CC#0–CC#7 depend on the model following the contract. There is no mechanical `PreToolUse` gate in the 2.x line, so a model error or a jailbreak is not structurally prevented. | By design in 2.x. Mechanical enforcement is being explored on the 3.x line. |
| CC#1 destructive-command triggers were Unix/database flavoured | The trigger list named only `rm-rf`, `DROP`, `TRUNCATE`, `flyway clean`, `hbm2ddl create-drop`. Windows equivalents — `Remove-Item -Recurse -Force`, `rd /s /q`, `del /f /s /q`, `Clear-Disk`, `Format-Volume` — relied on the model generalising from the "permanent-file-delete" clause. Worse, in PowerShell `rm`/`del`/`rd` are aliases for `Remove-Item`, so the literal `rm -rf` that was matched is not valid PowerShell at all. | Fixed in 2.7.2 — platform-equivalent forms added to the always-on core, with a `cc1Equivalents[6]` mapping in the playbook and an explicit "judge the effect, not the spelling" rule. |
| CC#7 cannot be mechanically enforced | Nothing can prove a directive originated in fetched or tool-returned content, so prompt-injection defence is surface-before-execute prose. | Accepted limitation. |

## Distribution and updates

| Issue | Impact | Status |
|-------|--------|--------|
| Self-update requires an authenticated `gh` CLI | `pfizer-fit/skills-oneweb` is a **private** repository. An unauthenticated `raw.githubusercontent.com` fetch of the published manifest returns **404 for every user**, so the version check cannot work without `gh` being installed and logged in. | Fixed in 2.7.2 — the runbook now uses `gh api` and reports the check as *unknown* rather than *up to date* when `gh` is unavailable. **Versions 2.7.0 and 2.7.1 shipped with the broken raw-URL check and can never detect an update.** |
| Hand-synced copies are outside CLI management | `npx skills update` does not touch a manually-copied agent (for example `~/.copilot/agents/…` or a fork under `.github/agents/`). Those drift silently. | Open. Re-sync such copies by hand after every upgrade. |
| Artifacts are hand-maintained | References, the agent core, the playbook and `skill.json` are edited by hand and kept in step by `tools/drift_lint.py` (count printed in its own summary line — grows as checks/references are added, so not restated here). The linter catches structural and version drift, but cannot detect divergence in prose content between installed copies. | Mitigated, not eliminated. A pre-commit hook (`tools/hooks/pre-commit`, added in 2.8.0, install per `docs/RELEASE-CHECKLIST.md`) now runs the full gate automatically on commits touching `agent/`, `references/`, `SKILL.md`, `skill.json`, or `docs/ARCHITECTURE.md`, closing the "a human forgot to run the linter" gap. |
| Bus factor of one | Single maintainer, and until 2026-08-07 no version control at all in the OneDrive canonical workspace (drafting happened directly on disk with no history, diffs, or rollback). | **Accepted risk (2026-08-07).** A local git repo now exists (init'd in place; `.gitignore` was already live so junk never entered history) giving history/diffs/an unskippable pre-commit gate — this removes the worst of the risk but a second contributor and/or a remote mirror remain undone. Revisit trigger: when a second regular contributor joins, or an org mandate requires a remote-hosted history. OneDrive-hosted git carries its own risk (sync/lock contention on `.git/`); migrating the SSOT to a git-native path is a deliberate follow-up, not done here. |

## Observability

| Issue | Impact | Status |
|-------|--------|--------|
| Token Dashboard requires Docker | The telemetry stack runs locally via `infrastructure/telemetry/setup.py`. Without Docker the dashboard is unavailable; ESSENCE itself is unaffected. | By design. |
| VS Code 1.128 managed telemetry can silence the dashboard | An organisation-managed OpenTelemetry `telemetry` block overrides `OTEL_*` environment variables and user settings — managed always wins. The usual symptom is a silently empty local dashboard. | Documented in `references/a5-infrastructure.md → DASHBOARD-PULL`. Not fixable from the skill. |

## Code Quality

| Issue | File | Status | Details |
|-------|------|--------|---------|
| DB connection leak risk | `full-summary.py`, `query-summary.py` | Fixed (v2.6.1) | `atexit.register(conn.close)` now closes the connection even on an unhandled exception. |
| Silent-cheap fallback for unrecognized models | `infrastructure/telemetry/pricing.py` | Fixed in 2.8.0 (2026-08-07) | `get_pricing()` now returns a `(pricing_dict, matched)` tuple; the dashboard renders a "⚠ estimated" marker next to any model whose cost used the unmatched fallback tier (previously silent, could under-price an unrecognized model ~20× with zero signal). |
| Shipped dashboard embedded real usage data | `infrastructure/telemetry/essence-token-dashboard.html` | Fixed in 2.8.0 (2026-08-07) | The 530 KB shipped snapshot contained real internal engagement/workspace names and the author's own cost profile. Regenerated as a genuine empty-state template (43 KB) against a throwaway Postgres container with no data — verified zero hits for internal project names. Residual: any copy of the old snapshot already distributed (installed copies, OneDrive version history) cannot be purged from here; installed copies are addressed by the hand-sync step, OneDrive history is accepted residual. |
| Telemetry sync manifest missing `pricing.py` | `infrastructure/telemetry/setup.py` | Fixed in 2.8.0 (2026-08-11) | `COPY_FILES` never listed `pricing.py`, even though `updater.Dockerfile` COPYs it into the build context — any sync-triggered updater rebuild would fail once the pricing SSOT refactor (v2.6.1) started requiring it. Found and fixed while executing Phase 7.1 (telemetry sync + container-health verification); added to both `COPY_FILES` and the rebuild-trigger set. |

## Security

| Issue | Impact | Status |
|-------|--------|--------|
| Receiver had no Host-header validation or auth | The Flask OTLP receiver binds to `127.0.0.1` only (kills LAN exposure) but had no defense against DNS-rebinding from a browser tab, and `/api/summary`'s `since_ms` parameter wasn't validated (unlike `/api/spans`). | Fixed in 2.8.0 (2026-08-07) — `before_request` Host allowlist (`localhost`/`127.0.0.1`, else 403); `/api/summary` now wraps `since_ms` parsing in the same try/except-400 pattern as `/api/spans`; optional `ESSENCE_RECEIVER_TOKEN` env var gates the two read (`GET`) endpoints with a bearer token when set (the `POST /v1/traces` ingest path stays tokenless — VS Code's OTLP exporter can't send a custom header). Unset by default — behavior unchanged unless explicitly configured. |
| Hardcoded personal paths in shipped docs/evals | `docs/ARCHITECTURE.md`, `evals/run-ab-eval.ps1` carried the author's own username/folder layout, making the eval script silently machine-specific and leaking the author's local path to every reader. | Fixed in 2.8.0 (2026-08-07) — `docs/ARCHITECTURE.md` now says `cd path/to/essence-dev-team`; `run-ab-eval.ps1` takes `-TextOnlyPath`/`-ImageHybridPath` params defaulting to `$PSScriptRoot`-relative paths. |

## Not measured

Output quality has not been compared against a baseline. ESSENCE's guards, routing and
verification steps are documented and structurally checked, but no benchmark demonstrates that
its output is better than the same model without it. Claims about quality should be treated as
design intent, not measurement.

**Partially addressed (2026-08-11):** the lean-core/playbook *switching* behavior itself (does
the playbook load exactly when the architecture says it should?) now has real evidence — see
`evals/RESULTS.md → "v2.8.0 — Lean Load Behavior (Phase 7.3)"`, 6/7 clean pass + 1 partial + 1
test-file correction identified, run via isolated fresh-context subagent sessions. Token-budget
*numbers* were already covered by `measure-tokens.py`. The broader "is the output better than
the same model without ESSENCE" comparison above remains unmeasured.

_Last reviewed: 2026-08-12_

