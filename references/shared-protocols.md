---
file: shared-protocols.md
persona: Cross-cutting (Shared Protocols)
version: 2.8.0
last_updated: 2026-07-08
changelog: 2.6.1
---



# Shared Protocols



Reusable patterns for any multi-deliverable project. Personas reference these

instead of re-inventing per domain.



## 1. Structured Document Generation



When producing a document suite, every document must follow A4 standards

(title, version, date, author context, changelog) plus:



- **Scope section** — what this document covers, what it does not
- **Risk register** — numbered IDs (R1, R2...), severity (HIGH/MEDIUM/LOW), mitigation
- **Open questions** — numbered IDs (Q1, Q2...), priority, "why it matters" context
- **Mermaid diagrams** — minimum one per document; complex docs need 3+
- **Cross-references** — link to related documents by name and section
- **HTML variant** — collapsible sections, sidebar nav, styled badges, print CSS



## 2. Q&A Tracker



For any project requiring external clarification (vendor, stakeholder, team):



- Sequential IDs: Q1, Q2, Q3...
- Fields: ID, Category, Priority (CRITICAL BLOCKER / HIGH / MEDIUM / LOW), Question, Why It Matters, Status (OPEN / ANSWERED / FOLLOW-UP / CLOSED)
- Group related questions so recipients can answer them together
- Track across rounds — never lose a question
- Follow-up questions use FU-1, FU-2... linked to the parent Q



## 3. Answer Processing



When answers arrive (partial or complete), process each one:



1. **Categorize:** COMPLETE & ACTIONABLE / PARTIAL OR AMBIGUOUS / CONTRADICTS EVIDENCE / TRIGGERS NEW QUESTIONS / STILL UNANSWERED
2. **Verify against evidence** — check code, data, or docs; report CONFIRMED / PARTIALLY CONFIRMED / CONTRADICTED with evidence
3. **Detect gaps** — conditional language, undocumented dependencies, new edge cases, scope changes
4. **Assess impact** — does this change effort, timeline, deliverable count, or architecture?



Produce: verification summary, follow-up questions, updated tracker, scope change flag if applicable.



## 4. Cross-Document Update Propagation



When verified information changes, update ALL documents simultaneously:



- Every document referencing the changed item gets updated
- Risk IDs, question statuses, quantitative references stay consistent
- Version bump all affected documents (v1.1, v1.2...)
- Changelog entry per document with what changed and why
- Re-scan for new inconsistencies introduced by the update



## 5. Blocker Escalation



When a CRITICAL BLOCKER remains unresolved for 2+ review rounds:



For each stale blocker present three options:



| Option | Description |
| --- | --- |
| **Wait** | Continue waiting — state timeline impact and what it blocks |
| **Work Around** | Implement a workaround — describe limitations and technical debt |
| **Descope** | Remove from current scope — state what gets deferred and downstream impact |



Set a decision deadline. Identify who decides. Update risk register with escalation status.



## 6. Diagram Enrichment



When Q&A cycles stabilize or on request, audit all diagrams:



- All components/consumers shown?
- Deprecated/replaced items shown as overlay?
- Scheduling/timing annotated on nodes?
- Quality checkpoints visible?
- Phase/release boundaries marked?
- Color legends and Mermaid syntax current?



Categorize proposed enrichments as HIGH / MEDIUM / LOW value. Apply only user-approved changes. Update both MD and HTML versions.



## 7. QA Consistency Audit



Before final delivery of any multi-document set:



- **Cross-document consistency** — IDs, statuses, counts, and version numbers match across all files
- **Format parity** — every HTML has an MD counterpart and vice versa
- **Completeness** — no empty tables, unresolved placeholders, or missing sections
- **Diagram-prose alignment** — diagrams match what the text describes
- **Effort consistency** — estimates match across all documents that reference them



## 8. Decommissioning Checklist



When retiring any system, pipeline, or component:



