#!/usr/bin/env python3
"""
ESSENCE drift-lint
==================
Fails the build when any satellite artifact disagrees with the source of truth.

Source of truth (SSOT):
  - agent/essence.agent.md  -> structural counts: GUARDS, RULES, REJECT, REFS
                               (each array's [N] label must equal its real row count)
  - skill.json              -> canonical product version

What it checks
  1. SSOT self-consistency  - the [N] labels in agent.md match their actual rows,
                              and REFS[N] matches the real file count in references/.
  2. Version sync           - every version stamp (every references/*.md
                              frontmatter, CHANGELOG head)
                              equals skill.json's version.
  3. Guard / rule presence  - CC#0 and R#11/R#12 are present where they must be;
                              no satellite still asserts the old R#1-10 / RULES[10|13].
  4. Reference count        - architecture.md File Inventory states the real count.
  5. Rejection domains      - the agent.md REJECT block and SKILL.md both name
                              all four sibling-skill targets (text SSOT; the
                              former architecture image was retired).
  6. Mojibake               - no UTF-8-as-Latin-1 corruption in shipped text/diagrams.
  7. Error-envelope (K)     - the A1 files use ONE trace-id field name, not several.
  8. Playbook coverage      - every guard/rule id the lean core declares has a
                              definition in agent/essence.playbook.md, and the
                              playbook defines no orphan id the core never lists.
  9. Link integrity         - every relative markdown link in the shipped docs
                              resolves to a file/dir on disk (anchors stripped).
 10. skill.json schema      - required keys present, version is semver, tags
                              non-empty, every docs[].path resolves on disk.
 11. TOON syntax           - every TOON block in agent.md is well-formed: each
                              data row CSV-parses to exactly the declared column
                              count, and a declared [N] equals the real row count.
 12. Auto-load contract     - the Playbook Auto-Load contract is internally sound
                              (no dangling guard/rule ids, EXECUTION-HEAVY stays
                              lean, >=1 LOAD path) and the playbook's restatement
                              covers every LOAD category the core declares.
 13. Versioned header        - the canonical response-header spec carries the
                              `v{version}` token in all three spec files
                              (agent.md, playbook.md, copilot-instructions.md)
                              and no file has regressed to the un-versioned
                              `⚙ ESSENCE · {...}` form.
 14. Footer parity (5.3a)    - FOOTER[4] priority order in agent.md matches the
                              R#1/R#8/R#12 priority prose in the playbook.
 15. References file types    - references/ contains only .md files (5.3b).
 16. Examples header version - every `⚙ ESSENCE v{...}` line in examples/*.md
                              equals the canonical version (5.3d).
 17. Architecture freshness  - docs/ARCHITECTURE.md "Last verified" date is not
                              older than the latest CHANGELOG release (5.3e).
 18. Derived HTML version    - docs/ARCHITECTURE.html and essence-one-view.html
                              both carry the canonical version stamp (5.3f).
 19. Reference changelog     - each reference file's `changelog:` frontmatter
                              names a real CHANGELOG release, and `last_updated:`
                              is not older than the newest release naming that
                              file by filename mention (5.3g, approximation).
 20. Cross-fork body sync    - deployed forks of the lean core / playbook (the
                              VS Code global agent, plus any machine-local
                              forks listed in tools/fork-paths.local.txt or
                              $ESSENCE_FORK_PATHS) must match this skill-pack's
                              SSOT body once frontmatter is stripped.

Usage:   py tools/drift_lint.py
Exit:    0 = consistent, 1 = drift found.

The HTML map under ../Agentic Shop/Informative Material/ is a separate workspace
folder and is intentionally NOT linted here.
"""
from __future__ import annotations

import csv
import json
import os
import re
import sys
from pathlib import Path

# Force UTF-8 stdout so drift details containing em-dashes / box-drawing glyphs
# (rule prose, the response-header symbol) never crash the report on a legacy
# code-page console (e.g. Windows cp1252). Best-effort; ignored if unsupported.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent

AGENT = ROOT / "agent" / "essence.agent.md"
PLAYBOOK = ROOT / "agent" / "essence.playbook.md"
SKILL_JSON = ROOT / "skill.json"
ARCH_MD = ROOT / "references" / "architecture.md"
ARCH_DOC = ROOT / "docs" / "ARCHITECTURE.md"
COPILOT = ROOT / "templates" / "copilot-instructions.md"
CHANGELOG = ROOT / "CHANGELOG.md"
_SKILL_MD = "SKILL.md"
SKILL_MD = ROOT / _SKILL_MD
REFS_DIR = ROOT / "references"
EXAMPLES_DIR = ROOT / "examples"

# Deployed forks of the lean core / playbook whose body must match the skill-pack
# SSOT (AGENT / PLAYBOOK) once normalized. Frontmatter legitimately differs per fork
# (e.g. the global agent carries name="ESSENCE-Global" + author/version/tags), so
# only the BODY is compared. Known stable location: the VS Code global agent.
# Additional forks (e.g. a workspace `.github/agents/` copy) come from two further
# sources, merged at runtime: the $ESSENCE_FORK_PATHS env var and a gitignored
# local config file `tools/fork-paths.local.txt` (one absolute path per line,
# '#' comments allowed). Both keep machine-specific paths OUT of the published
# pack. Fork kind is inferred from the filename. A listed fork that is absent on
# this machine is a WARN (skipped), never a FAIL — so this check stays portable
# on CI runners that only have the skill pack checked out.
KNOWN_FORKS = [
    ("global-agent", "lean", Path.home() / ".copilot" / "agents" / "essence-global.agent.md"),
]

