---
file: a1-git-workflow.md
persona: A1 Git Workflow
version: 2.8.0
last_updated: 2026-07-20
changelog: 2.7.1
---

# A1 — Git Workflow & Conventions

> Load this file when setting up version control conventions for a project, configuring commit hooks, establishing branching strategy, or creating PR templates. Applies to all projects using Git.

## When to Load This File

- User says "Git workflow", "branching strategy", "commit convention", "PR template"
- Setting up a new repository or onboarding developers
- Configuring CI/CD pipeline triggers (which branches, which commit types)
- Disputes about merge strategy or branch naming

---

## §1 Branching Strategy — Trunk-Based Development

### Core Rules

```
branchRules[5]{rule,detail}:
Single trunk,all development targets `main` — no long-lived `develop` or `staging` branches
Short-lived feature branches,max 2 days lifespan / max 1 developer (or pair)
Merge direction,trunk → feature (to update) then feature → trunk (to close) — never feature → feature
Delete after merge,branch ceases to exist once merged to trunk
Feature flags for WIP,incomplete features deploy behind flags — trunk is always releasable
```

### When to Use What

```
branchDecision[4]{teamSize,model,notes}:
1-3 devs,commit direct to trunk,simplest — use pre-push CI hooks
4-15 devs,short-lived feature branches + PRs,standard TBD — PR for code review
16+ devs,scaled TBD + merge queues,add CI verification before merge
Any size + release cadence,release branches (cut from trunk),just-in-time — "harden" then delete after release
```

### Branch Naming

> **Platform constraint:** Many CI/CD platforms (e.g., Cloudflare Pages, Vercel) use the branch name to generate preview URLs as DNS subdomain labels. DNS labels cannot contain slashes (`/`), underscores (`_`), or leading/trailing hyphens. **Always check the target repo's CI pipeline for branch name rules before pushing.**

**Default format** (when repo has no special restrictions):

```
{type}/{ticket-id}-{short-description}

feat/JIRA-123-order-export
fix/JIRA-456-null-price-crash
chore/JIRA-789-upgrade-react
```

**Flat format** (when repo CI requires DNS-safe names — no slashes, no underscores, alphanumeric + hyphens only):

```
{type}-{ticket-id}-{short-description}

feat-JIRA-123-order-export
fix-JIRA-456-null-price-crash
chore-JIRA-789-upgrade-react
```

**Detection:** Before creating a branch, check if the repo uses `check-branch-name` actions, Cloudflare preview deployments, or Vercel preview builds. If yes, use the flat format. When in doubt, use the flat format — it's universally compatible.

---

## §2 Commit Messages — Conventional Commits

### Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

```
commitTypes[10]{type,semver,description}:
feat,MINOR,new feature visible to users
fix,PATCH,bug fix
docs,—,documentation only
style,—,formatting / whitespace (no logic change)
refactor,—,code restructuring (no behavior change)
perf,—,performance improvement
test,—,adding or fixing tests
build,—,build system or dependency changes
ci,—,CI configuration changes
chore,—,maintenance tasks (no src or test change)
revert,—,reverts a previous commit — body lists reverted SHA(s) via `Refs:` footer
```

> **Revert convention:** use `revert:` as the type and reference the reverted commit(s) in a footer — `Refs: 676104e, a215868`. Lets changelog tooling pair the revert with what it undid.

_Sources: [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) — types, breaking-change syntax, revert recommendation._

### Breaking Changes

- Append `!` after type: `feat!: remove legacy auth endpoint`
- OR add footer: `BREAKING CHANGE: session tokens now expire after 1 hour`
- Maps to MAJOR version bump

### Enforcement

- **commitlint** + **husky** — reject non-conforming commits at pre-commit hook
- **Config:** `@commitlint/config-conventional` (based on Angular convention)
- CI pipeline also validates commit format on PR

---

## §3 Pull Request Guidelines

### PR Size

```
prSize[3]{size,lines,guidance}:
Small (preferred),< 200 lines changed,review in < 30 minutes — merge same day
Medium,200-500 lines,break into smaller if possible — max 1 day to review
Large (avoid),> 500 lines,almost always should be split — requires explicit justification
```

### PR Template

```markdown
## What

{One-line summary of the change}

## Why

{Link to Jira ticket or brief context}

## How

{Key technical decisions — what approach was chosen and why}

## Testing

- [ ] Unit tests added/updated
- [ ] Manual testing completed (describe steps)
- [ ] No regressions in existing tests
- [ ] `py tools/drift_lint.py` passes (0 FAIL)

## Screenshots (if UI change)

{Before/after screenshots}
```

