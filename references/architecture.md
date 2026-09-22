---
file: architecture.md
persona: Cross-cutting (Architecture)
version: 2.8.0
last_updated: 2026-07-05
changelog: 2.6.0
---

# ESSENCE Architecture — Quick Reference

> Condensed from the full system-design doc at `docs/ARCHITECTURE.md`.

---

## System Components

```
copilot-instructions.md    Always loaded — workspace-wide shared rules
  └── essence.agent.md     Always loaded (in ESSENCE mode) — orchestrator + 10 personas + rules
       ├── SKILL.md         On demand — skill entry point (What/When/Instructions/Output Format)
       │    └── references/  On demand — deep persona/domain knowledge
       └── projects/         On demand — project-specific context (schemas, RBAC, deps)
```

## Loading Order

1. **Workspace opens** → `copilot-instructions.md` auto-loads (shared rules)
2. **ESSENCE mode selected** → `essence.agent.md` loads (CC#0-7, R#1-12, personas, routing)
3. **Request arrives** → agent infers personas + domain skills needed
4. **Skill triggered** → relevant `SKILL.md` loads (methodology overview + reference index)
5. **Reference needed** → specific `references/*.md` loads (deep knowledge for active persona)

## Request Flow

```
Input → CC#0-2 Safety Gate → Classification → Persona Routing → Execution → R#2 Quality Loop → A10 Final Gate → Output
         │                     │                  │
         │                     │                  └── A7 first (if security) → A1/A3 → A2 → A4 → A5
         │                     └── Simple? → Execute. Ambiguous? → R#1 Interview. Exploratory? → Ideation
         └── Destructive op? → STOP. PHI/PII? → Force A7.
```

## Rule Precedence

**Layer 1 — Critical Constraints (BLOCKING, always win):**
CC#0 Input Normalization · CC#1 Destructive Ops · CC#2 PHI/PII · CC#3 Evidence-Based · CC#4 Security Advises · CC#5 Review Gate · CC#6 Governance Flag · CC#7 Injection Defense

**Layer 2 — Behavioral Rules:**
R#1 Requirements · R#2 Generator/Critic · R#3 Scope Control · R#4 Brutal Honesty · R#5 Memory · R#6 Delegate · R#7 Concise Output (includes TOON notation, change summaries) · R#8 Build/Run/Verify (includes Stop-the-Line) · R#9 Tool Loading · R#10 Evidence Conflict · R#11 Observability · R#12 Session Health

## File Inventory (Core skill)

| Location | Files | Purpose |
|----------|-------|---------|
| `agent/` | 2 | Lean core (`essence.agent.md`) + full playbook (`essence.playbook.md`) |
| `references/` | 21 | Persona + cross-cutting knowledge (lazy-loaded) |
| `templates/` | 1 | Workspace `copilot-instructions.md` scaffold |
| `evals/`, `examples/` | 4 | Test prompts and example outputs |
| **Domain skills (separate installs)** | — | `essence-data-pipeline-engineering`, `essence-cortex-ai-builder`, `essence-ml-methodology`, `essence-tableau-developer` |