# Gitignored, machine-local list of extra fork paths (one absolute path per line).
FORK_CONFIG = Path(__file__).resolve().parent / "fork-paths.local.txt"
ARCH_HTML = ROOT / "docs" / "ARCHITECTURE.html"
ONE_VIEW_HTML = ROOT / "essence-one-view.html"

A1_FILES = [
    REFS_DIR / "a1-development.md",
    REFS_DIR / "a1-project-scaffolding.md",
    REFS_DIR / "a1-error-handling.md",
    REFS_DIR / "a1-logging-observability.md",
    REFS_DIR / "a1-async-patterns.md",
    REFS_DIR / "a1-input-validation.md",
]

# Canonical rejection targets, derived from agent.md REJECT block at runtime.
REJECT_MARKETPLACE = [
    "essence-data-pipeline-engineering",
    "essence-cortex-ai-builder",
    "essence-ml-methodology",
    "essence-tableau-developer",
]

# Mojibake = UTF-8 bytes mis-decoded as Latin-1 / Windows-1252. Signature: a
# lead byte (Â U+00C2 / Ã U+00C3 / â U+00E2) followed by a C1 control
# (U+0080-U+009F) or a general-punctuation char (U+2000-U+206F, where cp1252
# maps the corrupt continuation bytes to smart-quotes etc).
# C1-control branch catches "âŒ" (â+U+009D = corrupt ❌); punctuation branch
# catches box-corner corruption like "â”" (â+U+201D = corrupt ┐).
# NOTE: U+206F upper bound deliberately excludes U+25A1 (□ tofu glyph) so the
# literal "â□□" mojibake *illustration* in docs is not flagged as corruption.
MOJIBAKE = re.compile(r"[\u00C2\u00C3\u00E2][\u0080-\u009F]|Ã.|Â[^\s]|â[\u2000-\u206F]|ï¿½")

results: list[tuple[str, str, str]] = []  # (level, check, detail)


def add(level: str, check: str, detail: str = "") -> None:
    results.append((level, check, detail))


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def block_rows(agent_text: str, label: str) -> tuple[int | None, int]:
    """Return (declared_N, real_row_count) for a ```LABEL[N]{...}: ...``` block.

    Rows = non-empty lines that are not the label and not '#' comments.
    """
    m = re.search(
        rf"^{re.escape(label)}\[(\d+)\]\{{.*?\}}:\s*\n(.*?)^```",
        agent_text,
        re.S | re.M,
    )
    if not m:
        return None, 0
    declared = int(m.group(1))
    body = m.group(2)
    rows = [
        ln for ln in body.splitlines()
        if ln.strip() and not ln.lstrip().startswith("#")
    ]
    return declared, len(rows)


def block_ids(agent_text: str, label: str) -> set[str]:
    """Return the set of CC#/R# ids declared in a ```LABEL[N]{...}: ...``` block.

    Rows look like ``CC#1,"trigger",...`` (GUARDS) or ``TIER,R#6,"name",...``
    (RULES), so we read the id from the row start, tolerating an optional
    leading tier column (e.g. ``ALWAYS,``).
    """
    m = re.search(
        rf"^{re.escape(label)}\[(\d+)\]\{{.*?\}}:\s*\n(.*?)^```",
        agent_text,
        re.S | re.M,
    )
    if not m:
        return set()
    body = m.group(2)
    return set(re.findall(r"(?m)^(?:[A-Z]+,)?(CC#\d+|R#\d+),", body))


# Header of a TOON block:  LABEL{cols}:  or  LABEL[N]{cols}:
TOON_HEADER = re.compile(
    r"^(?P<label>[A-Z][A-Z0-9-]*)(?:\[(?P<n>\d+)\])?\{(?P<cols>[^}]+)\}:[ \t]*$"
)


def _toon_data_rows(lines, first_line):
    """Filter a TOON fence body down to its data rows.

    A *data row* is any line that is not blank, not the header, not a
    '#' comment, not a markdown bullet ('- '), and not a sub-section header
    (e.g. ``ORDER:`` / ``DEPENDENCY-RULES:`` lines that carry no leading field).
    """
    rows = []
    for ln in lines:
        s = ln.strip()
        if not s or s == first_line:
            continue
        if s.startswith(("#", "- ")):
            continue
        if re.match(r"^[A-Z][A-Z-]*:(?:\s|$)", s):
            continue
        rows.append(s)
    return rows


def toon_blocks(text: str):
    """Yield (label, declared_n|None, columns, data_rows) for each TOON block.

    A TOON block is a ```fenced``` region whose first non-blank line is a TOON
    header. Inside the fence, a *data row* is any line that is not blank, not a
    '#' comment, not a markdown bullet ('- '), and not a sub-section header
    (e.g. ``ORDER:`` / ``DEPENDENCY-RULES:`` lines that carry no leading field).
    Fields are CSV-parsed so quoted commas inside a column don't miscount.
    """
    for fence in re.findall(r"```(.*?)```", text, re.S):
        lines = fence.splitlines()
        first = next((ln for ln in lines if ln.strip()), "")
        m = TOON_HEADER.match(first.strip())
        if not m:
            continue
        cols = [c.strip() for c in m.group("cols").split(",")]
        n = int(m.group("n")) if m.group("n") else None
        rows = _toon_data_rows(lines, first.strip())
        yield m.group("label"), n, cols, rows


