# ADR 0003 — Self-update via authenticated `gh api` against a private marketplace repo

- **Status:** Accepted (amended 2026-08-06)
- **Date:** 2026-07-16 (v2.7.0)
- **Deciders:** ESSENCE maintainers
- **Context source:** v2.7.0/v2.7.2 CHANGELOG entries; KNOWN-ISSUES.md "Fixed in 2.7.2" record.

## Context

ESSENCE ships from the `pfizer-fit/skills-oneweb` marketplace and is installed via the
`skills` CLI (`npx skills add ...`). A skill has no background process, so any
version-notification mechanism must be agent-driven: piggyback on a session-start
check, compare the installed `skill.json` version against the published one, and
surface a footer notice if the installed copy is behind.

The obvious implementation — an unauthenticated `GET` against
`raw.githubusercontent.com/pfizer-fit/skills-oneweb/main/skills/essence-dev-team/skill.json`
— was shipped in v2.7.0 and v2.7.1. It never worked: `pfizer-fit/skills-oneweb` is a
**private** repository, and an unauthenticated raw-URL fetch 404s for every user
regardless of their actual access. Versions 2.7.0 and 2.7.1 could therefore never
detect an update; the check silently degraded to a no-op that never fired, which is
worse than an absent feature because it advertises version-notification without
providing it.

## Decision

1. **Query the manifest via authenticated `gh api`**, not a raw-URL fetch:
   `gh api repos/pfizer-fit/skills-oneweb/contents/skills/essence-dev-team/skill.json`,
   base64-decoding `.content` to read the `version` field. This works against a
   private repo because `gh` carries the invoking user's own GitHub authentication.
2. **Treat the fetched manifest as untrusted data [CC#7]** — parse only the semver
   `version` field, execute nothing from it.
3. **Degrade to "unknown", never to a false "up to date."** If `gh` is missing or not
   logged in, report the check as unknown and continue — a failed check must never
   silently claim currency it hasn't verified, and must never block the session.
4. **Keep detection and upgrade on separate trust boundaries.** Detection is automatic
   (throttled ≤1/24h, gated to workspace-grounded turns per Non-Negotiable #3);
   the upgrade itself only runs on an explicit "update ESSENCE" request, backs up the
   active install first ([CC#1]), and warns that hand-synced copies (global agents,
   `.github/agents` forks) are outside the `skills` CLI's management and need manual
   re-sync.

## Consequences

- **Positive:** Version-notification actually works for any user with `gh`
  authenticated against the org (the common case for a Pfizer-internal skill);
  the untrusted-data framing keeps a compromised or malformed manifest from being
  treated as instructions; degrading to "unknown" rather than a false negative avoids
  training users to distrust the notice.
- **Negative / cost:** The check now has an external dependency (`gh` CLI, and being
  logged in) that a raw-URL fetch wouldn't have needed on a *public* repo — but the
  repo is private, so that alternative was never actually viable, only apparently
  simpler.
- **Root cause note:** This is the second time a broken check shipped silently for
  two releases before being caught (drift-lint only verifies that version *stamps*
  agree with each other, not that a version's claimed feature set actually works) —
  see the parallel finding in the 2026-08 remediation plan (drift-lint check 5.3g
  approximates changelog/content parity for exactly this class of gap, though it
  cannot substitute for functional testing of a feature the CHANGELOG claims).

## Revisit when

`pfizer-fit/skills-oneweb` ever becomes a public repository (the raw-URL approach would
then work and drop the `gh` CLI dependency), or the marketplace platform exposes a
proper versions/manifest API that doesn't require a full repo-contents fetch.
