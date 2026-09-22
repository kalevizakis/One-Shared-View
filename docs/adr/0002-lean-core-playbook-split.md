# ADR 0002 — Lean core / playbook split, and image-hybrid retirement

- **Status:** Accepted
- **Date:** 2026-05-30 (implemented), 2026-06-01 (shipped as v2.5.0)
- **Deciders:** ESSENCE maintainers
- **Context source:** v2.4.2/v2.5.0 CHANGELOG entries; drift-lint finding H (unverifiable
  efficacy claim); 38-concept gap analysis of the `images/` directory.

## Context

Through v2.4.x, ESSENCE shipped as an **image-hybrid** skill: a mandatory architecture
diagram (`images/essence-architecture.svg`/`.png`) that the agent was instructed to
process at session start, plus persona reference diagrams for A3/A6. The skill's own
marketing copy claimed a "~47% token savings (~2,368 vs ~4,500)" figure attributing
the reduction to the image replacing prose — but this figure could not be reproduced
from the actual shipped file sizes (drift-lint finding H), and vision is not a
capability every host model reliably has.

A parallel problem: the agent file (`essence.agent.md`) had grown to carry both the
one-line rule *index* (needed on every turn for routing) and the full expanded prose
for every guard and rule (needed only for reasoning-heavy/compliance/scaffolding/
destructive requests) — paying the full-prose token cost on every single turn,
including trivial ones.

## Decision

1. **Retire `images/` entirely.** A 38-concept gap analysis confirmed the three
   diagrams encoded zero LLM-consumable information not already present in full
   prose in the persona reference files, and the lean agent never actually loaded
   them at runtime. Deleted with provable zero capability loss for a model-agnostic,
   text-only skill. Retired the stale "~47%" efficacy claim rather than attempt to
   preserve or re-derive it — `SKILL.md` now reports only measured text-token counts.
2. **Split the agent file into a two-tier loading model.** `agent/essence.agent.md`
   becomes the **lean always-on core**: guards, routing table, a one-line index of
   every rule, the reference catalog, and a `## Playbook Auto-Load` contract deciding
   when to pull in more. `agent/essence.playbook.md` is a **new** companion file
   holding the full prose (4-phase R#2 detail, full R#1/R#8 walkthroughs, the CC#6
   governance table, collaboration examples, the output catalog) — auto-loaded only
   for REASONING-HEAVY, COMPLIANCE, SCAFFOLDING, or DESTRUCTIVE requests, contributing
   0 tokens to EXECUTION-HEAVY turns.
3. **Placed the playbook in `agent/`, not `references/`,** so the reference-file count
   (`REFS[N]`) stays scoped to persona/cross-cutting knowledge and doesn't trigger a
   cascade through every check that counts reference files.
4. **Backed the auto-load contract with a lint check and a behavioral eval** (drift-lint
   check #12 + `evals/test-lean-load-behavior.md`) rather than trusting prose alone —
   the two-tier split is the mechanism most likely to silently regress (a category
   flipped from STAY-LEAN to LOAD, or vice versa, either destroys the savings or the
   rigor with no visible symptom until someone measures tokens or hits a bad
   compliance response).

## Consequences

- **Positive:** Model-agnostic (no vision required); honest, re-measurable token
  claims (`evals/measure-tokens.py`) replace an unverifiable percentage; simple turns
  pay only the lean-core cost; complex/risky turns get full rigor on demand.
- **Negative / cost:** Two files to keep synchronized (core index ↔ playbook prose);
  every new guard/rule now needs both a one-line index row *and* a full-prose
  definition, and drift-lint check #8 (playbook↔core ID coverage) exists specifically
  to catch a missed half of that pair.
- **Non-goal:** Re-introducing diagrams as a runtime dependency. Diagrams remain
  permitted as human-facing maintainer documentation (`docs/ARCHITECTURE.md`/`.html`)
  but are never processed by the agent and are not required at runtime.

## Revisit when

A host model class emerges where multimodal input is reliably available AND cheaper
than the equivalent text (unlikely to reverse this decision, but the diagrams'
absence should be re-justified if the cost model changes materially).