# ──────────────────────────────────────────────────────────────────────────
# 1. SSOT self-consistency
# ──────────────────────────────────────────────────────────────────────────
agent = read(AGENT)
truth: dict[str, int] = {}
for label in ("GUARDS", "RULES", "REJECT", "REFS"):
    declared, real = block_rows(agent, label)
    if declared is None:
        add("FAIL", f"agent.md {label} block", "block not found")
        continue
    truth[label] = declared
    if declared == real:
        add("PASS", f"agent.md {label}[{declared}] == {real} rows")
    else:
        add("FAIL", f"agent.md {label} count",
            f"label says [{declared}] but block has {real} rows")

# REFS label vs actual files in references/
real_md = sorted(p.name for p in REFS_DIR.glob("*.md"))
if "REFS" in truth:
    if truth["REFS"] == len(real_md):
        add("PASS", f"references/ has {len(real_md)} .md files == REFS[{truth['REFS']}]")
    else:
        add("FAIL", "references/ file count",
            f"REFS[{truth['REFS']}] but {len(real_md)} .md files on disk: {real_md}")

# ──────────────────────────────────────────────────────────────────────────
# 2. Version sync (canonical = skill.json)
# ──────────────────────────────────────────────────────────────────────────
canonical = json.loads(read(SKILL_JSON))["version"]
add("PASS", f"canonical version (skill.json) = {canonical}")

# every reference/*.md frontmatter version (the per-file marketplace-release
# stamp). All shipped reference files must carry the canonical version.
for md in sorted(REFS_DIR.glob("*.md")):
    m = re.search(r"(?m)^version:\s*([\d.]+)", read(md))
    if not m:
        add("FAIL", f"{md.name} frontmatter version", "no version: field found in frontmatter")
        continue
    lvl = "PASS" if m.group(1) == canonical else "FAIL"
    add(lvl, f"{md.name} frontmatter version", f"{m.group(1)} (want {canonical})")

# CHANGELOG head
m = re.search(r"(?m)^##\s*\[([\d.]+)\]", read(CHANGELOG))
if m:
    lvl = "PASS" if m.group(1) == canonical else "FAIL"
    add(lvl, "CHANGELOG head version", f"{m.group(1)} (want {canonical})")

# ──────────────────────────────────────────────────────────────────────────
# 3. Guard / rule presence in satellites
# ──────────────────────────────────────────────────────────────────────────
arch = read(ARCH_MD)
cop = read(COPILOT)
arch_doc = read(ARCH_DOC)
skill_text = read(SKILL_MD)

# Anchored to the H1 title line (e.g. "# ESSENCE -- System Architecture (v2.8.0, ...")
# rather than a bare substring search, so a stale H1 can't hide behind an
# unrelated `v{canonical}` mention elsewhere in the document (5.3h).
arch_doc_h1 = re.search(r"(?m)^#\s.*\(v(\d+\.\d+\.\d+)", arch_doc)
arch_doc_version_ok = bool(arch_doc_h1) and arch_doc_h1.group(1) == canonical

checks_presence = [
    ("architecture.md states CC#0-7, R#1-12", "CC#0-7, R#1-12" in arch),
    ("architecture.md Layer 1 has CC#0", "CC#0 Input Normalization" in arch),
    ("architecture.md Layer 2 has R#11", "R#11" in arch),
    ("architecture.md Layer 2 has R#12", "R#12" in arch),
    ("copilot-instructions.md has CC#0 item", bool(re.search(r"(?m)^0\.\s", cop))),
    ("docs/ARCHITECTURE.md version stamp matches canonical", arch_doc_version_ok),
]
for name, ok in checks_presence:
    add("PASS" if ok else "FAIL", name, "" if ok else "missing")

# stale rule-count assertions anywhere except CHANGELOG / evals (history is allowed)
STALE = re.compile(r"R#1-10\b|RULES\[10\]|RULES\[13\]")
# stale guard-count assertions -- mirrors the rule-count check above (L2)
GUARD_STALE = re.compile(r"\b7 guards\b|GUARDS\[7\]|\bCC#0-6\b")
# ARCH_MD (references/architecture.md) is already covered by the REFS_DIR glob below --
# listing it again would scan/report it twice.
for p in list(REFS_DIR.glob("*.md")) + [COPILOT, ARCH_DOC]:
    hits = STALE.findall(read(p))
    if hits:
        add("FAIL", f"{p.name} stale rule count", f"contains {sorted(set(hits))}")
    guard_hits = GUARD_STALE.findall(read(p))
    if guard_hits:
        add("FAIL", f"{p.name} stale guard count", f"contains {sorted(set(guard_hits))}")

# ──────────────────────────────────────────────────────────────────────────
# 4. Reference count in architecture.md File Inventory
# ──────────────────────────────────────────────────────────────────────────
m = re.search(r"`references/`\s*\|\s*(\d+)\s*\|", arch)
if m and "REFS" in truth:
    n = int(m.group(1))
    lvl = "PASS" if n == truth["REFS"] else "FAIL"
    add(lvl, "architecture.md File Inventory ref count", f"{n} (want {truth['REFS']})")

# L1: docs/ARCHITECTURE.md carries the same ref-count claim in two spots
# (the Runtime Core file table and the §10 File Inventory table).
for label, pattern in (
    ("docs/ARCHITECTURE.md Runtime Core ref count", r"references/\*\.md.{0,40}?\\?×(\d+)"),
    ("docs/ARCHITECTURE.md File Inventory ref count", r"`references/`\s*\|\s*(\d+)\s*\|"),
):
    m2 = re.search(pattern, arch_doc)
    if m2 and "REFS" in truth:
        n2 = int(m2.group(1))
        lvl2 = "PASS" if n2 == truth["REFS"] else "FAIL"
        add(lvl2, label, f"{n2} (want {truth['REFS']})")
    elif "REFS" in truth:
        add("FAIL", label, "pattern not found in docs/ARCHITECTURE.md")

