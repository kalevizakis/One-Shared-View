# ADR 0001 — ESSENCE as a prompt-layer skill on top of the agent loop

- **Status:** Accepted (amended 2026-07-05)
- **Date:** 2026-06-16
- **Deciders:** ESSENCE maintainers
- **Context source:** [Claude Code — How the agent loop works](https://code.claude.com/docs/en/agent-sdk/agent-loop); amendment source: [Claude — Getting started with loops](https://claude.com/blog/getting-started-with-loops)

## Context

Claude Code (and the Agent SDK) runs an **agent loop**, not a one-shot prompt: each
turn the model evaluates current state → may call tools → results feed back → repeat
until it emits text with no tool calls. Context accumulates across turns (never
resets) and the *host* controls termination via mechanical knobs: `max_turns`,
`max_budget_usd`, `effort`, `permission_mode`, and `PreToolUse`/`PostToolUse` hooks.

ESSENCE ships today as a **system-prompt-layer artifact** (skill file + agent mode)
that runs *inside* someone else's loop — VS Code Copilot's loop, or Claude Code's.
The question: does ESSENCE's design cooperate with the loop, and which loop
mechanisms (if any) should it adopt?

## Decision

1. **Keep ESSENCE as a portable prompt-layer skill.** Do not couple its vocabulary
   or structure to one SDK's loop model (`SystemMessage`/`ResultMessage`, subtypes,
   streaming). Portability across hosts (Copilot, Claude Code, future) is ESSENCE's
   leverage; SDK message plumbing is integration-layer concern, out of scope.

2. **Treat the loop doc as confirmation of existing cost rules.** R#6 (read-budget /
   subagent delegation), R#12 (turn-8 context-cost hints), and the skill-file-over-
   pinned-prompt design all target the doc's "context accumulates across turns" and
   "large tool outputs consume context" mechanisms. Validated — retain as-is.

3. **Record three prose→mechanism upgrades as a roadmap, contingent on SDK
   packaging.** These cannot be enforced from a system prompt; they become real only
   if ESSENCE is ever packaged via the Agent SDK:
   - **Budget caps:** R#12 + cost-tip footers are *advisory*. SDK `max_turns` /
     `max_budget_usd` are *enforced* with typed stop subtypes. Add a prose emulation
     now ("at turn N / est. $X, HALT and require ack"); wire to real caps if packaged.
   - **Effort selection:** R#1's REASONING-HEAVY vs EXECUTION-HEAVY classifier
     currently *suggests* a lighter model. SDK `effort` makes it a real per-call /
     per-subagent knob. Classifier is the right input; rewire to set, not suggest.
   - **Guards as hooks:** CC#1 (destructive halt), CC#2 (routing), CC#7 (prompt
     injection) are enforced by prose compliance. SDK `PreToolUse` hooks block the
     tool call mechanically, in-process, outside the context window — strictly
     stronger. Re-express these guards as hooks if/when packaged.

## Consequences

- **Positive:** ESSENCE's existing cost-conscious rules gain external validation; the
  design stays host-portable; the SDK-packaging upgrade path is documented before the
  question is forced.
- **Negative / cost:** The three guarantees (budget, effort, pre-tool guards) remain
  *best-effort prose* until/unless ESSENCE is SDK-packaged. Users relying on CC#1 get
  a diligent agent, not a mechanical block.
- **Non-goal:** Importing SDK message-type machinery or loop vocabulary into ESSENCE
  docs. Explicitly rejected as over-engineering for a prompt-layer skill.

## Revisit when

ESSENCE is proposed for Agent-SDK packaging, OR a host exposes budget/effort/hook
controls a skill can set declaratively. At that point, promote roadmap item 3 from
prose to mechanism and supersede this ADR.

---

## Amendment (2026-07-05) — Loop taxonomy alignment

### Context

The Claude Code team published a follow-up taxonomy categorizing agentic loops into
four types by trigger / stop-criteria / primitive / best-fit task:

| Type | Trigger | Stop criteria | Claude Code primitive |
|------|---------|---------------|------------------------|
| Turn-based | User prompt | Model judges done, or needs more context | (none — the base agent loop itself) |
| Goal-based | Manual prompt | Goal met OR max turns reached | `/goal` |
| Time-based | Time interval | User cancels, or work completes | `/loop`, `/schedule` |
| Proactive | Event/schedule, no human in the loop | Each task exits on its own goal; routine runs until disabled | `/schedule` + `/goal` + dynamic workflows + auto mode |

This taxonomy is a refinement of the same "agent loop" concept ADR 0001 already
addressed — not a new mechanism. It does not change the original decision. It adds
a structured way to classify *where* ESSENCE's existing rules already behave like a
loop, and *where* a loop type has no analog in ESSENCE's actual host.