### Review Rules

1. **At least 1 approval** required before merge
2. **CI must pass** — all checks green
3. **No self-merge** except for trivial fixes (typos, config)
4. **Review within 24 hours** — stale PRs become merge conflicts
5. **drift-lint must pass** — `py tools/drift_lint.py` exits 0 (no SSOT count, version, or mojibake drift)

---

## §4 Merge Strategy

### Decision Tree

```
Is the PR a single logical change (1-3 commits)?
├── YES → Squash and merge (clean linear history)
└── NO → Is the commit history meaningful and clean?
    ├── YES → Rebase and merge (preserves individual commits)
    └── NO → Squash and merge (hide messy WIP commits)
```

### Rules

- **Default to squash merge** — keeps trunk history clean
- **Rebase for multi-step migrations** where each commit is a reviewable step
- **Never regular merge** unless maintaining fork sync (creates merge commits)
- **Delete source branch** automatically after merge (GitHub setting)

---

## §4b Secrets Hygiene

```
secretsRules[4]{rule,detail}:
Never commit secrets,no `.env`, API keys, tokens, private keys, connection strings — add them to `.gitignore` before the first commit
Scan before commit,pre-commit hook with `detect-secrets` (Yelp) or `git-secrets` (AWS) blocks credential patterns
Commit `.env.example` not `.env`,share the *shape* (key names, dummy values) — never real values
Leaked = rotate, not delete,git history retains deleted secrets forever — a leaked credential is compromised; rotate/revoke it, don't just `git rm`
```

> **Why "rotate, not delete":** once a secret is pushed, assume it's harvested. Removing it in a later commit leaves it in history (and on every clone/fork). The only safe response is to invalidate the credential at its source.

---

## §5 CI Gate Requirements

Minimum checks before a PR can merge:

```
ciGates[6]{gate,blocks_merge,notes}:
Build passes,YES,compile + typecheck (tsc --noEmit)
Unit tests pass,YES,with coverage threshold (e.g. 80%)
Lint passes,YES,ESLint/Ruff/Flake8 — zero warnings in changed files
Commit format valid,YES,commitlint checks conventional format
Security scan,YES,npm audit / Snyk / Dependabot — no HIGH/CRITICAL
E2E tests (if applicable),NO (advisory),run nightly or on release branches — too slow for every PR
```

---

## §6 Release Tagging

### Semantic Versioning

```
MAJOR.MINOR.PATCH

1.0.0 → 1.0.1 (fix)
1.0.1 → 1.1.0 (feat)
1.1.0 → 2.0.0 (BREAKING CHANGE)
```

### Automation

- Use **standard-version** or **semantic-release** to auto-bump version from commit types
- Auto-generate CHANGELOG.md from conventional commits
- Tag releases in Git: `v1.2.3`
- CI triggers deployment from tags (not branches)

> **`v1.2.3` is the tag name, not the version.** The semantic version is `1.2.3`; the `v` prefix is an English convention for git tags. Tooling that parses SemVer strips it.