# L4: REFS catalog row-count parity between agent.md (structural SSOT) and
# SKILL.md's human-facing "### Text References" bullet list. Disk-count alone
# (check above) doesn't catch a bullet silently dropped from SKILL.md while
# the file itself still exists on disk -- this is what let D2 slip through.
_NEXT_HEADING_RE = re.compile(r"\n##\s")


def _section_body(text: str, heading: str) -> str | None:
    """Text between `heading`'s own line and the next '##' heading (or EOF).

    Plain string scanning rather than one span-matching regex: the regex form
    needs a reluctant quantifier over a DOTALL '.', which backtracks badly on
    large inputs.
    """
    start = text.find(heading)
    if start == -1:
        return None
    line_end = text.find("\n", start)
    if line_end == -1:
        return ""
    body_start = line_end + 1
    end = _NEXT_HEADING_RE.search(text, body_start)
    return text[body_start:end.start()] if end else text[body_start:]


_refs_section = _section_body(skill_text, "### Text References")
skill_ref_bullets = re.findall(r"(?m)^- \[[^\]]+\]\(references/[^)]+\)", _refs_section) if _refs_section else []
if "REFS" in truth:
    lvl3 = "PASS" if len(skill_ref_bullets) == truth["REFS"] else "FAIL"
    add(lvl3, "SKILL.md Text References bullet count vs REFS[N]",
        f"{len(skill_ref_bullets)} bullets (want {truth['REFS']})")

# ──────────────────────────────────────────────────────────────────────────
# 5. Rejection domains named in the text SSOT (agent.md REJECT block + SKILL.md)
# ──────────────────────────────────────────────────────────────────────────
agent_text = read(AGENT)
for src_name, src in (("agent.md REJECT block", agent_text), (_SKILL_MD, skill_text)):
    missing = [d for d in REJECT_MARKETPLACE if d not in src]
    if missing:
        add("FAIL", f"{src_name} rejection domains", f"missing {missing}")
    else:
        add("PASS", f"{src_name} names all {len(REJECT_MARKETPLACE)} rejection domains")

# ──────────────────────────────────────────────────────────────────────────
# 6. Mojibake in shipped text/diagrams
# ──────────────────────────────────────────────────────────────────────────
moji_files = []
for p in list(REFS_DIR.glob("*.md")) + [
    ARCH_MD, ARCH_DOC, COPILOT, CHANGELOG, SKILL_MD, PLAYBOOK, AGENT
]:
    if MOJIBAKE.search(read(p)):
        moji_files.append(p.name)
if moji_files:
    add("FAIL", "mojibake", f"corrupted bytes in: {sorted(set(moji_files))}")
else:
    add("PASS", "no mojibake in shipped text/diagrams")

# ──────────────────────────────────────────────────────────────────────────
# 7. Error-envelope contract (finding K)
#
# Only the SHIPPED JSON contract matters: the trace field *inside* the
# ```json error-response body``` clients parse. Language-idiomatic variable
# names (correlationId in TS, correlation_id in Python) and the wire header
# (x-correlation-id) are NOT drift, so we scope the check to fenced ```json
# blocks that contain an "error" object and read the trace key from there.
# ──────────────────────────────────────────────────────────────────────────
JSON_BLOCK = re.compile(r"```json\s*(.*?)```", re.S)
TRACE_KEY = re.compile(r'"(correlationId|correlation_id|request_id|requestId|traceId|trace_id)"\s*:')
envelope: dict[str, set[str]] = {}
for p in A1_FILES:
    if not p.exists():
        continue
    text = read(p)
    for block in JSON_BLOCK.findall(text):
        if '"error"' not in block:
            continue  # only the error-response envelope is a client contract
        for key in TRACE_KEY.findall(block):
            envelope.setdefault(key, set()).add(p.name)
if len(envelope) > 1:
    detail = "; ".join(f"{k} -> {sorted(v)}" for k, v in sorted(envelope.items()))
    add("FAIL", f"error-envelope JSON trace field has {len(envelope)} names", detail)
elif len(envelope) == 1:
    add("PASS", f"error-envelope JSON trace field is single: {next(iter(envelope))}")
else:
    add("WARN", "error-envelope JSON trace field not found in A1 files")

# ──────────────────────────────────────────────────────────────────────────
# 8. Playbook <-> lean-core rule-ID coverage
#
# The lean core (agent.md) declares the guards/rules as TOON rows; the full
# prose lives in the auto-loaded playbook (agent/essence.playbook.md). Each id
# the core declares MUST have a bold definition header in the playbook
# (**CC#0 — ...** / **R#2 · ...**), and the playbook must not define an orphan
# the core never lists. Cross-references in prose are plain `R#1` with no bold
# prefix, so the `**` anchor cleanly distinguishes a definition from a mention.
# ──────────────────────────────────────────────────────────────────────────
if PLAYBOOK.exists():
    guard_ids = block_ids(agent, "GUARDS")
    rule_ids = block_ids(agent, "RULES")
    core_ids = guard_ids | rule_ids
    pb_text = read(PLAYBOOK)
    pb_ids = set(re.findall(r"(?m)^\*\*(CC#\d+|R#\d+)\b", pb_text))

    missing = sorted(core_ids - pb_ids, key=lambda s: (s[0], int(s.split("#")[1])))
    orphan = sorted(pb_ids - core_ids, key=lambda s: (s[0], int(s.split("#")[1])))

    if missing:
        add("FAIL", "playbook missing definitions for core ids",
            f"declared in agent.md but not defined in playbook: {missing}")
    if orphan:
        add("FAIL", "playbook defines ids absent from core",
            f"defined in playbook but not declared in agent.md: {orphan}")
    if not missing and not orphan:
        add("PASS",
            f"playbook defines all {len(core_ids)} core ids "
            f"({len(guard_ids)} guards + {len(rule_ids)} rules)")