### Decision

**Extend, don't import.** The four-type taxonomy is a useful classification lens.
`/goal`, `/loop`, and `/schedule` are Claude Code CLI slash commands — they do not
exist in VS Code Copilot Chat (ESSENCE's primary host) or GitHub Copilot's other
surfaces. Per the original decision ("do not couple ESSENCE's vocabulary or
structure to one SDK's loop model"), ESSENCE does not add these as invokable
commands. Instead, each type is mapped to what already exists or is explicitly
logged as a host-dependent non-goal:

1. **Turn-based — already implemented, no change.** R#2 (Generator/Critic 4-phase:
   Critique → Adversarial → Refine → Evaluate) and R#8 (Build/Run/Verify/Show,
   including Stop-the-Line) together *are* ESSENCE's turn-based loop. This is the
   one type with a 1:1 host-native equivalent — every ESSENCE response already runs
   it. No action needed.

2. **Goal-based — partial equivalent, formalize the missing piece.** R#8's
   Stop-the-Line (Preserve → Diagnose → Fix → Guard → Resume) already iterates
   until a fix is verified, but it has no explicit "define done + cap attempts"
   contract — ESSENCE decides internally when to stop rather than the user setting
   a threshold up front. **Action:** R#8 gains an explicit **goal-contract pattern**:
   when a user gives a verifiable exit criterion (e.g. "get lint to zero errors,
   stop after 5 tries" / "make all tests pass, max 3 attempts"), ESSENCE states the
   criterion and the cap back before iterating, and self-reports remaining attempts
   each cycle instead of silently deciding "good enough." This is prose discipline,
   not a new command — it uses R#8's existing Stop-the-Line loop with an explicit
   stopping contract layered on top. `chat.agent.maxRequests` (a global VS Code
   setting) is a blunt ceiling on total tool calls, not a per-goal contract — it is
   NOT an equivalent to `/goal` and should not be presented as one.

3. **Time-based — no host analog today; logged as roadmap, not built.**
   VS Code Copilot Chat has no built-in scheduler; ESSENCE only runs when a user
   opens a turn. The closest real mechanisms are external to ESSENCE itself: GitHub
   Actions on a cron trigger, or VS Code's documented (but unverified by us — flagged
   per CC#3, not confirmed hands-on) "background agents" / "cloud agents" surfaces,
   which can reuse a `.agent.md` custom agent definition. **Decision: do not build
   this.** Recurring/scheduled invocation is an infrastructure-layer concern (A5's
   domain if it's ever scoped), not something a system-prompt skill can create for
   itself. No file changes.

4. **Proactive — no host analog; explicitly rejected as current scope.** This type
   composes schedule + goal + multi-agent orchestration with no human in the loop.
   ESSENCE's R#6 (delegate to `runSubagent`/`Explore`) already covers the
   "orchestrate multiple agents" piece for a single turn, but proactive loops need
   an external trigger and unattended execution across turns — outside what a
   prompt-layer skill running inside someone else's chat session can do. **Decision:
   explicit non-goal**, consistent with the original ADR's stance against importing
   SDK-loop machinery. If ESSENCE is ever packaged for a host with native scheduling
   (Agent SDK, GitHub Copilot coding agent scheduled tasks, etc.), this section is
   the trigger to revisit — see updated *Revisit when* below.

### Consequences

- **Positive:** Closes the loop (no pun intended) on where ESSENCE's rules already
  satisfy the industry taxonomy — R#2/R#8 turn-based coverage is now explicit and
  citable. The goal-contract addition to R#8 is a small, concrete prose improvement
  with immediate value in any host.
- **Negative / cost:** Time-based and proactive loops remain unaddressed by design.
  Users asking ESSENCE to "run every hour" or "watch for new PRs and fix them" will
  get an honest "not supported in this host" rather than a simulated approximation.
- **Non-goal (reaffirmed):** No `/goal`, `/loop`, `/schedule`-style commands added
  to ESSENCE. No claim that `chat.agent.maxRequests` or any other VS Code setting
  is an equivalent primitive without hands-on verification.

## Revisit when (updated)

ESSENCE is proposed for Agent-SDK packaging, OR a host exposes budget/effort/hook
controls a skill can set declaratively (original trigger) — **OR** GitHub Copilot /
VS Code ships a verified, documented scheduling or unattended-execution primitive
(cloud agents, coding agent scheduled tasks, or equivalent) that a custom agent
definition can register against. At that point, promote the Time-based and
Proactive sections from non-goal to mechanism and supersede this ADR.
