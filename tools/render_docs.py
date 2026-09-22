#!/usr/bin/env python3
"""Regenerate the two derived HTML views from their sources (per REMEDIATION-PLAN 3.5/D3).

- docs/ARCHITECTURE.html: a clean markdown render of docs/ARCHITECTURE.md.
  ```mermaid fences are spliced into live <div class="mermaid"> blocks so the
  existing mermaid.js CDN script renders them client-side.
- essence-one-view.html: NOT regenerated from scratch (hand-crafted layout).
  Only the version badges and the drift-lint check-count stat/footnote are
  templated in place, preserving the existing design.

Run at release time (Phase 8 step 3) or after any docs/ARCHITECTURE.md edit:
    python tools/render_docs.py            # write both files
    python tools/render_docs.py --check    # exit 1 if either file is stale (CI)
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILL_JSON = ROOT / "skill.json"
ARCH_MD = ROOT / "docs" / "ARCHITECTURE.md"
ARCH_HTML = ROOT / "docs" / "ARCHITECTURE.html"
ONE_VIEW = ROOT / "essence-one-view.html"
DRIFT_LINT = ROOT / "tools" / "drift_lint.py"


_SEMVER_RE = re.compile(r"\A\d+\.\d+\.\d+\Z")


def get_version() -> str:
    """Read skill.json's version, rejecting anything that isn't a bare semver.

    The value is interpolated into generated HTML and compared against the
    shipped views, so a malformed or injected value must fail loudly here
    rather than be written out.
    """
    version = json.loads(SKILL_JSON.read_text(encoding="utf-8"))["version"]
    if not isinstance(version, str) or not _SEMVER_RE.match(version):
        raise ValueError(f"skill.json version is not a bare semver: {version!r}")
    return version


def get_drift_lint_check_count() -> int:
    """Run drift_lint.py and parse its 'N checks M FAIL K WARN' summary line."""
    result = subprocess.run(
        [sys.executable, str(DRIFT_LINT)], cwd=ROOT, capture_output=True, text=True
    )
    # drift_lint.py exits non-zero on FAIL, but its summary line is still useful
    # in that case -- only treat a non-zero exit as fatal if we can't parse a count.
    m = re.search(r"^(\d+) checks\s+\d+ FAIL\s+\d+ WARN", result.stdout, re.MULTILINE)
    if not m:
        raise RuntimeError(
            f"could not parse drift_lint.py check count (exit {result.returncode}); "
            f"stdout={result.stdout!r} stderr={result.stderr!r}"
        )
    return int(m.group(1))


ARCH_CSS = """<style>
  :root{--navy-900:#001A3A;--navy-800:#002147;--navy-700:#003B71;--blue-500:#0093D0;
    --blue-300:#5BB5E5;--ink:#0f1b2d;--paper:#f4f8fc;--card:#ffffff;--muted:#5a6b80;--line:#d8e3ef;}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    color:var(--ink);background:var(--paper);line-height:1.6;}
  .wrap{max-width:980px;margin:0 auto;padding:48px 32px 96px;}
  h1{color:var(--navy-800);border-bottom:3px solid var(--blue-500);padding-bottom:12px;}
  h2{color:var(--navy-700);margin-top:48px;border-bottom:1px solid var(--line);padding-bottom:8px;}
  h3{color:var(--navy-700);margin-top:32px;}
  a{color:var(--blue-500);}
  code{background:#eaf1f8;padding:2px 6px;border-radius:4px;font-size:.92em;}
  pre code{display:block;padding:16px;overflow-x:auto;background:#0f1b2d;color:#dbe9f7;border-radius:8px;}
  table{border-collapse:collapse;width:100%;margin:16px 0;}
  th,td{border:1px solid var(--line);padding:8px 12px;text-align:left;vertical-align:top;}
  th{background:var(--navy-800);color:#fff;}
  blockquote{border-left:4px solid var(--blue-300);margin:16px 0;padding:4px 16px;
    background:var(--card);color:var(--muted);}
  .mermaid{background:var(--card);border:1px solid var(--line);border-radius:8px;
    padding:16px;margin:24px 0;}
</style>"""


def render_architecture_html() -> str:
    try:
        import markdown  # local import: keeps this dependency scoped to this script
    except ImportError as exc:
        raise SystemExit(
            "render_docs.py requires the 'markdown' package: pip install markdown"
        ) from exc

    md_text = ARCH_MD.read_text(encoding="utf-8")
    # Normalize CRLF -> LF first: the mermaid-fence regex below matches a literal
    # \n right after the fence marker, so a CRLF-saved file (common on Windows)
    # would otherwise never match and mermaid blocks would render as inert code.
    md_text = md_text.replace("\r\n", "\n")

    # Stash ```mermaid fences as plain-text placeholders (their own paragraph)
    # before conversion, then splice them back in as live <div class="mermaid">
    # blocks -- fenced_code alone would emit <pre><code>, which mermaid.js does
    # not auto-render.
    mermaid_blocks: list[str] = []

    def _stash(m: "re.Match[str]") -> str:
        mermaid_blocks.append(m.group(1))
        return f"\n\nMERMAIDPLACEHOLDER{len(mermaid_blocks) - 1}\n\n"

    md_text = re.sub(r"```mermaid\n(.*?)```", _stash, md_text, flags=re.S)

    body = markdown.markdown(md_text, extensions=["tables", "fenced_code", "toc"])

    for i, block in enumerate(mermaid_blocks):
        body = body.replace(f"<p>MERMAIDPLACEHOLDER{i}</p>", f'<div class="mermaid">{block}</div>')

    version = get_version()
    return (
        "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n"
        "<meta charset=\"utf-8\" />\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n"
        f"<title>ESSENCE — System Architecture (v{version}, Lean Edition)</title>\n"
        "<script src=\"https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js\"></script>\n"
        f"{ARCH_CSS}\n</head>\n<body>\n<div class=\"wrap\">\n{body}\n</div>\n"
        "<script>mermaid.initialize({ startOnLoad: true, theme: \"neutral\" });</script>\n"
        "</body>\n</html>\n"
    )


def render_one_view_html() -> str:
    """Template ONLY the version/stat strings in the existing hand-crafted HTML."""
    html = ONE_VIEW.read_text(encoding="utf-8")
    version = get_version()
    checks = get_drift_lint_check_count()

    # Version badges (eyebrow banner + traceable-response example).
    html = re.sub(r"ESSENCE v\d+\.\d+\.\d+", f"ESSENCE v{version}", html)

    # drift-lint check-count stat card + footnote (was hardcoded "47").
    html = re.sub(
        r'(<div class="stat"><div class="n">)\d+(</div><div class="l">drift-lint checks</div></div>)',
        rf"\g<1>{checks}\g<2>",
        html,
    )
    html = re.sub(r"~\d+ checks · exit 1 on drift", f"~{checks} checks · exit 1 on drift", html)

    return html


def main() -> int:
    check_only = "--check" in sys.argv
    new_arch = render_architecture_html()
    new_one_view = render_one_view_html()

    changed = []
    # A missing derived file (fresh checkout, cleanup) counts as "changed" so it
    # gets (re)created instead of crashing read_text() before we can regenerate it.
    if not ARCH_HTML.exists() or ARCH_HTML.read_text(encoding="utf-8") != new_arch:
        changed.append(str(ARCH_HTML))
    if not ONE_VIEW.exists() or ONE_VIEW.read_text(encoding="utf-8") != new_one_view:
        changed.append(str(ONE_VIEW))

    if check_only:
        if changed:
            print("STALE -- regenerate needed:", ", ".join(changed))
            return 1
        print("Both derived views are up to date.")
        return 0

    if str(ARCH_HTML) in changed:
        ARCH_HTML.write_text(new_arch, encoding="utf-8")
    if str(ONE_VIEW) in changed:
        ONE_VIEW.write_text(new_one_view, encoding="utf-8")
    print("Regenerated:", ", ".join(changed) if changed else "(no changes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