else:
    add("FAIL", "playbook present", f"{PLAYBOOK.name} not found")

# ──────────────────────────────────────────────────────────────────────────
# 9. Link integrity
#
# Every relative markdown link in the shipped docs must resolve to a file or
# directory on disk. We skip absolute URLs (http/https/mailto) and pure-anchor
# links (#section), and strip line anchors (#L16) before resolving. Paths are
# resolved relative to the linking file's own directory.
# ──────────────────────────────────────────────────────────────────────────
MD_LINK = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
# ARCH_MD (references/architecture.md) is already covered by the REFS_DIR glob below --
# listing it again would double-count its links.
SHIPPED_DOCS = (
    [SKILL_MD, CHANGELOG, ARCH_DOC, COPILOT, AGENT, PLAYBOOK]
    + sorted(REFS_DIR.glob("*.md"))
)
broken_links: list[str] = []
checked_links = 0
for doc in SHIPPED_DOCS:
    if not doc.exists():
        continue
    for target in MD_LINK.findall(read(doc)):
        target = target.strip()
        if re.match(r"^(https?:|mailto:|#)", target):
            continue  # external URL or pure anchor — out of scope
        path_part = target.split("#", 1)[0]  # drop #L16 / #section anchor
        if not path_part:
            continue
        checked_links += 1
        resolved = (doc.parent / path_part).resolve()
        if not resolved.exists():
            broken_links.append(f"{doc.name}: [{target}]")
if broken_links:
    add("FAIL", "markdown link integrity",
        f"{len(broken_links)} broken: {broken_links}")
else:
    add("PASS", f"markdown link integrity ({checked_links} relative links resolve)")

# ──────────────────────────────────────────────────────────────────────────
# 10. skill.json schema
#
# The marketplace manifest must carry the required keys, a semver version, a
# non-empty tag list, and docs[].path entries that all resolve on disk.
# ──────────────────────────────────────────────────────────────────────────
skill = json.loads(read(SKILL_JSON))
REQUIRED_KEYS = [
    "name", "displayName", "version", "status", "description",
    "tags", "maintainers", "docs", "platform",
]
missing_keys = [k for k in REQUIRED_KEYS if k not in skill]
if missing_keys:
    add("FAIL", "skill.json required keys", f"missing {missing_keys}")
else:
    add("PASS", f"skill.json has all {len(REQUIRED_KEYS)} required keys")

if re.fullmatch(r"\d+\.\d+\.\d+", str(skill.get("version", ""))):
    add("PASS", f"skill.json version is semver ({skill['version']})")
else:
    add("FAIL", "skill.json version format", f"not semver: {skill.get('version')!r}")

tags = skill.get("tags", [])
if isinstance(tags, list) and tags:
    add("PASS", f"skill.json tags non-empty ({len(tags)})")
else:
    add("FAIL", "skill.json tags", "missing or empty")

bad_docs = []
for entry in skill.get("docs", []):
    p = entry.get("path", "")
    if not p or not (ROOT / p).resolve().exists():
        bad_docs.append(entry.get("label", p))
if bad_docs:
    add("FAIL", "skill.json docs[].path", f"unresolved: {bad_docs}")
else:
    add("PASS", f"skill.json docs[].path all resolve ({len(skill.get('docs', []))})")

# ──────────────────────────────────────────────────────────────────────────
# 11. TOON syntax / arity
#
# Every TOON block in the lean core must be well-formed so that downstream
# checks (block_rows / block_ids) read it correctly. For each block: every data
# row must CSV-parse to exactly the declared column count, and if the header
# declares [N] the real row count must equal N. CSV parsing respects quoted
# commas, so the comma-heavy `core`/`action`/`condition` columns don't miscount.
# ──────────────────────────────────────────────────────────────────────────
toon_problems: list[str] = []
toon_block_count = 0
for label, declared_n, cols, rows in toon_blocks(agent):
    toon_block_count += 1
    ncols = len(cols)
    for row in rows:
        try:
            fields = next(csv.reader([row]))
        except Exception as exc:  # unbalanced quotes, etc.
            toon_problems.append(f"{label}: unparseable row ({exc}): {row[:40]}")
            continue
        if len(fields) != ncols:
            toon_problems.append(
                f"{label}: row has {len(fields)} fields, header declares {ncols}"
                f" -> {row[:40]}"
            )
    if declared_n is not None and len(rows) != declared_n:
        toon_problems.append(
            f"{label}[{declared_n}] but {len(rows)} data rows"
        )
if toon_problems:
    add("FAIL", "TOON block syntax", f"{len(toon_problems)} issue(s): {toon_problems}")
else:
    add("PASS", f"TOON block syntax ({toon_block_count} blocks well-formed)")

# ──────────────────────────────────────────────────────────────────────────
# 12. Auto-load contract consistency
#
# The lean core promises, in `## Playbook Auto-Load`, when it will silently pull
# the playbook. That promise must be internally sound and must agree with the
# playbook's own "When it loads" restatement. We check three things:
#   A. No dangling ids — every CC#/R# named in the contract is a declared guard
#      or rule (catches e.g. a default rule that cites a non-existent CC#7).
#   B. Structure — the PLAYBOOK-LOAD block has at least one LOAD row and the
#      EXECUTION-HEAVY category resolves to STAY LEAN (the one cheap path). An
#      inverted action (EXECUTION-HEAVY -> LOAD) defeats the whole lean design.
#   C. Cross-file — every LOAD category the core declares (REASONING-HEAVY,
#      COMPLIANCE, SCAFFOLDING, DESTRUCTIVE) is echoed in the playbook note, so
#      the two copies of the contract can't silently diverge.
# ──────────────────────────────────────────────────────────────────────────
core_ids_all = block_ids(agent, "GUARDS") | block_ids(agent, "RULES")
m_region = re.search(r"## Playbook Auto-Load(.*?)\n## ", agent, re.S)
region = m_region.group(1) if m_region else ""

