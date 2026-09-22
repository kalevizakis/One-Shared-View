---
name: essence-dev-team
description: "10-persona development team built on a single LLM (A1-A10) — lean edition. A small always-on core (guards + routing + rule index) auto-loads the full rule playbook on demand, so simple tasks stay cheap and complex tasks get full rigor. Use for software development, business analysis, systems analysis, testing, UX, documentation (incl. Pfizer GenAI RAMP risk-assessment assembly), infrastructure, security compliance, project management, quality control, and reusable components. Model-agnostic — no vision required. Platform-adaptive — every named tool maps to its nearest host equivalent, so it runs correctly on GitHub Copilot and Claude Code alike, not just VS Code. For data pipelines, Cortex AI, ML/AI, and Tableau, install the dedicated marketplace skills."
author: Henri Kuqali <henri.kuqali@pfizer.com>
version: 2.8.0
tags: [multi-persona-orchestration, lean-core, token-optimized, telemetry-dashboard, observability, full-stack, business-analysis, testing, ux, devops, security, adlc, material-ui, copilot]
argument-hint: "Describe what you need built, tested, secured, documented, deployed, reviewed, or analyzed"
context: fork
---

# ESSENCE — 10-Persona Development Team (Lean Edition)

A single orchestrator agent that coordinates 10 specialized personas — all running on a single LLM. A lean always-on core (guards + routing + rule index + reference catalog) auto-loads the full rule playbook only when a request needs it, so simple tasks stay cheap and complex tasks get full rigor.

> *Field-tested at Pfizer.*

## What

A 10-persona development team with a two-tier loading model: a compact always-on core (`agent/essence.agent.md`, ~5,200 text tokens) carries the 8 guards, routing table, and a one-line index of all 12 rules; the full rule prose lives in `agent/essence.playbook.md` (~7,100 text tokens) and is auto-loaded only for reasoning-heavy, compliance-sensitive, scaffolding, or destructive requests. Personas: Development (A1), Testing (A2), UX (A3), Documentation (A4), Infrastructure (A5), BA/Systems Analyst (A6), Security (A7), Project Management (A8), Reusable Components (A9), and Quality Control (A10).

**Lean architecture:**
- `agent/essence.agent.md` — always-on lean core: 8 guards, routing, 12-rule index, 21-file reference catalog (~5,200 text tokens)
- `agent/essence.playbook.md` — full rule prose, auto-loaded on demand (~7,100 text tokens; 0 on simple tasks)
- `references/` — 21 text files loaded on-demand by active persona
- `docs/ARCHITECTURE.md` — maintainer-facing system-design reference (not loaded at runtime)

**Domain skills are separate.** For Snowflake Cortex AI, ML/AI projects, data pipeline transformations, or Tableau dashboards, install the dedicated marketplace skills.

## When

- Building features (backend, frontend, full-stack)
- Scaffolding new projects from reusable component registry
- Writing and running tests with coverage metrics
- Designing UI/UX with Material-UI and WCAG 2.1 AA accessibility
- Creating visual arguments, UX mockups, and `.excalidraw` diagrams
- Creating technical documentation (API docs, READMEs, architecture docs)
- Assembling a Pfizer **GenAI RAMP** (Risk Assessment & Mitigation Plan) — 12 risk domains / 33-question triage, A4 authors, A7 owns risk severity
- Setting up CI/CD and deployment
- Business analysis and systems analysis (requirements, use cases, DFD, ERD, UML, feasibility, architecture selection)
- Security reviews and compliance checks (HIPAA/GDPR)
- Project planning, scope management, and risk tracking
- Code quality reviews
- Reusable component scanning and capability mapping

## When NOT to use

- **Data pipeline / feed migration / schema change work** → use `essence-data-pipeline-engineering`
- **Snowflake Cortex Agents / Analyst / Search / AI Functions** → use `essence-cortex-ai-builder`
- **ML/AI model lifecycle / quality gates / confidence scoring** → use `essence-ml-methodology`
- **Tableau dashboards / parameter design / Snowflake live connections** → use `essence-tableau-developer`

## Requirements

- **Any capable LLM** — model-agnostic, no vision required (Claude Opus 4+, Claude Sonnet 4+, GPT-4o+, Gemini 2.5+ all work)
- Agent runs entirely from text: the lean core (`agent/essence.agent.md`) plus the on-demand playbook (`agent/essence.playbook.md`)

## Reference Files

Load progressively based on which persona is active.

> **Load budget:** Load at most 2 reference files per turn. Cite each load in the response header (`Ref: filename.md`).


### Text References (behavioral detail)

- [Architecture Quick Reference](references/architecture.md) — System structure, loading order, request flow, rule precedence
- [Development Methodology](references/a1-development.md) — A1
- [Project Scaffolding & Architecture](references/a1-project-scaffolding.md) — A1
- [Error Handling Strategy](references/a1-error-handling.md) — A1
- [Git Workflow & Conventions](references/a1-git-workflow.md) — A1
- [Logging & Observability](references/a1-logging-observability.md) — A1
- [Input Validation & Sanitization](references/a1-input-validation.md) — A1, A7
- [Background Jobs & Async Processing](references/a1-async-patterns.md) — A1
- [Testing & QA](references/a2-testing.md) — A2 (incl. UAT comparison workbooks & Excel COM automation)
- [UX & DAVINCI Protocol](references/a3-ux.md) — A3
- [Documentation Standards](references/a4-documentation.md) — A4
- [Infrastructure & DevOps](references/a5-infrastructure.md) — A5
- [Business Analysis & Systems Analysis](references/a6-business-analysis.md) — A6
- [Security & Compliance](references/a7-security.md) — A7
- [Project Management](references/a8-project-management.md) — A8
- [Reusable Components](references/a9-reusable-components.md) — A9
- [Quality Control](references/a10-quality-control.md) — A10
- [Knowledge Sources](references/knowledge-sources.md) — All personas
- [Shared Protocols](references/shared-protocols.md) — All personas
- [Confluence On-Prem Publishing](references/confluence-publishing.md) — A4, A5, A1
- [Chronicle Session History](references/chronicle-session-history.md) — All personas

