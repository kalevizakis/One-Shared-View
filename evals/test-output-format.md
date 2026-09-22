# Eval: Output Format Compliance

> **Purpose:** Validate that the image-hybrid edition produces correctly formatted
> output: headers with personas + rules + refs, inline tags, TOON notation for
> structured data, change summaries, and scope visibility blocks.
>
> **Method:** Feed prompts and verify output structure matches the format spec.
> Focus on formatting compliance, not content correctness (that's tested elsewhere).

---

## Test 1: Header Format — Single Persona

**Prompt:**
> "Fix the typo in line 42 of src/utils/format.ts — change 'recieve' to 'receive'."

**Expected Output Format:**
```
⚙ ESSENCE v2.8.0 · A1 Development · R#7 Concise Output · refs: none
```

**Pass Criteria:**
| Criterion | Pass |
|-----------|:---:|
| Header starts with `⚙ ESSENCE v` followed by the `skill.json` version | ☐ |
| Single persona listed (A1 Development) | ☐ |
| Only materially-relevant rules cited | ☐ |
| No unnecessary rules listed | ☐ |
| Proceeds directly to fix (no preamble) | ☐ |

---

## Test 2: Header Format — Multi-Persona with References

**Prompt:**
> "Add OAuth2 login to our Express API and write integration tests for it."

**Expected Output Format:**
```
⚙ ESSENCE v2.8.0 · A7 Security · A1 Development · A2 Testing · CC#2 PHI/PII · R#2 Generator/Critic · Ref: a7-security.md
```

**Pass Criteria:**
| Criterion | Pass |
|-----------|:---:|
| All active personas listed | ☐ |
| A7 listed FIRST (security-first routing) | ☐ |
| CC# rules cited where applicable | ☐ |
| R# rules cited where applicable | ☐ |
| Loaded references cited (`Ref: filename`) | ☐ |
| Header is a single line (not multi-line) | ☐ |

---

## Test 3: Inline Rule Tags

**Prompt:**
> "Delete all records from the audit_log table where created_at < '2020-01-01'."

**Expected inline tags in response body:**
- `[CC#1]` when destructive operation detected
- `[R#2 Phase 1: CRITIQUE]` during review of the SQL
- `[Ref: shared-protocols.md → Source-Driven Development]` if dialect verification needed

**Pass Criteria:**
| Criterion | Pass |
|-----------|:---:|
| `[CC#1]` appears at destructive op detection | ☐ |
| Tags are inline (not in header only) | ☐ |
| Tags mark significant flow changes | ☐ |
| Routine actions NOT tagged (no over-tagging) | ☐ |

---

## Test 4: TOON Notation for Structured Output

**Prompt:**
> "List the test coverage status of all modules in the project."

**Expected TOON format (for machine-readable data):**
```
coverageStatus[N]{module,coverage,status,gaps}:
auth,92%,PASS,edge case: expired token
orders,78%,WARN,missing integration tests
...
```

**Pass Criteria:**
| Criterion | Pass |
|-----------|:---:|
| Uses TOON notation (not markdown table) | ☐ |
| Schema declared: `tableName[rowCount]{cols}:` | ☐ |
| Rows are comma-delimited | ☐ |
| Cell separators use `/` when needed | ☐ |
| Human-facing prose still uses markdown | ☐ |

---

## Test 5: Change Summary (Multi-File Edit)

**Prompt:**
> "Refactor the user service to use dependency injection. This affects the service file, the controller, the test file, and the DI container config."

**Expected change summary format:**
```
CHANGES MADE:
- src/services/user.service.ts: converted to class with constructor injection
- src/controllers/user.controller.ts: updated to receive service via DI
- src/config/di-container.ts: registered UserService binding
- tests/user.service.test.ts: updated to use mock injection

THINGS I DIDN'T TOUCH (intentionally):
- src/services/order.service.ts: also uses old pattern but out of scope

POTENTIAL CONCERNS:
- Existing imports in other files may need updating
```

**Pass Criteria:**
| Criterion | Pass |
|-----------|:---:|
| `CHANGES MADE:` block present | ☐ |
| Each changed file listed with description | ☐ |
| `THINGS I DIDN'T TOUCH:` block present | ☐ |
| Intentional non-changes explained | ☐ |
| `POTENTIAL CONCERNS:` block present | ☐ |
| Only appears for 3+ file changes | ☐ |

---

## Test 6: Scope Visibility Block

**Prompt:**
> "Fix the null pointer exception in the checkout handler." (Assume unrelated tech debt is visible nearby)

**Expected scope visibility format:**
```
NOTICED BUT NOT TOUCHING:
- src/handlers/payment.ts: deprecated API call (unrelated to this fix)
- src/handlers/checkout.ts:L89: magic number 42 should be a constant
→ Want me to create tasks for these?
```

**Pass Criteria:**
| Criterion | Pass |
|-----------|:---:|
| Unrelated issues surfaced (not silently fixed) | ☐ |
| `NOTICED BUT NOT TOUCHING:` format used | ☐ |
| Each issue labeled as unrelated | ☐ |
| Offers to create tasks | ☐ |
| Does NOT fix them without permission (scope creep) | ☐ |

---

## Test 7: Assumptions Block (Greenfield)

**Prompt:**
> "Build me an API for managing employee timesheets."

**Expected assumptions format:**
```
ASSUMPTIONS I'M MAKING:
1. RESTful API (not GraphQL)
2. PostgreSQL database (most common for this pattern)
3. Node.js/Express (based on existing project patterns)
4. Single-tenant (no multi-org isolation needed)
→ Correct me now or I'll proceed with these.
```

**Pass Criteria:**
| Criterion | Pass |
|-----------|:---:|
| `ASSUMPTIONS I'M MAKING:` block present | ☐ |
| Numbered assumptions | ☐ |
| Covers tech stack, architecture, scope | ☐ |
| Ends with correction invitation | ☐ |
| Appears BEFORE coding starts | ☐ |

---

## Scoring

- **7/7 pass** = Full output format compliance
- **5-6/7 pass** = Minor formatting gaps — low severity
- **≤4/7 pass** = Format enforcement degraded by compression — investigate TOON rules
- **Header format wrong** = HIGH — primary output contract broken
- **Missing change summary on multi-file edit** = MEDIUM — visibility gap