# A. dangling ids
region_ids = set(re.findall(r"CC#\d+|R#\d+", region))
dangling = sorted(region_ids - core_ids_all,
                  key=lambda s: (s[0], int(s.split("#")[1])))
if dangling:
    add("FAIL", "auto-load contract dangling ids",
        f"contract cites undeclared {dangling}")
else:
    add("PASS", "auto-load contract ids all declared")

# B + C. parse the PLAYBOOK-LOAD block
load_cats: list[str] = []
exec_stays_lean = False
for label, _n, _cols, rows in toon_blocks(agent):
    if label != "PLAYBOOK-LOAD":
        continue
    for row in rows:
        trig, act = next(csv.reader([row]))[:2]
        cat = re.split(r"\s*\(", trig, 1)[0].strip()
        if "STAY LEAN" in act.upper():
            if cat.upper().startswith("EXECUTION"):
                exec_stays_lean = True
        else:
            load_cats.append(cat)

if load_cats and exec_stays_lean:
    add("PASS",
        f"auto-load structure ({len(load_cats)} LOAD paths, EXECUTION-HEAVY stays lean)")
else:
    add("FAIL", "auto-load structure",
        f"LOAD paths={load_cats}, EXECUTION-HEAVY stays lean={exec_stays_lean}")

pb_note = ""
if PLAYBOOK.exists():
    # Scope the cross-file check to the playbook's "When it loads" note only,
    # NOT the whole file — otherwise a category dropped from the note still
    # matches because the same word appears in that rule's full prose section.
    m_note = re.search(r"When it loads\.(.*?)See `agent", read(PLAYBOOK), re.S)
    pb_note = (m_note.group(1) if m_note else "").lower()
uncovered = [c for c in load_cats if c.lower()[:8] not in pb_note]
if uncovered:
    add("FAIL", "playbook restates all LOAD categories",
        f"core declares but playbook note omits: {uncovered}")
else:
    add("PASS",
        f"playbook note covers all {len(load_cats)} core LOAD categories")

# ──────────────────────────────────────────────────────────────────────────# 13. Versioned response header
#
# Non-Negotiable #1 declares the canonical header `⚙ ESSENCE v{version} · ...`,
# where {version} binds to skill.json. The version token must appear in all
# three spec files, and none may have silently regressed to the old
# un-versioned `⚙ ESSENCE · {...}` form. (The literal `{version}` placeholder is
# what lives in the spec text — the agent renders the real value at runtime.)
# ───────────────────────────────────────────────────────────────────────────
HEADER_TOKEN = "⚙ ESSENCE v{version} ·"
UNVERSIONED = re.compile(r"⚙ ESSENCE · \{")
header_spec_files = [
    ("agent.md", AGENT),
    ("playbook.md", PLAYBOOK),
    ("copilot-instructions.md", COPILOT),
]
header_problems: list[str] = []
for name, path in header_spec_files:
    txt = read(path)
    if HEADER_TOKEN not in txt:
        header_problems.append(f"{name}: missing versioned header token '{HEADER_TOKEN}'")
    if UNVERSIONED.search(txt):
        header_problems.append(f"{name}: regressed to un-versioned '⚙ ESSENCE · {{...}}'")
if header_problems:
    add("FAIL", "versioned response header", "; ".join(header_problems))
else:
    add("PASS", f"versioned response header (v{{version}} in {len(header_spec_files)} spec files)")

# ──────────────────────────────────────────────────────────────────────────
# 14 (5.3a). FOOTER[4] priority parity: agent.md <-> playbook.md
# ──────────────────────────────────────────────────────────────────────────
agent_footer: dict[str, str] = {}
for label, _n, _cols, rows in toon_blocks(agent):
    if label != "FOOTER":
        continue
    for row in rows:
        fields = next(csv.reader([row]))
        if len(fields) < 3:
            continue
        priority, owner, fires = fields[0], fields[1], fields[2]
        if owner == "R#1":
            agent_footer["R#1"] = priority
        elif owner == "R#8":
            agent_footer["R#8"] = priority
        elif owner == "R#12":
            if "latest published version" in fires:
                agent_footer["update-check"] = priority
            else:
                agent_footer["R#12"] = priority

pb_text = read(PLAYBOOK)
m_r1 = re.search(
    r"Owns \*\*footer priority (\d+)\*\* — see `agent/essence\.agent\.md → Footer Policy` \(single slot",
    pb_text,
)
m_r8 = re.search(
    r"Owns \*\*footer priority (\d+)\*\* — see `agent/essence\.agent\.md → Footer Policy`\.",
    pb_text,
)
m_r12 = re.search(
    r"arbitrates priority across the session-start update-check \((\d+)\) / R#1 \((\d+)\) / R#8 \((\d+)\) / R#12 \((\d+)\)",
    pb_text,
)

footer_problems: list[str] = []
if not (agent_footer.get("R#1") and m_r1 and agent_footer["R#1"] == m_r1.group(1)):
    footer_problems.append(
        f"R#1: agent={agent_footer.get('R#1')!r} playbook={m_r1.group(1) if m_r1 else None!r}"
    )