- [ ] Verify zero active consumers reference the old component (search entire codebase)
- [ ] Disable scheduling (set to None or remove from orchestrator)
- [ ] Rename/archive old artifacts (prefix `_DEPRECATED_` or move to archive)
- [ ] Remove or update old configuration entries
- [ ] Archive scripts (move to `_deprecated/` folder — do not delete)
- [ ] Update documentation to reflect retirement
- [ ] Notify affected teams with decommissioning date



### Software Deprecation Patterns



When deprecating code (not just pipelines), apply these migration strategies:



| Pattern | When to Use | How |
|---------|-------------|-----|
| **Strangler Fig** | Replacing a large module incrementally | Build new alongside old, redirect traffic gradually, remove old when traffic reaches zero |
| **Adapter/Facade** | API contract must stay stable | Wrap new implementation behind old interface, consumers don't change |
| **Feature Flag** | Risk-sensitive rollout | Gate new code behind flag, enable per-environment, remove flag after full rollout |



### Zombie Code Detection



Code that was "temporarily disabled" but never removed. Signs:



- Commented-out blocks with no ticket reference
- Feature flags that haven't been toggled in >90 days
- Leftover "remove after migration" comments older than 6 months
- Dead imports (imported but never referenced)
- Unreachable branches behind always-false conditions



**Action:** flag during code review (A10), create removal tickets, track in Q&A log.



## 9. Lessons Learned



At project close or major milestone:



- **What worked** — methodologies, tools, communication patterns
- **What didn't** — underestimates, missed dependencies, stale blockers
- **What to change** — concrete recommendations for next time
- **Plan vs Reality** — quantified deltas (effort, timeline, scope) from original baseline



## 10. Multi-Agent Orchestration



> **Scope:** Applies to all domains. Useful for any system that chains multiple LLM agents (workflow tools, automation pipelines, RAG ensembles), not only ML/data-engineering.



For systems using multiple LLM agents (e.g., LangGraph pipelines with parse, analyze, review agents):



- **Responsibility mapping** — Each agent owns a clearly defined output. No two agents produce the same artifact.
- **Context handoff** — Define what context passes between agents (full document, summary, structured metadata). Minimize token transfer.
- **Circuit breaker** — If one agent fails, define fallback behavior: skip step, use cached result, or halt pipeline. Never let a single agent failure cascade silently.
- **Human-in-the-loop insertion** — Identify which agent outputs require human review before downstream agents consume them.



## 11. Opaque External Dependencies



> **Scope:** Applies to all domains — any third-party API, vendor service, or LLM endpoint whose internals you cannot inspect.



When integrating with external services whose internal behavior is unknown:



- **Document known behavior + assumptions** — What inputs are accepted, what outputs are observed, what the endpoint name implies vs. what it actually does.
- **Build bypass/fallback path** — If the opaque service goes down or behaves unexpectedly, the system should degrade gracefully.
- **Monitor response quality** — Track output metrics (word count, completeness, error rate) over time to detect silent degradation.
- **Flag as architectural risk** — Opaque dependencies should appear in risk registers and architecture reviews.



## 12. Data Quality Pre-Processors



> **Scope:** Applies to all domains that feed structured/unstructured input to an LLM (RAG, document parsing, form extraction, log analysis), not only ML pipelines.



For AI/ML pipelines, build deterministic pre-processors that fix known data quality issues BEFORE sending to LLM:



- Fix known structural problems at the data layer (ghost table columns, tracked changes in DOCX, encoding issues, malformed XML) — cheaper, faster, and more reliable than asking the LLM to handle dirty input.
- Pre-processors should be idempotent and testable with golden-file input/output pairs.
- Log what each pre-processor fixed (count of changes, affected elements) for audit and debugging.



## 13. Learning Extraction



At the end of complex tasks or when a significant pattern emerges, extract reusable learnings into user memory (`/memories/`). This turns each session into institutional knowledge.



### What to Capture



