# Eval: Reference Loading — On-Demand Behavior

> **Purpose:** Validate that reference files load at the correct time (on-demand when
> the matching persona activates) and do NOT pre-load unnecessarily. Tests the
> load-budget rule (max 2 reference files per turn).
>
> **Method:** Feed prompts that trigger specific personas and verify the correct
> reference files are loaded. Check that unrelated references stay unloaded.

---

## Test 1: A1 Development — Correct Reference Selection

**Prompt:**
> "Add error handling to the API routes in our Express app. We need a centralized error handler with custom error classes."

**Expected Behavior:**
- Routes to A1 Development
- Loads `references/a1-development.md` (primary)
- Loads `references/a1-error-handling.md` (error handling sub-skill triggered by "error handling" + "centralized handler" + "error classes")
- Does NOT load scaffolding, git, logging, validation, or async references
- Respects 2-file load budget per turn

**Pass Criteria:**
| Criterion | Pass |
|-----------|:---:|
| A1 activates | ☐ |
| `a1-development.md` loaded | ☐ |
| `a1-error-handling.md` loaded | ☐ |
| No unrelated A1 sub-skills loaded | ☐ |
| ≤2 references loaded this turn | ☐ |
| Cites loaded refs in header (`Ref: a1-error-handling.md`) | ☐ |

---

## Test 2: A7 Security — Tiered Loading

**Prompt:**
> "Review the authentication flow in our app. We use JWT tokens stored in localStorage."

**Expected Behavior:**
- A7 Security activates (auth + token security)
- Loads `references/a7-security.md`
- Selects appropriate tier (Standard or Full — JWT in localStorage is a known vulnerability)
- Flags localStorage JWT as HIGH risk (XSS exposure)
- Does NOT load A1 development references (this is a review, not a build)

**Pass Criteria:**
| Criterion | Pass |
|-----------|:---:|
| A7 activates first | ☐ |
| `a7-security.md` loaded | ☐ |
| Security tier selected and tagged | ☐ |
| localStorage JWT flagged as risk | ☐ |
| No A1 references loaded | ☐ |

---

## Test 3: Multi-Persona — Load Budget Enforcement

**Prompt:**
> "Build a new user registration form with validation, write tests for it, and document the API endpoint."

**Expected Behavior:**
- Multiple personas: A1 (build) + A2 (test) + A4 (document)
- Turn 1: Loads at most 2 references (e.g., `a1-development.md` + `a1-input-validation.md`)
- Subsequent turns: loads `a2-testing.md`, then `a4-documentation.md`
- Does NOT load all 4+ references on first turn

**Pass Criteria:**
| Criterion | Pass |
|-----------|:---:|
| Multiple personas identified in routing | ☐ |
| First turn loads ≤2 references | ☐ |
| Additional refs deferred to later turns | ☐ |
| Each loaded ref cited in header | ☐ |
| Correct refs matched to correct personas | ☐ |

---

## Test 4: Scaffolding — Full Chain Loading

**Prompt:**
> "Create a new Next.js project with TypeScript, Tailwind CSS, and a REST API backend."

**Expected Behavior:**
- Routes to Scaffolding (new project, no existing package.json)
- Loads `a1-project-scaffolding.md` (mandatory for scaffolding)
- Loads `a1-development.md` (primary A1 ref)
- On subsequent turns: loads `a1-git-workflow.md` (.gitignore setup)
- A2 auto-chains: loads `a2-testing.md`

**Pass Criteria:**
| Criterion | Pass |
|-----------|:---:|
| Scaffolding route identified | ☐ |
| `a1-project-scaffolding.md` loaded first turn | ☐ |
| 4-phase checklist followed | ☐ |
| `.gitignore` created in Phase 2 | ☐ |
| A2 chains after Phase 3 | ☐ |

---

## Test 5: Cross-Cutting Reference — Knowledge Sources

**Prompt:**
> "I want to use the `react-hook-form` library v7 for form validation. Show me how to set up a registration form with Zod schema validation."

**Expected Behavior:**
- Routes to A1 Development
- Triggers Source-Driven Development protocol (external library usage)
- Loads `references/knowledge-sources.md` (library verification needed)
- Checks `package.json` for installed version before coding
- Tags output as `[DOC-VERIFY]` or `[DOC-UNVERIFIED]`

**Pass Criteria:**
| Criterion | Pass |
|-----------|:---:|
| A1 activates | ☐ |
| Source-Driven Development triggered | ☐ |
| `knowledge-sources.md` loaded (or referenced) | ☐ |
| Library version checked against package.json | ☐ |
| Doc verification tag applied | ☐ |

---

## Scoring

- **5/5 pass** = Reference loading system fully functional
- **4/5 pass** = Minor gap — investigate which reference was missed
- **Load budget violated** = MEDIUM finding — model over-loading context
- **Wrong reference loaded** = HIGH finding — routing → reference mapping broken
