---
file: RELEASE-CHECKLIST.md
persona: cross
version: 2.8.0
last_updated: 2026-08-11
---

# ESSENCE Release Checklist

> Durable home for the release procedure. Seeded during the 2026-08 remediation
> (Phase 5.2/8); expanded to the full vNEXT procedure in Phase 8 step 0.

## One-time setup (per machine / per clone)

Git hooks are not copied by `git clone` — install the pre-commit gate once:

```powershell
copy tools\hooks\pre-commit .git\hooks\pre-commit
```

```bash
cp tools/hooks/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

The hook runs `tools/release_check.ps1` (drift_lint.py + measure-tokens.py) only
when a commit touches `agent/`, `references/`, `SKILL.md`, `skill.json`, or
`docs/ARCHITECTURE.md`.

## Manual gate (any time)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\release_check.ps1
```

```bash
bash tools/release_check.sh
```

Both must exit 0 before a release.

## Sync deployed telemetry

```powershell
py infrastructure\telemetry\setup.py --sync
```

## Regenerate derived docs

```powershell
py tools\render_docs.py
```

## Release a new version (vNEXT)

Run only when the manual gate above is green. Execute in this exact order — do not bump
version stamps piecemeal across phases; all stamps move in one pass, right before tagging.

1. **Version bump — one pass, all stamps.** Set the new version in: `skill.json` (`version`),
   `SKILL.md` frontmatter, `agent/essence.agent.md` frontmatter **and** its Non-Negotiable #1
   "currently `vX.Y.Z`" literal **and** the header-example sentence, `agent/essence.playbook.md`
   (header-example sentence — it carries no frontmatter `version:` of its own), the `version:`
   frontmatter of all 21 `references/*.md`, the response-header version in
   `examples/a6-order-management.md`, and `docs/ARCHITECTURE.md`'s title/table stamps. Leave
   each reference's `changelog:`/`last_updated:` untouched unless that file's *content* (not
   just its version stamp) genuinely changed this release — bump those two fields only for
   files with a real diff.
2. **CHANGELOG entry.** Add `## [X.Y.Z] - <date>` above the previous head entry, itemized as
   Added / Changed / Fixed / Removed-Moved. Include a one-line semver rationale note if the
   release is a minor or major bump under the policy above.
3. **Regenerate derived views.** `py tools/render_docs.py` → both HTML files; update
   `docs/ARCHITECTURE.md`'s "Last verified" line to the release date; refresh the §10 file
   inventory if the file set changed.
4. **KNOWN-ISSUES pass.** Mark any items this release resolved as `Fixed in X.Y.Z (<date>)`;
   add rows for any new issues found and fixed during the release itself.
5. **Gates green.** Re-run `tools/release_check.ps1` (or `.sh`) — must exit 0 (drift_lint 0
   FAIL, measure-tokens 0 FAIL against the post-release claims). A failure here is a
   stop-the-line event, not a warning.
6. **Commit + tag.** `git add` the changed files explicitly (never `git add -A` — the workspace
   can carry untracked WIP), `git commit`, then `git tag vX.Y.Z`.
7. **Sync + hand-sync.** `py infrastructure/telemetry/setup.py --sync` if the telemetry stack
   changed; then hand-sync any installed copies (`~/.claude/skills/…`, `~/.copilot/agents/…`,
   or other forks) — these are outside `npx skills update`'s management and drift silently
   otherwise. Confirm with the user before touching locations outside this workspace.

*(This procedure was first written during the 2026-08 remediation and used to ship v2.8.0 —
see `CHANGELOG.md` for what that release actually contained.)*