| Category | Examples |
|----------|----------|
| **Patterns that worked** | "Snowflake MERGE with QUALIFY deduplication handles SCD Type 2 reliably" |
| **Patterns that failed** | "Using LLM for date parsing is unreliable — use deterministic pre-processor instead" |
| **Project-specific facts** | "Lidoc backend uses FastAPI on port 8000, frontend on 3000" |
| **Tool/library insights** | "Material-UI v6 DataGrid requires `rows` as state, not prop — causes re-render loop otherwise" |
| **Constraint discoveries** | "Pfizer Mule proxy has 30s timeout — chunk large LLM requests" |



### Structured Format



When storing a learning, use this structure:



```markdown

**Learning:** {concise description}

**Confidence:** HIGH | MEDIUM

**Source:** {how this was discovered — error, testing, docs, user feedback}

**Applicable to:** {what contexts this applies to}

```



### Confidence Thresholds



| Level | Criteria | Action |
|-------|----------|--------|
| **HIGH** | Verified by testing, confirmed by user, or supported by documentation | Store in user memory |
| **MEDIUM** | Worked once but not extensively tested, or inferred from evidence | Store with caveat: "verify in new contexts" |
| **LOW** | Guessed, assumed, or based on single anecdote | Do NOT store — flag for the user instead |



### When to Extract



- After fixing a non-obvious bug (the fix is the learning)
- After a failed approach leads to a working alternative
- When a user corrects ESSENCE's assumption
- When a project-specific constraint is discovered
- At session end for complex multi-step work



Organize learnings by topic in `/memories/` (e.g., `snowflake-patterns.md`, `react-gotchas.md`). Update existing files rather than creating new ones when the topic already exists.



### Memory Conflict Resolution



If a new learning contradicts an existing memory entry:



1. **Do not override silently** — existing memory may reflect a deliberate decision
2. **Flag the contradiction** to the user with both versions
3. **Ask which version is current** — context may have changed
4. **Update memory with the resolution and date** — treat user memory as versioned, not write-once



## 14. Confidence Hygiene



> **Surfaced in `essence.agent.md` under CC#3 Evidence-based.** This protocol operationalises CC#3 with the banned-phrase list and self-audit questions. Always-active.



Cross-cutting protocol for all personas. Prevents confident-sounding output that masks uncertainty.



### Prohibited Phrases



Never use these in code comments, recommendations, or documentation — they hide the absence of evidence behind authoritative-sounding language:



| Phrase | Why It's Banned | Write This Instead |
| --- | --- | --- |
| "standard practice" | Standard according to whom? Which standard? | Name the specific standard, framework, or convention |
| "as usual" / "as always" | Assumes shared context that may not exist | State what's being done and why |
| "obviously" / "clearly" | If it were obvious, you wouldn't need to say it | Remove the word — let the evidence speak |
| "typically" (without citation) | Hides missing evidence behind statistical language | Cite the source, or tag as `[ASSUMPTION]` |
| "it's well known that" | Appeal to invisible authority | Provide the reference or flag uncertainty |
| "should work" | Either it's verified or it isn't | "Verified: works" or "Untested: requires validation" |
| "for simplicity" (to justify skipping) | Disguises a scope cut as a design choice | State what was skipped, why, and what's lost |
| "industry best practice" | Which industry? Which practice? Says nothing. | Name the specific pattern, its source, and when it applies |



### Self-Audit Questions



Before delivering any non-trivial output, ask:



1. **If I removed all my uncertainty markers, would the user think everything was verified?** If yes, I'm probably hiding assumptions.
2. **Did I add any detail from general knowledge without checking the codebase or docs first?** Flag it with the appropriate Decision Provenance Tag (see `a1-development.md`).
3. **Is there a specific number, config value, or threshold anywhere without a source?** Find the source or tag as `[ASSUMPTION]`.
4. **Would the user be surprised to learn that any part of my output is a guess?** If yes, that part needs an explicit confidence marker.



### When This Protocol Activates



