#!/usr/bin/env python3
"""
ESSENCE token-budget harness  (finding-H verifier)
===================================================
Turns the efficacy numbers printed in SKILL.md into a re-runnable, deterministic
measurement instead of an unverifiable assertion.

Background
----------
SKILL.md claims a token budget for the two-tier loader, e.g.:
    agent/essence.agent.md     ~3,900 text tokens   (always-on lean core)
    agent/essence.playbook.md  ~4,900 text tokens   (auto-loaded on demand)

Finding H was that earlier efficacy figures (e.g. "~47% saving / ~2,368 vs
~4,500") were never measured against the shipped files and had drifted into
fiction. This harness measures the *actual* files and fails if the number
printed in SKILL.md no longer matches reality within tolerance, so the claim
can never silently rot again.

Canonical estimator
-------------------
A BPE tokenizer (tiktoken cl100k_base) is the gold standard, but it is an
optional, environment-dependent dependency. To keep CI reproducible on any
machine, the *canonical* estimate is the chars/4 heuristic, which approximates
cl100k for English prose + markdown to within ~10-15%. When tiktoken happens to
be installed it is printed as an informational second column only -- it never
drives the pass/fail decision.

Exit code: 0 if every claim is within TOLERANCE of its measured estimate, else 1.
"""
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AGENT = ROOT / "agent" / "essence.agent.md"
PLAYBOOK = ROOT / "agent" / "essence.playbook.md"
SKILL = ROOT / "SKILL.md"
ARCH_DOC = ROOT / "docs" / "ARCHITECTURE.md"

# How far the SKILL.md claim may sit from the measured chars/4 estimate before
# it counts as drift. chars/4 vs a real BPE tokenizer diverges by ~10-15%, and
# the claims are rounded to the nearest hundred, so 15% is the honest band.
TOLERANCE = 0.15

# Which shipped file each claim is supposed to describe.
TARGETS = [
    ("lean core", AGENT, r"essence\.agent\.md"),
    ("playbook", PLAYBOOK, r"essence\.playbook\.md"),
]

# L3: docs/ARCHITECTURE.md repeats the same '~N,NNN text tokens' claims in its
# own prose (Runtime Core file table). Same finding-H logic, second location --
# a claim can drift here even after SKILL.md is fixed, so both are verified.
CLAIM_SOURCES = [
    ("SKILL.md", SKILL),
    ("docs/ARCHITECTURE.md", ARCH_DOC),
]


def estimate_tokens(text: str) -> int:
    """Canonical, deterministic, dependency-free token estimate."""
    return round(len(text) / 4)


def tiktoken_tokens(text: str):
    """Informational only -- returns None when tiktoken is unavailable."""
    try:
        import tiktoken
    except Exception:
        return None
    try:
        return len(tiktoken.get_encoding("cl100k_base").encode(text))
    except Exception:
        return None


def claimed_tokens(skill_text: str, file_pattern: str):
    """Pull the '~N,NNN text tokens' figure SKILL.md prints for a given file.

    The gap between filename and figure must not cross another 'essence.' file
    reference, otherwise a deleted claim would silently borrow its neighbour's
    number (e.g. the lean-core claim picking up the playbook's figure).
    """
    m = re.search(
        file_pattern + r"(?:(?!essence\.).){0,160}?~\s*([\d,]+)\s*text tokens",
        skill_text,
        re.S,
    )
    if not m:
        return None
    return int(m.group(1).replace(",", ""))


def _evaluate_claim(claim, measured, source_label):
    """Compare a token claim (from the given source file) against its measured
    estimate."""
    if claim is None:
        return "FAIL", f"no '~N text tokens' claim found in {source_label}", True
    drift = abs(claim - measured) / measured
    if drift <= TOLERANCE:
        return "PASS", f"claim {claim:,} vs measured {measured:,}  (drift {drift:.0%})", False
    return "FAIL", f"claim {claim:,} vs measured {measured:,}  (drift {drift:.0%})", True


def _print_report(rows, failures):
    """Print the token-budget report table."""
    width = 72
    print("=" * width)
    print("ESSENCE token-budget harness  (canonical estimator: chars/4)")
    print("=" * width)
    has_bpe = any(r[4] is not None for r in rows)
    head = f"{'file':<26}{'measured':>10}"
    if has_bpe:
        head += f"{'bpe':>9}"
    head += f"{'claim':>9}"
    print(head)
    print("-" * width)
    for status, label, name, measured, bpe, claim, detail in rows:
        line = f"{name:<26}{measured:>10,}"
        if has_bpe:
            line += f"{(bpe if bpe is not None else 0):>9,}"
        line += f"{(claim if claim is not None else 0):>9,}"
        print(line)
        print(f"  [{status}] {label}: {detail}")
    print("-" * width)
    if not has_bpe:
        print("note: tiktoken not installed -- 'bpe' column hidden, chars/4 is "
              "authoritative")
    print(f"{len(rows)} budget claims   {failures} FAIL   "
          f"(tolerance +/-{int(TOLERANCE*100)}%)")
    print("=" * width)


def main() -> int:
    for p in (AGENT, PLAYBOOK, SKILL, ARCH_DOC):
        if not p.exists():
            print(f"[FAIL] missing required file: {p}")
            return 1

    rows = []
    failures = 0

    for source_label, source_path in CLAIM_SOURCES:
        source_text = source_path.read_text(encoding="utf-8")
        for label, path, pattern in TARGETS:
            text = path.read_text(encoding="utf-8")
            measured = estimate_tokens(text)
            bpe = tiktoken_tokens(text)
            claim = claimed_tokens(source_text, pattern)
            status, detail, failed = _evaluate_claim(claim, measured, source_label)
            if failed:
                failures += 1
            rows.append((status, f"{label} ({source_label})", path.name, measured, bpe, claim, detail))

    _print_report(rows, failures)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
