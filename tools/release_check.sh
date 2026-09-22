#!/usr/bin/env bash
# ESSENCE release gate — runs drift_lint.py + measure-tokens.py with a
# self-discovering Python interpreter. Exits non-zero if either tool FAILs.
#
# Usage: bash tools/release_check.sh
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

find_python() {
    for candidate in "py -3" "python3" "python"; do
        # shellcheck disable=SC2086
        if command -v ${candidate%% *} >/dev/null 2>&1 && $candidate --version >/dev/null 2>&1; then
            echo "$candidate"
            return 0
        fi
    done
    return 1
}

PY="$(find_python || true)"
if [[ -z "$PY" ]]; then
    echo "No working Python interpreter found (tried py -3, python3, python)." >&2
    exit 1
fi
echo "Using interpreter: $PY"

cd "$repo_root"

set +e
$PY tools/drift_lint.py
lint_exit=$?
$PY evals/measure-tokens.py
token_exit=$?
set -e

if [[ "$lint_exit" -ne 0 ]] || [[ "$token_exit" -ne 0 ]]; then
    echo ""
    echo "RELEASE GATE: FAIL (drift_lint exit=$lint_exit, measure-tokens exit=$token_exit)"
    exit 1
fi
echo ""
echo "RELEASE GATE: PASS"
exit 0