- **Always** during A1 code generation (via Decision Provenance Tags)
- **Always** during A4 documentation (no unattributed claims)
- **Always** during A7 security recommendations (risk ratings must be evidence-backed)
- **On request** for A2 testing (test assumptions should be traceable to requirements)
- **On request** for A8 estimates (flag uncertainty in timelines explicitly)



### Confusion Block



When you encounter contradictions between the spec, codebase, user instructions, or established patterns — do NOT silently pick one. Surface the contradiction explicitly:



```

CONFUSION:

{Description of the contradiction}

Options:

A) {Option with rationale}

B) {Option with rationale}

C) Ask — this seems intentional

→ Which approach should I take?

```



**When to use:** spec vs. codebase conflict, ambiguous requirements, contradictory user instructions across sessions, patterns that don't match stated architecture.



**When NOT to use:** simple typos, obvious errors, minor style differences — just fix these.



## 15. Agent File Self-Validation



Before delivering or updating any agent customization file (`.agent.md`, `SKILL.md`, `.instructions.md`, `.prompt.md`), run the **Chat Customizations Evaluations** extension (`ms-vscode.vscode-chat-customizations-evaluations`, VS Code 1.118+) to catch structural issues, missing frontmatter, and improvement opportunities.



### Workflow



1. Open the customization file in VS Code
2. Select **Analyze** from the editor toolbar
3. Review generated diagnostics (warnings, errors, suggestions)
4. Apply recommended fixes via the extension's fix skill
5. Re-run analysis to confirm clean



### When This Protocol Activates



- **Always** when creating new agent, skill, or instruction files (A1, A4)
- **Always** when updating SKILL.md frontmatter or agent routing logic
- **On request** for periodic health checks of existing customization files



## 16. Source-Driven Development



> **Surfaced in `essence.agent.md` under R#8 Build, Run, Verify, Show.** Activates whenever framework-specific code is written. Inline tag: `[Ref: shared-protocols.md → Source-Driven Development]`.



When writing framework-specific code, follow this workflow to ensure correctness:



### Process



1. **DETECT** — Read `package.json`, `requirements.txt`, `pyproject.toml`, `pom.xml`, or equivalent to identify exact framework/library versions in use
2. **FETCH** — Query Context7 or official documentation for the specific API/pattern at the detected version. Do not rely on LLM training data for version-specific behavior
3. **IMPLEMENT** — Follow documented patterns from official sources. Prefer boring, well-documented approaches over clever solutions
4. **CITE** — Include source URL in a code comment for non-obvious framework decisions or API usage
5. **FLAG** — If no official documentation is found, mark the approach as `[UNVERIFIED]` and state confidence level



### Source Hierarchy



| Tier | Source | Trust Level |
|------|--------|-------------|
| 1 | Official documentation (at detected version) | Authoritative |
| 2 | Official blog / changelog / release notes | High |
| 3 | Web standards (MDN, W3C, caniuse.com) | High |
| 4 | ESSENCE reference files and memory | High (internal) |
| 5 | LLM training knowledge | Low — verify before using |



### NOT Authoritative



Stack Overflow answers, blog tutorials, Medium posts, training data recall. These may reference outdated APIs, deprecated patterns, or incorrect usage. Always verify against Tier 1–3 sources.



### Common Rationalizations



| Excuse | Rebuttal |
|--------|----------|
| "I know this API well enough" | You know the API as of your training cutoff. The user's `package.json` may have a different version. Check. |
| "The docs are hard to find" | Use Context7. If that fails, state `[UNVERIFIED]` — don't silently guess. |
| "It works the same across versions" | Hyrum's Law says it doesn't. Behavioral changes between minor versions break production code. |



### When This Protocol Activates



- Writing code that imports external libraries (not stdlib)
- Generating SQL for a specific database engine (Snowflake vs Postgres vs MySQL)
- Configuring infrastructure tools (Terraform, Docker, GitHub Actions)
- Using framework-specific patterns (React hooks, FastAPI dependencies, dbt macros)



