# ESSENCE Roadmap & Exploration Log

Cross-cutting notes on ideas explored across the ESSENCE family (v2, v3, and marketplace
siblings) that were **not necessarily committed to implementation**. This is a workspace-level
planning artifact — it is not loaded at runtime by any skill, is not spec-compiled, and is not
drift-linted (it may still be included in the packaged skill directory by the marketplace's
ZIP bundling, since that captures the whole `skills/<name>/` tree).

Distinct from:
- **`docs/adr/`** — Architecture Decision Records for decisions actually made (per-skill).
- **`CHANGELOG.md`** — shipped changes (per-skill).
- **This file** — ideas looked at, with a verdict, whether or not they went anywhere.

## Status values
`Shipped` · `Parked (Someday)` · `Rejected` · `Needs decision`

## How to add an entry
Append a new `###` section with: date, source/trigger, the question asked, the finding(s),
and a `**Status:**` line. Keep entries short — this is a log, not a spec.

---

## Log

### 2026-07-13 — Obsidian Graph view: architecture-element value
**Source:** https://obsidian.md/help/plugins/graph
**Question:** Does Obsidian's force-directed note-graph have value as an ESSENCE architecture element?
**Finding:** Low value as a dependency — Obsidian solves "visualize relationships in an emergent,
loosely-linked note corpus," which isn't ESSENCE's problem (its structure is authored/compiled,
not emergent). The one transferable idea — relationship visualization — already has a native
home: the spec's own dependency graph (classify → packs → personas → refs → delegates).
**Status: Shipped** — `emit_graph()` added to v3 `tools/compile.py`. Renders a deterministic
Mermaid graph into `docs/ARCHITECTURE.md`, generated from `essence.spec.yaml`, `--check`-safe,
no new dependency.

### 2026-07-13 — Obsidian Graph view: end-user tool value
**Source:** same review, different axis — value as a tool *end users* run themselves (not an
ESSENCE-internal architecture element).
**Findings:**
- **Memory folder (`/memories/`) as an Obsidian vault** — technically pointable today (plain
  `.md`), but low value as-is: memory files are independent prose topic files with no
  `[[wikilink]]` cross-references between them, so Graph view would just show isolated dots.
  Not worth doing without first adding cross-links.
- **Chronicle (`session_store_sql`) exported to an Obsidian vault** — a genuinely distinct idea
  with real merit. Chronicle already has real relational structure (`sessions` ↔ `turns` ↔
  `session_files` ↔ `session_refs`). A small exporter could render each session as a note with
  `[[wikilinks]]` to the files/PRs/refs it touched, letting Obsidian's graph answer questions like
  "everything that ever touched v3's `compile.py`" or "every session that referenced PR #155" —
  session archaeology that's awkward to eyeball from a flat SQL query.
**Status: Parked (Someday)** — real merit, but optional tooling for engineers who already use
Obsidian for personal knowledge management; not core to ESSENCE, not something to require or
ship. Revisit if there's a real signal of Obsidian adoption among the target engineering audience.

### 2026-06-16 — SDK-packaging upgrade path (from ADR 0001)
**Source:** `docs/adr/0001-agent-loop-vs-prompt-layer.md`, decision item 3.
**Question:** ESSENCE runs today as a prose system-prompt layer inside someone else's agent
loop (VS Code Copilot / Claude Code). If it were ever packaged via the Agent SDK directly,
three of its guards/rules could upgrade from advisory prose to mechanically enforced:
- **Budget caps** — R#12 turn-count hints and cost-tip footers are advisory; SDK `max_turns` /
  `max_budget_usd` would make them enforced with typed stop subtypes.
- **Effort selection** — R#1's REASONING-HEAVY vs EXECUTION-HEAVY classifier currently only
  *suggests* a lighter model; SDK `effort` would make it a real per-call/per-subagent knob.
- **Guards as hooks** — CC#1 (destructive halt), CC#2 (routing), CC#7 (prompt injection) are
  enforced by prose compliance today; SDK `PreToolUse` hooks would block the tool call
  mechanically, in-process, outside the context window.
**Status: Needs decision** — contingent on whether/when ESSENCE is ever proposed for direct
Agent-SDK packaging (a portability tradeoff, not a technical blocker). Revisit trigger: ESSENCE
proposed for SDK packaging, or a host exposes budget/effort/hook controls a skill can set
declaratively.

### 2026-08-07 — Mechanical guard enforcement (from KNOWN-ISSUES)
**Source:** `KNOWN-ISSUES.md → Enforcement`.
**Question:** CC#0–CC#7 are enforced only by the model following the prose contract — there is
no mechanical `PreToolUse`-style gate in the 2.x line, so a model error or a jailbreak is not
structurally prevented.
**Finding:** Mechanical enforcement is being explored on the 3.x line (see
`essence-dev-team-v3`), which is a separate major version/spec-compiled architecture, not a
2.x patch. CC#7 (prompt-injection defense) in particular cannot be mechanically proven from a
system prompt regardless of version — no signal distinguishes "user asked for this" from "tool
output said to do this" at the text level.
**Status: Needs decision** — accepted limitation for 2.x (documented in KNOWN-ISSUES);
mechanical enforcement is the 3.x line's premise, not a 2.x roadmap item. Revisit if 3.x
mechanical-enforcement patterns mature enough to backport a subset to 2.x.