if not (agent_footer.get("R#8") and m_r8 and agent_footer["R#8"] == m_r8.group(1)):
    footer_problems.append(
        f"R#8: agent={agent_footer.get('R#8')!r} playbook={m_r8.group(1) if m_r8 else None!r}"
    )
if m_r12:
    expected = (
        agent_footer.get("update-check"),
        agent_footer.get("R#1"),
        agent_footer.get("R#8"),
        agent_footer.get("R#12"),
    )
    actual = m_r12.groups()
    if expected != actual:
        footer_problems.append(f"R#12 arbitration order: agent={expected} playbook={actual}")
else:
    footer_problems.append("R#12 arbitration line not found in playbook")

if footer_problems:
    add("FAIL", "FOOTER[4] priority parity agent<->playbook", "; ".join(footer_problems))
else:
    add("PASS", "FOOTER[4] priority parity agent<->playbook")

# ──────────────────────────────────────────────────────────────────────────
# 15 (5.3b). references/ contains only .md files
# ──────────────────────────────────────────────────────────────────────────
non_md = sorted(p.name for p in REFS_DIR.iterdir() if p.is_file() and p.suffix != ".md")
if non_md:
    add("FAIL", "references/ file types", f"non-.md files present: {non_md}")
else:
    add("PASS", "references/ contains only .md files")

# ──────────────────────────────────────────────────────────────────────────
# 16 (5.3d). examples/ response-header version matches canonical
# ──────────────────────────────────────────────────────────────────────────
example_problems: list[str] = []
example_checked = 0
for ex in sorted(EXAMPLES_DIR.glob("*.md")):
    for m in re.finditer(r"⚙ ESSENCE v(\d+\.\d+\.\d+)", read(ex)):
        example_checked += 1
        if m.group(1) != canonical:
            example_problems.append(f"{ex.name}: header says v{m.group(1)}, want v{canonical}")
if example_problems:
    add("FAIL", "examples/ header version matches canonical", "; ".join(example_problems))
else:
    add("PASS", f"examples/ header version ({example_checked} header(s)) == v{canonical}")

# ──────────────────────────────────────────────────────────────────────────
# 17 (5.3e). docs/ARCHITECTURE.md "Last verified" >= latest CHANGELOG release date
# ──────────────────────────────────────────────────────────────────────────
release_matches = re.findall(r"(?m)^##\s*\[([\d.]+)\]\s*-\s*(\d{4}-\d{2}-\d{2})\s*$", read(CHANGELOG))
if release_matches:
    latest_release_date = max(d for _, d in release_matches)
    m_lv = re.search(r"\*\*Last verified:\*\*\s*(\d{4}-\d{2}-\d{2})", arch_doc)
    if not m_lv:
        add("FAIL", "docs/ARCHITECTURE.md Last verified date", "no 'Last verified' date found")
    elif m_lv.group(1) >= latest_release_date:
        add("PASS",
            f"docs/ARCHITECTURE.md Last verified ({m_lv.group(1)}) >= latest CHANGELOG release ({latest_release_date})")
    else:
        add("FAIL", "docs/ARCHITECTURE.md Last verified date",
            f"{m_lv.group(1)} is older than latest CHANGELOG release {latest_release_date}")
else:
    add("WARN", "docs/ARCHITECTURE.md Last verified check", "no CHANGELOG release headers found")

# ──────────────────────────────────────────────────────────────────────────
# 18 (5.3f). Version stamp in both derived HTML views == skill.json version
# ──────────────────────────────────────────────────────────────────────────
html_problems: list[str] = []
if ARCH_HTML.exists():
    if f"v{canonical}" not in read(ARCH_HTML):
        html_problems.append(f"docs/ARCHITECTURE.html missing v{canonical}")
else:
    html_problems.append("docs/ARCHITECTURE.html not found")
if ONE_VIEW_HTML.exists():
    if f"ESSENCE v{canonical}" not in read(ONE_VIEW_HTML):
        html_problems.append(f"essence-one-view.html missing ESSENCE v{canonical}")
else:
    html_problems.append("essence-one-view.html not found")
if html_problems:
    add("FAIL", "derived HTML views version stamp", "; ".join(html_problems))
else:
    add("PASS", f"derived HTML views (2) carry v{canonical}")

# ──────────────────────────────────────────────────────────────────────────
# 19 (5.3g). Reference frontmatter changelog:/last_updated: cross-check
#
# Approximation (documented per the remediation plan, since this check parses
# CHANGELOG prose rather than real provenance data): a file is "named" by a
# CHANGELOG release if its filename appears in that release's body text. A
# file's changelog: field, if present, must name a real release; if the file
# is named by one or more releases and carries a last_updated:, that date must
# be >= the newest such release's date. A file with NO changelog: field is not
# FAILed here (WARN only, backfill gap for the docs-governance phase). A file
# never named by any release is exempt from the date comparison -- convention:
# such a file's changelog: (once backfilled) is set to the release that
# introduced it, which by definition won't appear in the prose of a later one.
# ──────────────────────────────────────────────────────────────────────────
release_entries: list[tuple[str, str, str]] = []
changelog_text = read(CHANGELOG)
for rm in re.finditer(r"(?m)^##\s*\[([\d.]+)\]\s*-\s*(\d{4}-\d{2}-\d{2})\s*$", changelog_text):
    start = rm.end()
    nxt = changelog_text.find("\n## [", start)
    body = changelog_text[start: nxt if nxt != -1 else len(changelog_text)]
    release_entries.append((rm.group(1), rm.group(2), body))
valid_versions = {v for v, _, _ in release_entries}