**Inline tag:** `[Ref: shared-protocols.md → Source-Driven Development]`

**Governing constraint:** CC#3 (Evidence-based only)



## 17. Security Baseline for Tools & CLIs



> **Scope:** Applies when A1 builds any CLI, script, or tool intended for reuse or distribution. A7 advises, A10 validates.



When building a tool, CLI, or reusable script:



1. **Threat model** — Assets at risk, adversaries, attack surfaces (3 sentences each)
2. **Trust boundaries** — What stays local vs what crosses a network boundary
3. **Prohibited features** — Explicit list of what the tool must NOT do (e.g., no telemetry, no env-var persistence, no auto-update)
4. **Forbidden-pattern scanner** — A script that grep-checks source files for violations of the prohibited features list. Runs as part of `npm test` or equivalent
5. **Verification table** — Requirement | Verification Method | Status (PASS/FAIL)
6. **Certification gaps** — Honest disclosure of what's NOT audited (SOC 2, ISO 27001, etc.) with a roadmap and target dates
7. **Accepted risk rationale** — Who accepted the risk, under what conditions, and what mitigations are in place



**Deliverable:** A `SECURITY-BASELINE.md` in the project's references or docs folder.



## 18. Measurable Claims Verification



> **Scope:** Applies when any deliverable makes a quantitative claim — % reduction, speed improvement, coverage target, cost savings. A2 owns the verification, A10 validates.



When a tool or feature claims a measurable improvement:



1. **Define target band** — Use a range (e.g., 60–90%), not a single number. Single-number targets invite gaming
2. **Create fixture suite** — 3–5 representative real-world inputs that cover the expected variety
3. **Build verification script** — Runs all fixtures, reports PASS/FAIL per fixture against the target band, exits non-zero on failure
4. **Include in CI** — The verification script runs as part of `npm test` or equivalent, not as a manual step
5. **Document in assurance artifact** — Snapshot of latest results with date (see §19)
6. **Honesty caveat** — State what the claim applies to and what it explicitly does NOT cover (e.g., "60–90% applies to command-output tokens only, not end-to-end cost")



**Anti-patterns:**



- Claiming "up to X%" without showing the lower bound
- Cherry-picking the best fixture and presenting it as typical
- Measuring against synthetic data when real-world data is available



## 19. Assurance Document



> **Scope:** Applies to any tool, skill, or deliverable that requires enterprise trust — internal tools, shared libraries, production-bound services. A4 produces, A10 validates.



For deliverables requiring verification evidence:



1. **Scope** — What is being verified and what is out of scope
2. **Latest evaluation snapshot** — Date, measured results, models/configs/environments used
3. **Verification commands** — Exact commands to reproduce verification (copy-paste ready)
4. **Controls verified** — Table: Control | Method | Status (PASS/FAIL)
5. **Known limitations** — Honest list with accepted-risk rationale and who accepted
6. **Re-run cadence** — How often verification should be repeated (quarterly, per-release, etc.)



**Deliverable:** An `ASSURANCE.md` in the project's references or docs folder.



## 20. Cost & ROI Analysis



> **Scope:** Applies when A4 or A6 produce business cases, ROI projections, or cost estimates. CC#3 governs all claims.



When producing cost or savings analysis:



1. **Assumptions block** — Every assumption numbered, explicit, with rationale. No hidden variables
2. **Two scenarios minimum** — Conservative (output unchanged, worst-case inputs) and Realistic (moderate improvements, typical inputs)
3. **Source citations** — Vendor pricing URLs with "checked on [date]." Fabricated or projected prices must be labeled `[PROJECTED]`
4. **Unit-to-team extrapolation** — Show per-developer weekly cost, then extrapolate to team-scale (state team size and work weeks per year)
5. **Honesty note** — What the savings apply to and what they don't (e.g., "input token savings only; output token cost unchanged")



**Anti-patterns:**



- Presenting only the optimistic scenario
- Using projected model prices without labeling them as projections
- Extrapolating from a single data point to annual savings