_Sources: [Semantic Versioning 2.0.0](https://semver.org/) — increment rules, deprecation → MINOR, `v` prefix note. [Trunk-Based Development](https://trunkbaseddevelopment.com/) (Hammant) — §1 branching model._

---

## §7 Destructive Operations & Recovery

Git can lose committed work irreversibly. These operations are **CC#1 halt-triggers** — never run silently; surface impact, offer the safer alternative, confirm, then act.

```
destructiveOps[6]{operation,risk,safer_alternative}:
git push --force,clobbers teammates' commits on the remote — work is gone,git push --force-with-lease (+ --force-if-includes) — refuses if remote moved since your last fetch
git reset --hard <ref>,discards working tree + commits ahead of <ref>,git revert <ref> (new commit, preserves history) OR git reset --keep (refuses if it would lose local changes)
git rebase / history rewrite on shared branch,everyone who pulled now has divergent history — merge hell,never rewrite published history; branch from the point and cherry-pick forward instead
git clean -fd,deletes untracked files (incl. unstaged new work) with no recovery,git clean -nd first (dry run) — inspect, then delete only what you confirm
git branch -D <branch>,force-deletes an unmerged branch — commits may become unreachable,git branch -d (lowercase) — refuses if unmerged; verify it's merged or tagged first
git checkout/switch -- <file>,overwrites local file edits with no undo,git stash first — recoverable, then discard the stash if truly unwanted
```

### Recovery First Aid

- **`git reflog`** is the safety net — it records where HEAD pointed for ~90 days. A "lost" commit after a bad reset/rebase is usually recoverable: `git reflog` → find the SHA → `git reset --hard <sha>` (or `git cherry-pick <sha>`).
- **Force-push is recoverable too** if the overwritten commit's SHA is known (reflog on the machine that had it, or CI logs) — push it back before `git gc` prunes it.
- **`--force-with-lease` ≠ bulletproof:** a background `git fetch` (IDE auto-fetch, cron) updates the remote-tracking ref and defeats the lease. Pair with `--force-if-includes`, or fetch-then-push deliberately.

_Sources: [git-push](https://git-scm.com/docs/git-push) — `--force` "is a method reserved for a case where you do mean to lose history"; `--force-with-lease` / `--force-if-includes` semantics._

---

## §8 Run Isolation via Worktrees (Autonomous / Loop Execution)

When a run is triggered by something other than an interactive user turn — a scheduled loop, a subagent delegated via R#6, or any autonomy tier above L1-report — it must not execute in the same working directory as any other in-flight run. Two runs sharing one working tree can stomp each other's uncommitted edits, checkout different branches out from under each other, or race on the same files.

### Pattern

```powershell
# On run start — before R#6 delegates work into it
git worktree add ../essence-runs/run-<run-id> -b essence/run-<run-id> HEAD

# All work for this run (build, test, edits) happens ONLY inside that path

# On completion — open PR from essence/run-<run-id>, then reclaim disk
git worktree remove ../essence-runs/run-<run-id>
```

### Rules

```
worktreeRules[5]{rule,detail}:
One worktree per run-id,never share a working tree across two concurrently active runs — scheduled loops (e.g. CI Sweeper + Dependency Sweeper) can and do overlap
Branch-per-worktree,branch name embeds the run-id (essence/run-<run-id>) so the PR traces back to exactly one isolated execution
Registry to prevent double-claim,track active run-id → worktree path in /memories/repo/ (or a state file) before creating one — a second loop must skip or queue, not collide
Removal is a CC#1 op,git worktree remove on a path with uncommitted/unpushed work is a destructive delete — halt, show what would be lost, offer git worktree remove --force only after explicit confirmation, or stash-and-preserve first
Stale worktrees expire,a run that dies without cleanup leaves an orphaned worktree — reconcile via git worktree list against the run registry and prune (git worktree prune) periodically, not silently
```

### Where This Hooks Into ESSENCE

- **R#6 (Delegate)** — before spawning a subagent for an isolated/autonomous sub-task, create the worktree first; scope the subagent's working directory to it.
- **R#8 (Build/Run/Verify)** — tests and builds for that run execute inside the worktree, not on the main checkout.
- **CC#1** — worktree/branch removal after merge or rejection follows the same halt → impact → safer-alt → confirm → rollback sequence as any other destructive op.

---

## Common Rationalizations

```
rationalizations[5]{excuse,reality}:
"Just force-push, it's faster",--force-with-lease is the same speed and refuses to clobber — there is no reason to use bare --force on a shared branch
"Squash everything, history is noise",squash hides reviewable migration steps; rebase-merge when each commit is a meaningful step (see §4 decision tree)
"I'll fix the commit message later",commitlint blocks it now for a reason — a clean history is cheapest to keep clean at commit time, not after merge
"It's a tiny change, skip the PR",trivial != safe; the PR runs CI + drift-lint. Self-merge only for typos/config per §3 rule 3
"The branch name doesn't matter",many CI platforms derive preview-URL DNS labels from it — slashes/underscores break the deploy (see §1 Branch Naming)
```

## Red Flags — Stop and Reconsider

```
redFlags[7]{signal,why}:
--force / reset --hard / clean -fd typed without a dry-run,CC#1 destructive op — confirm impact + offer safer alt (§7) before running
PR > 500 lines,almost always should be split — review quality collapses past this size (§3)
Secret or credential in the diff,§4b violation — rotate the secret, scrub the staged change, add to .gitignore
Long-lived develop/feature branch (> 2 days),violates trunk-based model — merge or rebase onto trunk now to avoid merge hell
Merge with red CI,§5 gate — never merge on failing build/test/lint/security
Rewriting history on a branch others have pulled,§7 — branch-and-cherry-pick instead; never rewrite published history
Two autonomous/scheduled runs share one working tree,§8 — isolate each run in its own git worktree; concurrent loops will race on the same files otherwise
```