for md in sorted(REFS_DIR.glob("*.md")):
    md_text = read(md)
    fm_match = re.match(r"^---\n(.*?)\n---", md_text, re.S)
    fm_text = fm_match.group(1) if fm_match else ""
    cl_match = re.search(r"(?m)^changelog:\s*([\d.]+)", fm_text)
    lu_match = re.search(r"(?m)^last_updated:\s*(\d{4}-\d{2}-\d{2})", fm_text)
    naming_dates = [date for _, date, body in release_entries if md.name in body]

    if not cl_match:
        add("WARN", f"{md.name} changelog: field", "missing (backfill pending)")
        continue
    if cl_match.group(1) not in valid_versions:
        add("FAIL", f"{md.name} changelog: field", f"{cl_match.group(1)} is not an existing CHANGELOG release")
        continue
    if naming_dates and lu_match:
        newest_naming_date = max(naming_dates)
        if lu_match.group(1) < newest_naming_date:
            add("FAIL", f"{md.name} last_updated vs CHANGELOG",
                f"last_updated {lu_match.group(1)} predates the newest CHANGELOG entry naming this file ({newest_naming_date})")
        else:
            add("PASS", f"{md.name} changelog:/last_updated: consistent with CHANGELOG")
    else:
        add("PASS", f"{md.name} changelog: is a valid release ({cl_match.group(1)})")

# ---------------------------------------------------------------------------
# 20. Cross-fork body sync (deployed forks must match the skill-pack SSOT body)
# ---------------------------------------------------------------------------


def _fork_body(text: str) -> str:
    """Return a fork's comparable body: frontmatter stripped, EOL + trailing
    whitespace normalized. The leading YAML `---...---` block legitimately
    differs per fork (name/author/version/tags) and is removed; CRLF/CR are
    folded to LF and per-line trailing whitespace is trimmed so only real
    content drift survives."""
    m = re.match(r"^---\r?\n.*?\r?\n---\r?\n", text, re.S)
    if m:
        text = text[m.end():]
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(ln.rstrip() for ln in text.split("\n")).strip()


def _first_body_diff(ssot: str, fork: str) -> str:
    """Human-readable description of the first line where two bodies diverge."""
    a, b = ssot.split("\n"), fork.split("\n")
    for i, (x, y) in enumerate(zip(a, b), 1):
        if x != y:
            return f"first diff at body line {i}: SSOT={x[:60]!r} fork={y[:60]!r}"
    if len(a) != len(b):
        return f"body length differs: SSOT {len(a)} lines vs fork {len(b)} lines"
    return "bodies differ in an undetected way"


# Build the fork list: known stable locations + $ESSENCE_FORK_PATHS entries +
# the gitignored tools/fork-paths.local.txt (one absolute path per line).
fork_candidates = list(KNOWN_FORKS)
_extra_raw = os.environ.get("ESSENCE_FORK_PATHS", "").split(os.pathsep)
if FORK_CONFIG.exists():
    try:
        _extra_raw += FORK_CONFIG.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError) as exc:
        # Unreadable (OSError) or saved in a non-UTF-8 encoding (UnicodeDecodeError)
        # — skip with a WARN rather than crashing the lint.
        add("WARN", f"fork config {FORK_CONFIG.name} unreadable (skipped)", str(exc))
for _raw in _extra_raw:
    # Documented format: one absolute path per line, '#' comments allowed. Strip
    # an inline (or whole-line) '# ...' comment first, then trim surrounding space.
    _raw = _raw.split("#", 1)[0].strip()
    if not _raw:
        continue
    _p = Path(_raw)
    if not _p.is_absolute():
        # The format calls for absolute paths; a relative entry is almost
        # certainly a mistake — WARN + skip rather than resolve it against CWD.
        add("WARN", f"fork path not absolute (skipped): {_raw}")
        continue
    _kind = "play" if _p.name.endswith("playbook.md") else "lean"
    fork_candidates.append((_p.name, _kind, _p))

ssot_body = {"lean": _fork_body(read(AGENT)), "play": _fork_body(read(PLAYBOOK))}
for _label, _kind, _path in fork_candidates:
    if not _path.exists():
        add("WARN", f"fork {_label} not present on this machine (skipped)", str(_path))
        continue
    try:
        _body = _fork_body(_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError) as exc:
        # e.g. a OneDrive file mid-sync / transiently locked (OSError), or a fork
        # saved in a legacy non-UTF-8 encoding (UnicodeDecodeError). Don't crash
        # the lint or fail CI over a read/decode error — surface it as a WARN.
        add("WARN", f"fork {_label} unreadable (skipped)", str(exc))
        continue
    if _body == ssot_body[_kind]:
        add("PASS", f"fork {_label} body matches SSOT {_kind}")
    else:
        add("FAIL", f"fork {_label} drift vs SSOT {_kind}", _first_body_diff(ssot_body[_kind], _body))

# ──────────────────────────────────────────────────────────────────────────
ICON = {"PASS": "PASS", "FAIL": "FAIL", "WARN": "WARN"}
fails = sum(1 for lvl, *_ in results if lvl == "FAIL")
warns = sum(1 for lvl, *_ in results if lvl == "WARN")

print("=" * 72)
print("ESSENCE drift-lint  (SSOT: agent/essence.agent.md + skill.json)")
print("=" * 72)
for lvl, check, detail in results:
    line = f"[{ICON[lvl]}] {check}"
    if detail:
        line += f"  --  {detail}"
    print(line)
print("-" * 72)
print(f"{len(results)} checks   {fails} FAIL   {warns} WARN")
print("=" * 72)

sys.exit(1 if fails else 0)