## Instructions

The always-on lean core lives in `agent/essence.agent.md` as compressed TOON notation: the 8 guards, the routing table, and a one-line index of all 12 rules. When a request is reasoning-heavy, compliance-sensitive, scaffolding, or destructive, the agent auto-loads the full rule prose from `agent/essence.playbook.md`. Persona reference files under `references/` load on-demand when their persona activates.

## Output Format

- **Code** — working, tested artifacts with all tests passing before delivery
- **Security reviews** — risk assessment with HIGH/MEDIUM/LOW severity ratings
- **Architecture decisions** — ADRs with options, tradeoff matrix, and rationale
- **Documentation** — OpenAPI specs, READMEs, or architecture docs
- **Infrastructure** — CI/CD configs, deployment scripts, backup plans
- **Quality reports** — checklist validation results with pass/fail per criterion

## Token Budget (measured)

| Tier | What loads | Approx. text tokens |
|------|-----------|--------------------|
| Always-on | `agent/essence.agent.md` lean core (8 guards, routing, 12-rule index, reference catalog) | ~5,200 |
| On demand | `agent/essence.playbook.md` full rule prose — auto-loaded only for reasoning-heavy / compliance / scaffolding / destructive work | ~7,100 (0 on simple tasks) |
| Per persona | one or two `references/*.md` files when that persona activates | varies |

> Token counts are measured text-token estimates for the current files, not a savings percentage. The earlier image-hybrid edition reported a ~47% always-loaded reduction, but that figure credited the architecture image (now removed as a runtime dependency) and could not be reproduced from the actual file sizes — it is intentionally not carried forward. No vision tokens are consumed; the agent runs entirely from text. Behavioral equivalence has not been re-evaluated for the lean split — re-run the `evals/` suite before making any pass-rate claim.

## Recommended VS Code Settings

For optimal performance with ESSENCE, add these to your workspace or user `settings.json`:

```json
{
  // ── Required for agent functionality ──
  "chat.agent.enabled": true,
  "chat.agent.maxRequests": 999,
  "chat.customAgentInSubagent.enabled": true,
  "chat.agent.subAgents.enabled": true,

  // ── Recommended for token efficiency (VS Code 1.120+) ──
  "chat.tools.compressOutput.enabled": true,
  "chat.tools.riskAssessment.enabled": true,

  // ── Recommended for ESSENCE workflows ──
  "workbench.browser.enableChatTools": true,
  "terminal.integrated.shellIntegration.enabled": true,
  "chat.agent.autoFix": true,

  // ── Agent Observability (VS Code 1.121+) ──
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.otlpEndpoint": "http://localhost:4318",
  "github.copilot.chat.otel.captureContent": false,
  "github.copilot.chat.otel.dbSpanExporter.enabled": true
}
```

These settings are not auto-applied on install. Copy them manually or merge into your existing configuration.

## Agent Observability — ESSENCE Token Dashboard

ESSENCE includes a full-stack token observability pipeline that deploys automatically to track costs, cache efficiency, and performance across all sessions. Requires Docker and VS Code 1.121+.

**Activate the dashboard:**

Ask ESSENCE: *"Set up the token dashboard"* — or ESSENCE will auto-suggest activation when it detects OTel is not configured.

**What gets deployed:**

```
VS Code (OTLP) → Receiver (Flask :4318) → PostgreSQL (:5433)
                       ↓                        ↑
                  Aspire Dashboard (:18888)   Updater (:4319)
                                                 ↓
                                         HTML Dashboard (file://)
```

4 Docker containers at `~/.essence-telemetry/`:
- **PostgreSQL 16** — persistent span storage with full Gen AI semantic conventions
- **OTLP Receiver** — Flask app that parses OTLP spans, stores in PostgreSQL, forwards to Aspire
- **Aspire Dashboard** — Microsoft's real-time trace viewer at `http://localhost:18888`
- **Dashboard Updater** — serves the "Refresh Data" button on the HTML dashboard

**Manual setup (alternative):**

```bash
python infrastructure/telemetry/setup.py
```

**Dashboard features:**
- KPI row: total tokens, cache hit rate, estimated cost, wall clock time
- Cost by Model: per-model cost breakdown (input/cached/output) with token counts
- Cache Efficiency: ring chart with hit rate percentage
- Token Breakdown: per-model token usage with cache rates
- Cumulative token timeline and context growth charts
- Time to First Token (TTFT) distribution per model
- Model Pricing Reference: GitHub Copilot credit rates with cache pricing
- One-click browser refresh via the updater server

**What gets measured:**
- Token usage per LLM call (input + output)
- Turn count per task (fewer = more efficient routing)
- Code survival score (0-1, how much AI code survives unchanged)
- Edit acceptance rate (accept vs. reject)
- Tool call patterns and latency
- End-to-end session duration

**A/B comparison:** Tag sessions with `OTEL_RESOURCE_ATTRIBUTES="agent.mode=essence"` to compare ESSENCE vs. vanilla Copilot. See `references/a5-infrastructure.md` → Agent Observability for full details.

ESSENCE will detect whether OTel is configured and guide you through setup if it isn't. Ask ESSENCE about your session metrics at any time.
