# Eval: A/B Routing Equivalence

> **⚠ DEPRECATED (2026-07-08):** This fixture compares the retired *image-hybrid* edition against text-only. The image-hybrid edition was retired in v2.5.0; retained for historical reference only and superseded by a lean-vs-playbook re-baseline.
>
> **Purpose:** Prove that the compressed TOON routing table in image-hybrid edition
> produces identical persona routing as the verbose text-only edition.
>
> **Method:** Feed each prompt to BOTH editions. Compare which personas activate.
> A routing mismatch = FAIL. Minor output style differences = acceptable.

---

## Test 1: Multi-Persona Security-First Routing

**Prompt:**
> "Add a patient data export feature to our FastAPI app. It should export to CSV and be accessible only to admin users."

**Expected Routing (both editions must match):**
- A7 Security FIRST (PHI/PII data, auth/admin, production data export)
- A1 Development (FastAPI endpoint, CSV generation)
- A2 Testing (unit tests for export + auth guard tests)

**Pass Criteria:**
| Criterion | Image-Hybrid | Text-Only |
|-----------|:---:|:---:|
| A7 activates first | ☐ | ☐ |
| PHI/PII flag raised | ☐ | ☐ |
| A1 codes after A7 review | ☐ | ☐ |
| A2 tests included | ☐ | ☐ |
| Header shows correct personas | ☐ | ☐ |

**Routing path:** `A7 → A1 → A2`

---

## Test 2: Scaffolding vs Development Distinction

**Prompt:**
> "Build me a tic-tac-toe game in React."

**Expected Routing (both editions must match):**
- Routes to **Scaffolding** (new app, no existing project)
- A1 loads `a1-project-scaffolding.md` (4-phase checklist)
- A2 auto-chains for initial test setup

**Pass Criteria:**
| Criterion | Image-Hybrid | Text-Only |
|-----------|:---:|:---:|
| Routes to Scaffolding (not Development) | ☐ | ☐ |
| Scaffolding checklist referenced | ☐ | ☐ |
| A2 auto-chains after A1 | ☐ | ☐ |
| `.gitignore` mentioned/created | ☐ | ☐ |
| Requirements discovery (R#1) fires | ☐ | ☐ |

**Routing path:** `A1(scaffolding) → A2`

---

## Test 3: Bug Fix — Minimal Routing

**Prompt:**
> "Fix the off-by-one error in the pagination logic in src/utils/paginate.ts"

**Expected Routing (both editions must match):**
- Routes to **Development** (existing code, single-file fix)
- A1 only — no chain needed (bug fix, single-file)
- Does NOT trigger A6, A2, or Scaffolding

**Pass Criteria:**
| Criterion | Image-Hybrid | Text-Only |
|-----------|:---:|:---:|
| Routes to A1 Development | ☐ | ☐ |
| Does NOT route to Scaffolding | ☐ | ☐ |
| No A6 activation (bug fix, not analysis) | ☐ | ☐ |
| Proceeds directly to fix | ☐ | ☐ |
| Generator/Critic review applied | ☐ | ☐ |

**Routing path:** `A1` (solo)

---

## Test 4: Multi-Persona Analysis Chain

**Prompt:**
> "I need to design an inventory management system for a pharmaceutical warehouse. Help me plan the architecture and data model."

**Expected Routing (both editions must match):**
- A8 Project Management (scope the work)
- A6 BA/Systems Analyst (requirements, ERD, architecture selection)
- A7 Security (pharmaceutical = regulated industry)
- Does NOT jump to A1 coding

**Pass Criteria:**
| Criterion | Image-Hybrid | Text-Only |
|-----------|:---:|:---:|
| R#1 requirements discovery fires | ☐ | ☐ |
| A6 activates for analysis | ☐ | ☐ |
| A7 flagged (pharma = compliance) | ☐ | ☐ |
| Does NOT produce code prematurely | ☐ | ☐ |
| Use case / data model artifacts produced | ☐ | ☐ |

**Routing path:** `A7 → A6` (analysis phase)

---

## Test 5: Out-of-Scope Domain Rejection

**Prompt:**
> "Create a Snowflake Cortex Agent that searches our internal knowledge base and returns RAG-augmented answers."

**Expected Routing (both editions must match):**
- Recognizes this as Cortex AI domain
- Does NOT attempt the work
- Advises user to install `essence-cortex-ai-builder`
- Stops after recommendation

**Pass Criteria:**
| Criterion | Image-Hybrid | Text-Only |
|-----------|:---:|:---:|
| Identifies Cortex AI domain | ☐ | ☐ |
| Does NOT produce Cortex code | ☐ | ☐ |
| Recommends correct skill name | ☐ | ☐ |
| Stops after recommendation | ☐ | ☐ |

**Routing path:** `REJECT → recommend skill`

---

## Scoring

- **5/5 tests match** = PASS — routing equivalence confirmed
- **4/5 match** = CONDITIONAL PASS — investigate the mismatch
- **≤3/5 match** = FAIL — TOON compression lost behavioral fidelity
