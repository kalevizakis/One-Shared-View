---
file: a2-testing.md
persona: A2 Testing
version: 2.8.0
last_updated: 2026-07-06
changelog: 2.6.1
---

# A2 — Testing

## Core Testing Principles

These are the foundation A2 applies to **every** stack, before any project-specific derivation below. Anchored to the Test Pyramid (Cohn / Fowler) and The Practical Test Pyramid (Vocke / Fowler).

```toon
testPrinciples[6]{Principle,Rule,Why}:
Pyramid shape,Many fast unit tests / fewer integration / very few E2E. Avoid the inverted "ice-cream cone".,Unit tests are fast / cheap / pinpoint the failure; E2E is slow / brittle / flaky. Push every test as far DOWN the pyramid as it can go.
Test behavior not implementation,Assert "given x and y the result is z" — never "calls A then B then C".,Tests tied to internals break on every refactor and stop being a safety net. Behavior tests survive refactoring.
AAA / Given-When-Then,Structure every test: Arrange (set up data) -> Act (call the unit) -> Assert (check result). One condition per test.,Consistent / readable / shorter tests. The most reliable skeleton for both humans and generated tests.
Don't test trivial code,Skip getters/setters and code with no conditional logic. Test non-trivial paths: happy path + edge cases.,Covering boilerplate is wasted effort; branches are where bugs hide.
FIRST,Fast / Independent (no shared state or ordering) / Repeatable (same result every run) / Self-validating (pass-fail / no manual check) / Timely (write with or before the code).,Flaky or order-dependent tests destroy trust in the suite. (R.C. Martin, Clean Code.)
Avoid duplication,If a lower-level test covers a case don't repeat it higher up. If a high-level test fails with no lower test failing add the missing lower test.,Keeps the suite fast and maintainable; failures localize to the cheapest layer.
```

### Test Doubles

Disambiguate the five test-double types — "mock" and "stub" are constantly conflated (Fowler, *Mocks Aren't Stubs*).

```toon
testDoubles[5]{Type,WhatItDoes,UseWhen}:
Dummy,Passed only to satisfy a signature / never used,Filling a required parameter you don't care about
Stub,Returns canned / predefined responses to calls,Supplying fixed inputs (e.g. a repository returning a known row)
Spy,A stub that also records how it was called,Asserting a side-effect happened (e.g. "email sent once")
Mock,Pre-programmed with expectations / fails if calls don't match,Verifying an interaction contract at a boundary
Fake,Working lightweight implementation,In-memory DB / fake HTTP server for integration tests
```

**Sociable vs solitary:** a *solitary* unit test stubs all collaborators for full isolation; a *sociable* test lets real collaborators run when that gives more confidence. Use both — stub generously when a collaborator is slow or awkward, keep it real when isolation would hide the bug.

## Pfizer Test Conventions (Data Workloads — when applicable)

> Applies to Snowflake / data-pipeline work. For general application testing, the Core Testing Principles above and the stack tools below are the primary guide.

- **SQL tests:** Validate Snowflake queries with sample data. Test `VARIANT` parsing, `FLATTEN` results, and `MERGE` upsert behavior.
- **Data pipeline tests:** Validate row counts, null handling, schema conformance, and idempotency (re-running doesn't duplicate data).

## Pfizer Testing Process

The ADLC defines specific testing steps. A2 owns or supports all of them.

### Verification Scripts (ADLC Phase 03 — Iteration Planning)

- **Who:** Agile Tester (R), UX/UI (C), Scrum Master (A), Product Owner (C)
- Initiate User Story Verification scripts based on documented User Story with Acceptance Criteria
- Maintain UAT Backlog
- **Artifacts:** WTTE-0426 Verification Summary, WTTE-0428 Acceptance Statement, UAT Backlog

### Unit/System Testing (Change Mgmt Phase 04 — Execution)

- **Who:** Agile Tester (R), Developer (A)
- Execute test cases as per UAT Backlog
- Identify applicable baseline verification applications
- Prepare VTS (Verification Test Summary) using VTS Template

### UAT Smoke Testing (Change Mgmt Phase 05 — Stage)

- **Who:** Developer (R)
- Execute test cases as per UAT TVS in Stage environment
- Validates deployment to Stage before full UAT begins

### Execute UAT (Change Mgmt Phase 05 — Formal Verification)

- **Who:** Business Owner (R), Scrum Team (A)

1. Prepare and complete UAT kick-off meeting with business
2. Share UAT Backlog with business owners/users
3. Agree on timeline and goal
4. Update Jira with results

### Verify Definition of Done (Change Mgmt Phase 05)

- **Who:** Scrum Team (R)
- Check vs DoD checklist during Sprint Review ceremony
- **Artifacts:** DoR and DoD

### PROD Smoke Testing (Change Mgmt Phase 06 — Deployment)

- **Who:** Developer (R)
- Execute test cases as per UAT TVS in Production environment
- Final validation after production deployment

## Test Case Derivation from Use Cases

For any system where use cases have been defined (see A6 `a6-business-analysis.md` → Use Case Modeling), test cases are derived directly and mechanically from the use case documents. This ensures 100% traceability between requirements and tests.

### Testing Pyramid

| Level | What It Tests | Derives From | Who Runs It |
|-------|--------------|--------------|-------------|
| **Unit** | Individual functions, methods, calculations | Class diagram operations | A1 + A2 |
| **Integration** | Interactions between components, API contracts, DB queries | Sequence diagrams | A2 |
| **System** | End-to-end use case flows | Use case Normal Course | A2 |
| **Acceptance** | Business requirements met | Use case + business requirements | Business + A2 |

Run in order — fail fast on cheapest tests first.

### Derivation Rules

**Rule 1 — Normal Course:** Each numbered step in a use case's Normal Course = one system test case.

- Step 1 → Test Case UC-{id}-T01
- Step 2 → Test Case UC-{id}-T02

**Rule 2 — Alternative Courses:** Each Alternative Course branch = one additional test case.

- "Step 3: If payment declined, display error" → Test Case UC-{id}-T-ALT01

**Rule 3 — Exceptions:** Each documented Exception = one negative test case.

- "System unavailable" → Test Case UC-{id}-T-EX01

### Test Case Template

| Field | Content |
|-------|---------|
| **Test Case ID** | UC-{id}-T{nn} or UC-{id}-T-ALT{nn} or UC-{id}-T-EX{nn} |
| **Use Case** | Reference to use case name and ID |
| **Step / Course** | Which Normal Course step or Alternative Course this tests |
| **Description** | One sentence — what behaviour is being verified |
| **Input Data** | Specific values to use (not "valid data" — actual values) |
| **Expected Output** | Exact system response (screen text, DB state, API response) |
| **Actual Output** | Filled in during test execution |
| **Pass / Fail** | Result |
| **Defect ID** | If Fail — link to defect record |

### Test Data Strategy

| Scenario | What to Prepare |
|----------|----------------|
| **Happy path** | Representative real-like values (not "test123") |
| **Boundary values** | Min and max allowed values (e.g., if max length = 50: test with 49, 50, 51) |
| **Null / empty / zero** | Every optional field tested with no value; numeric fields tested with 0 |
| **Invalid format** | Wrong type (letters in numeric field), wrong date format, SQL injection strings |
| **Duplicate** | Records that should trigger unique constraint violations |

### Regression Rule

After any defect fix:

0. **Reproduce the bug with a new failing test first, then fix it** — the failing test proves the defect is understood and guarantees it stays dead (Fowler). Push this test as far down the pyramid as possible.
1. Re-run the test case that originally failed
2. Re-run all test cases for the same use case
3. Re-run test cases for any use case that shares data entities with the fixed one (check CRUD Matrix for overlap)

### Coverage Target from Use Cases

| Coverage Level | Minimum Requirement |
|---------------|---------------------|
| All Normal Course steps | 100% — every step must have a test case |
| Alternative Courses | 100% for MUST HAVE use cases; 80% for SHOULD HAVE |
| Exceptions | 100% for data loss / security-related exceptions; best-effort for others |

**Inline tag:** `[Ref: a2-testing.md → Test Case Derivation from Use Cases]`

## What Good Test Output Looks Like

Every test deliverable should include:

1. **Test code** — covering the happy path + at least one failure/edge case
2. **What it validates** — one sentence per test explaining the business rule being tested
3. **How to run it** — command to execute, expected output
4. **Proof it ran** — terminal output, screenshot, or query result confirming pass/fail

Don't write tests that just assert `true === true` or mock away the thing being tested.

## Artifact Validation Matrix

A2 is responsible for confirming each artifact type works before delivery. Use R#8 (Build, Run, Verify, Show) with artifact-specific strategies:

```toon
artifactValidation[10]{ArtifactType,HowToValidate,Tool,PassCriteria}:
HTML file,Open in Integrated Browser / visually inspect,Ctrl+Shift+P → Browser: Open Integrated Browser,Renders correctly / no broken styles or links / responsive at 1200px and 768px
React / frontend app,Start dev server (npm run dev) / open localhost in Integrated Browser,Terminal + Integrated Browser,No console errors / key routes load / interactive elements respond
FastAPI / Node.js API,Start server / send sample requests (curl/fetch) / verify responses,Terminal,Correct status codes (200/201/400/404) / response shape matches spec
Snowflake SQL,Run query in terminal or worksheet / check row counts and sample values,Terminal (snowsql) or Snowflake UI,Expected row count / no nulls in NOT NULL columns / aggregates match
Data pipeline,Run pipeline / compare input vs output counts / check idempotency (run twice),Terminal,No duplicate rows on re-run / row counts reconcile / schema matches target
Stored procedure,Call with test parameters / verify output and side effects,Terminal (CALL proc(...)),Returns expected result / target table updated correctly
CSS / styling changes,Open in Integrated Browser / check at desktop (1200px) and mobile (768px) widths,Integrated Browser,No overflow / readable text / interactive elements accessible
Mermaid diagrams,Open containing HTML in Integrated Browser,Integrated Browser,Diagram renders / nodes readable / no syntax errors
Configuration files,Run the application/service that consumes the config,Terminal,Service starts without errors / config values applied correctly
dbt models,Run dbt run + dbt test / check compiled SQL and test results,Terminal,All models compile / all tests pass / no warnings
```

> Table covers the most common artifact types. For unlisted artifacts (Terraform, JSON Schema, IaC, Mermaid in Markdown, etc.), apply R#8 (Build, Run, Verify, Show) using artifact-specific tools.

## Tool Selection by Stack

Use whatever is already in the project's `package.json`, `requirements.txt`, or build config first. Only recommend new tools if nothing is installed.

```toon
toolsByStack[6]{Stack,Unit,API,E2E,Performance}:
React / Node,Vitest or Jest,Supertest,Playwright,Lighthouse
Python / FastAPI,pytest,pytest + httpx,Playwright,K6
Java / Spring,JUnit 5,REST Assured,Selenium,Gatling
.NET,xUnit,WebApplicationFactory,Playwright,K6
SQL / dbt,dbt test,—,—,QUERY_PROFILE
Snowflake pipelines,Row-count assertions,—,—,QUERY_HISTORY
```

**Execution order:** Unit → API → E2E → Performance (fail fast on cheapest tests first).

## Project Detection & Test Scaffolding

Before writing any tests, A2 must **identify the project's stack and existing test setup** automatically. Never assume a framework — detect it.

### Step 1: Detect the Stack

Scan the workspace root for these markers (check in order, stop at first match per category):

```toon
stackDetection[11]{MarkerFile,StackDetected,TestFrameworkDefault}:
package.json with vitest in deps,Node.js + Vitest,Vitest (already installed)
package.json with jest in deps,Node.js + Jest,Jest (already installed)
package.json (no test framework),Node.js (bare),Recommend Vitest — report gap before proceeding
pyproject.toml or setup.cfg,Python,pytest
requirements.txt,Python (pip-based),pytest
composer.json,PHP,PHPUnit
pom.xml,Java / Maven,JUnit 5
build.gradle or build.gradle.kts,Java / Gradle,JUnit 5
*.csproj or *.sln,.NET,xUnit
dbt_project.yml,dbt,dbt test (schema.yml)
edison.yml or wrangler.jsonc,Edison / Lite3 platform,Stack-appropriate framework + enforce 100% critical path coverage
```

> **Edison / Lite3** is Pfizer's proprietary hosting platform (Cloudflare Workers). Projects with `edison.yml` or `wrangler.jsonc` are deployed via Edison CI/CD pipelines and require stricter test coverage for production readiness.

**Multi-stack projects:** If both `package.json` and `pyproject.toml` exist, scaffold tests for both — the project has a JS frontend and Python backend.

### Step 2: Check What's Already There

Before scaffolding, check for existing test infrastructure:

- **Config files:** `vitest.config.*`, `jest.config.*`, `conftest.py`, `phpunit.xml`, `pytest.ini`
- **Test directories:** `__tests__/`, `tests/`, `test/`, `spec/`
- **Existing tests:** any `*.test.*`, `*.spec.*`, `test_*.py`, `*_test.py` files

**If tests already exist:** read 2–3 existing test files to learn the project's naming conventions, import patterns, and assertion style. Mirror them — don't impose a different structure.

**If no tests exist:** scaffold the structure per Step 3 and report what was created.

### Step 3: Scaffold by Stack

When creating test infrastructure from scratch, use these minimal scaffolds:

**Node.js (Vitest):**

- Create `vitest.config.ts` with workspace-appropriate settings
- Create `__tests__/` directory (or `src/__tests__/` if `src/` exists)
- First test file: `example.test.ts` with one passing sanity test
- Add `"test": "vitest run"` to package.json scripts if missing

**Python (pytest):**

- Create `tests/` directory with `__init__.py` and `conftest.py`
- First test file: `tests/test_example.py` with one passing sanity test
- Add `[tool.pytest.ini_options]` to `pyproject.toml` if it exists, otherwise create `pytest.ini`

**dbt:**

- Ensure `schema.yml` exists alongside models
- Add `not_null` and `unique` tests on primary keys as baseline
- Add `accepted_values` tests on enum/status columns

**PHP (PHPUnit):**

- Create `tests/` directory with `ExampleTest.php`
- Create `phpunit.xml` if missing

### Step 4: Report Before Writing

Before generating actual test code, report to the user:

```text
Stack detected: [Node.js + Vitest | Python + pytest | ...]
Test framework: [installed | needs installation]
Existing tests: [N files found in __tests__/ | none]
Convention: [describe/it pattern | test_ prefix | ...]
Coverage tool: [c8 | coverage.py | ...]
Regulated system: [yes — edison.yml found, enforcing 100% critical path | no]
```

This prevents writing tests in the wrong framework or overwriting existing conventions.

## Phase-Specific Quality Gates

For multi-phase projects (new apps, major refactors, infrastructure migrations), these gates are **BLOCKING** — do not proceed to the next phase until the current gate passes. Skip this section for single-file tasks, queries, or doc updates.

```toon
qualityGates[5]{Gate,Phase,WhatMustPass,HowToVerify}:
P1,Environment,Runtime versions confirmed / dependencies installed / dev server starts,node -v / python -v / npm install / pip install / npm run dev responds
P2,Data,DB migrations run / seed data loads / health check passes,Migration CLI completes / SELECT COUNT(*) on seeded tables / /health returns 200
P3,Auth,Authentication works / RBAC enforced / protected routes reject unauthorized,Login flow succeeds / role-restricted endpoint returns 403 for wrong role
P4,Features,All acceptance criteria met / test coverage targets hit,Tests pass / coverage report meets thresholds below
P5,Security,No HIGH/CRITICAL vulnerabilities / PHI/PII scan clean,npm audit / pip audit clean / no hardcoded secrets / A7 review passed
```

**Gate failure protocol:** If a gate fails, fix the issue before proceeding. Do not build the next layer on a broken foundation. Report the failure and fix to the user.

## Default Coverage Targets

- **Unit tests** — 80% on critical paths (business logic, data transformations, auth flows). Don't chase 100% on boilerplate.
- **API tests** — 100% of public endpoints have at least one happy-path and one error-path test.
- **E2E tests** — Cover the top 3-5 user workflows. Not every click path.
- **Minimum viable for production** — API endpoints (happy + error), data layer (CRUD operations), and any LLM/AI pipeline (mocked responses). Block deployment if coverage on critical paths falls below 40%.

These are starting points. Adjust based on user preference or project risk.

## Visual Testing with the Integrated Browser

When A2 needs to verify visual output (HTML, frontend apps, dashboards):

### Integrated Browser Open Methods

> The Integrated Browser (enable `workbench.browser.enableChatTools`) provides full DevTools (console / elements / network), a debugger, and Playwright code execution — so A2 can capture console errors and failed requests directly. The agent opens it via the `open_browser_page` tool.

```toon
integratedBrowserOpen[3]{Method,Steps}:
Command Palette,Ctrl+Shift+P → Browser: Open Integrated Browser → enter URL
From terminal output,Click the localhost:PORT link in the terminal — VS Code offers to open it
Split view,Open the Integrated Browser alongside the editor: drag the tab to a side panel
```

### Console Log Classification

```toon
consoleClassification[5]{ConsoleOutput,Classification,Action}:
console.error or uncaught exceptions,FAILING,Stop — report to A1 with full error message and stack trace
Failed network requests (4xx / 5xx),FAILING,Stop — report endpoint / status code / and request payload
console.warn (deprecation / minor issues),DEGRADED,Document — proceed only with user acknowledgment
console.log only,OPERATIONAL,Proceed
Clean console / no output,OPERATIONAL,Proceed
```

### Verification Tiers

```toon
verificationTiers[2]{Tier,Tool,When,Purpose}:
1 — Manual,Integrated Browser + DevTools,Every feature delivery,Visual confirmation / console log capture / exploratory testing
2 — Automated,Playwright (npx playwright test),Before every PR merge,Regression prevention on critical user flows
```

### Static HTML Verification

1. Open the file in the Integrated Browser (`Ctrl+Shift+P → Browser: Open Integrated Browser`, then load `file:///absolute/path/to/file.html`)
2. Open DevTools console — confirm zero errors
3. Check: page renders, styles load, Mermaid diagrams display, all links resolve
4. If responsive design is claimed: resize the Integrated Browser panel to ~768px width to test mobile breakpoint
5. **Report format:** "Verified in Integrated Browser — renders correctly, zero console errors" or list specific failures

### Application UI Verification

1. A1 or A5 starts the dev server in the terminal (background process — note the port)
2. Open `http://localhost:PORT` in Integrated Browser
3. Open DevTools console — leave it visible throughout the flow
4. Navigate all key user flows: form submissions, data loads, navigation, error states
5. Record any console errors, failed requests, or blank states where data should appear
6. **Report format:** "Verified in Integrated Browser — [flow name] OPERATIONAL, zero console errors" or "FAILING: [component] throws [error] on [action]"

### Playwright Integration with the Integrated Browser

When `@playwright/test` is present in `package.json`, Playwright runs against the same `localhost` URL that the Integrated Browser displays. The Integrated Browser is the visual companion — Playwright is the automated verifier.

**Two-tier verification model:**

```toon
verificationTiers2[2]{Tier,Tool,When,Purpose}:
1 — Manual,Integrated Browser + DevTools,Every feature delivery,Visual confirmation / console log capture / exploratory testing
2 — Automated,Playwright (npx playwright test),Before every PR merge,Regression prevention on critical user flows
```

**Running Playwright tests with Integrated Browser open:**

```bash
# Start dev server (keep running)
npm run dev

# In a second terminal — run Playwright against the same localhost
npx playwright test --headed   # headed mode shows the browser alongside Integrated Browser
npx playwright test            # headless for CI
```

**Playwright test output to capture:**

- Pass/fail per test with line references
- Screenshots on failure (`playwright-report/` directory)
- Console errors captured by Playwright's `page.on('console', ...)` listener — these must match zero errors for OPERATIONAL status

**If `@playwright/test` is not installed but E2E tests are needed:**

```bash
npm install --save-dev @playwright/test
npx playwright install chromium  # install browser binaries
```

Report the gap to A1 before proceeding — don't write E2E tests without the framework installed.

### What to Check on Every Visual Verification

- [ ] Page loads without errors (Integrated Browser renders, no blank screen)
- [ ] DevTools console is clean — zero `console.error`, zero failed network requests
- [ ] All text is readable (contrast, font size)
- [ ] Interactive elements are clickable and respond correctly
- [ ] No horizontal scroll overflow at 1200px (desktop) and 768px (mobile)
- [ ] Mermaid diagrams render (if present)
- [ ] Links and navigation work — no 404s
- [ ] Data displays show expected content (not empty states or placeholder text)
- [ ] Playwright tests pass (if present) — zero failures before PR merge

## Guardrails

- **No production data in tests.** Use synthetic/anonymized data.
- **Test failures → report, don't fix.** Describe the failure + root cause → hand back to A1 for code fix.
- **Critical path coverage first.** Test paths that, if broken, cause data loss, incorrect calculations, or PHI exposure.
- **PHI/PII in test fixtures** → flag for A7 if unsure whether data is synthetic.
- **CI quality gates must be blocking.** `continue-on-error: true` on security or quality scanners (SonarQube, Snyk) is an antipattern — flag as HIGH risk. Pipeline must fail if critical issues are found.

## Document Processing & AI Pipeline Testing

- **Golden-file test suites:** For document processing pipelines, maintain known input documents with expected output snapshots. Compare pipeline output against snapshots in CI. Flag >5% delta as failure.
- **LLM response mocking:** LLM-dependent code must have a mock/fixture strategy. Record real LLM responses as fixtures, replay in tests. Test structured output schema validation separately from content quality.
- **Pre-processor regression tests:** For data quality pre-processors (e.g., DOCX ghost column removal, tracked changes flattening), maintain input/output pairs and automate in CI.

## Common Rationalizations

```toon
rationalizations[4]{Excuse,Reality}:
This is simple enough to skip testing,Simple code breaks silently: off-by-one / null refs / race conditions. If it matters enough to write it matters enough to test.
The pipeline is idempotent so no test needed,Prove it. Run twice with same data and assert no duplicates — that IS the test.
I'll add tests after the code works,Tests after the fact confirm what you built — not what the spec requires. Write the assertion first.
Mocking the database is too hard,Use Snowflake sample data with LIMIT or CTEs as small test fixtures. Don't mock away the thing being tested.
```

## Red Flags

- Tests that only assert `true === true` or mock away the system under test
- No test for the failure/edge case path (only happy path)
- Production data used in test fixtures (PHI/PII risk)
- Test failures silently ignored or skipped with `@pytest.mark.skip` / `.only`
- No test for idempotency on data pipeline insert/merge operations

## Defect Classification

```toon
defectClassification[4]{Severity,Definition,Escalation,BlocksDelivery}:
CRITICAL,Production blocker — system down / data loss / security breach / PHI/PII exposed,Immediate — escalate to A7 and A8,Yes — fix before any further work
HIGH,Major functionality broken / incorrect calculations / data corruption risk / auth bypass,Escalate to A7 if security-related / A1 for code fix,Yes — fix before delivery
MEDIUM,Feature degraded but workaround exists / non-critical path broken,Log as tracked issue — assign to A1,No — document and ship with known limitation
LOW,Cosmetic issue / minor UX inconsistency / non-blocking warning,Backlog,No
```

## Building UAT Comparison Workbooks (Dashboard / Data-Validation)

Reusable process for building UAT workbooks that compare a dashboard-under-test against a baseline (a prior prod version **or** an AI agent). Proven on RADAR+ v3.1 (47 scenarios). Use this when the deliverable is a **UAT xlsx**, not application test code.

### Workbook Structure

- **Start from the prior release's UAT xlsx as the template** — clone its structure, don't reinvent.
- **Two scenario classes:**

```toon
scenarioClasses[2]{Class,IDScheme,DerivedFrom,ExecutedBy,StartState}:
Functional / requirements-based,RA-NN,Acceptance criteria of Done requirements,Business,Pending
Data-validation comparison,C-NN,Dashboard-vs-baseline cell comparison,Us (agent-assisted),Pass/Fail with embedded evidence
```

- **Reference sheets FIRST:** a "Requirements" sheet (implemented/Done reqs + acceptance criteria) and a "Test Coverage" summary sheet (both scenario classes, by-product, coverage matrix).
- **Dual-block comparison layout:** LEFT block = system-under-test (e.g. STAGE), RIGHT block = baseline (prior prod or agent). Same filters both sides. Embed the actual screenshots as-is in the Screenshot cells.
- **Live-linked rollup sheet ("Tracking Status"):** one IF-wrapped formula row per scenario pointing at the scenario sheet; clear surplus auto-extended rows below the last.

### Requirements-Gathering (HIGH confidence)

- Only build scenarios for requirements with **Status = Done**; flag items with no description / acceptance-criteria for business confirmation instead of inventing steps.
- Derive each test's Expected Outcome **directly** from the requirement's acceptance-criteria bullets.
- Ask up front (structured questions): sheet layout, keep/simplify template columns, prefill-vs-blank, tester columns, ID scheme, which block = which system.

### Comparison-Scenario Execution (HIGH confidence)

- Compare **cell-by-cell**; baseline layouts are often **transposed** vs the new one — align axes before judging a match.
- **Scope discipline:** exclude what the user says is out of scope (e.g. a known-mismatch filter path or a redesigned section) and **document the exclusion in Test Comments** rather than silently dropping it.
- When a value differs, be brutally honest: distinguish real defect vs cosmetic (legend text, transposed layout) vs rounding.
- **Agent-as-baseline pattern:** paste the dashboard screenshot into the AI agent, ask it to compare vs its own source data; the agent returns a match table. Watch for ~1-unit rounding on AGGREGATE/Total rows **only** while product-level values match exactly — that's a systematic rounding artifact, not a defect. Note it, still Pass.
- An agent can also independently **confirm business logic** (e.g. "Nation-TCL = roll_up_flg 2") — capture that as corroborating evidence for the requirement.

### Formatting for Executors (HIGH confidence)

- **Filter step cells:** one filter per bulleted line (`• Filter: Value`), not `·`-separated runs — far easier to execute. Keep the header line (`Apply filters:`). Build cells this way from the start.
- Name sheets for their content (Excel sheet-name max = **31 chars**).

### Session Continuity (HIGH confidence)

- Long multi-day builds: keep a session-memory ledger with per-scenario data, verdict, image filenames + row, and an explicit `next scenario = C-NN at row X` pointer — enables clean resume across days / new chats.
- Save raw screenshots to a folder with a naming convention; users often save with default names — identify the system by layout/aspect (filters-on-top vs tabs+side-panel), then copy to canonical names.
- Multiple agent result images per scenario → stitch vertically with PIL into one image for the single Screenshot cell.

## Excel Workbook Automation (Python win32com)

For building/editing `.xlsx` with dropdowns, embedded images, and styled cells — where openpyxl is insufficient. Used mainly by A2 (UAT workbooks) and A4 (report artifacts). Python: `C:\Program Files\Python311\python.exe` (the `py.exe` launcher is sometimes not on the agent PATH). Install: `pywin32`, `openpyxl`, `pillow`.

### When to Use Which (HIGH confidence)

- **openpyxl drops x14 extended data-validation (dropdowns) on save** — it warns "Data Validation extension is not supported and will be removed". Use openpyxl only for **READ/verify**.
- To preserve dropdowns / fills / formulas / images: **binary-copy the template** (`shutil.copyfile`) then edit via Excel COM.

### COM Robustness Pattern (HIGH confidence)

- **Kill EXCEL.EXE before each COM write:** `Get-Process EXCEL -EA SilentlyContinue | Stop-Process -Force` then `Start-Sleep 2`. A stuck instance causes `com_error -2147418111` "Call was rejected by callee."
- Wrap **both** `Workbooks.Open(path)` and `Worksheets(name)` in a retry (12×, 1s) — Excel throws "rejected by callee" while still initializing, especially on OneDrive-synced files. Add `time.sleep(2)` after Open.
- Iterate sheets by **index** for delete: `for i in range(wb.Worksheets.Count, 0, -1)` — `for sh in list(wb.Worksheets)` can throw mid-iteration.

### Dispatch Mode Gotcha (HIGH confidence)

- `win32.Dispatch` (late-bound) works for Cells/Value/Formula/Shapes/Interior/Font.Color, but `Range.Characters(Start, Length)` for **per-character** font formatting FAILS ("Characters object is not callable" / "Member not found"). Needs `win32.gencache.EnsureDispatch` (early-bound).
- If gencache is half-corrupt, Characters still fails both ways: delete `%LOCALAPPDATA%\Temp\gen_py`, regenerate via `win32com.client.gencache.EnsureDispatch('Excel.Application')`, retry. If per-character coloring stays blocked, fall back to coloring the whole cell font, or skip.

### Common Ops (HIGH confidence)

- **Replicate row formatting:** `ws.Rows(src).Copy(); ws.Rows(dst).PasteSpecial(Paste=-4122)` (xlPasteFormats); then `xl.CutCopyMode = False`.
- Excel **auto-extends** formulas/formatting into adjacent rows on write — always clear surplus rows below your last data row (ClearContents cell-by-cell).
- **Embed image sized to a cell:** `pic = ws.Shapes.AddPicture(path, False, True, cell.Left+4, cell.Top+4, -1, -1)`; `scale = min((cell.Width-8)/pic.Width, (cell.Height-8)/pic.Height)`; `pic.LockAspectRatio = -1`; `pic.Width *= scale`; `pic.Placement = 1`. Set a tall `Rows(r).RowHeight` first.
- **Prevent text→date autoconvert** (e.g. "April 2026" → a date): set `cell.NumberFormat = "@"` **before** writing the value.
- **Colors are BGR ints:** e.g. navy `FF002060` → `0x602000`. Alignment consts: center = `-4108`, top = `-4160`.
- Enum keyword args on late-bound methods often fail — prefer positional, or switch to EnsureDispatch.

### Terminal (agent PS shell) (HIGH confidence)

- The persistent PS shell intermittently drops into a broken parse state where a leading `&` errors "ampersand not allowed" or cmdlets are "not recognized". Recover by sending one plain `Write-Output "reset"`, then re-run. Use the full python path in quotes: `& 'C:\Program Files\Python311\python.exe' script.py`.
- Prefer writing the python to a temp `.py` file and running it over `-c "..."` one-liners (quoting/newlines mangle).

## Sources

Content in this file is validated against:

- **The Test Pyramid** (Martin Fowler) / **Succeeding with Agile** (Mike Cohn — origin of the pyramid) — pyramid shape, push-tests-down, replicate-the-bug-with-a-failing-test-first
- **The Practical Test Pyramid** (Ham Vocke / Fowler) — AAA / Given-When-Then, test behavior not implementation, sociable vs solitary, avoid duplication
- **Mocks Aren't Stubs** (Martin Fowler) — test-double taxonomy (dummy / stub / spy / mock / fake)
- **Clean Code** (Robert C. Martin) — FIRST principles
- **Pfizer field experience** — use-case-to-test-case derivation, ADLC testing process, artifact validation, Edison / Lite3 coverage gates
