# ESSENCE release gate — runs drift_lint.py + measure-tokens.py with a
# self-discovering Python interpreter (bare `py`/`python` can 9009-stub on
# OneDrive-synced machines). Exits non-zero if either tool reports a FAIL.
#
# Usage: powershell -File tools/release_check.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent

function Find-Python {
    # Candidates as (Exe, Arg) pairs rather than splittable strings -- a full
    # path candidate (e.g. "C:\Program Files\Python311\python.exe") contains a
    # space of its own, so splitting on the first space would mangle it into
    # an invalid executable ("C:\Program") before Get-Command ever sees it.
    $candidates = @(
        @{ Exe = "py"; Arg = "-3" },
        @{ Exe = "python3"; Arg = $null },
        @{ Exe = "python"; Arg = $null },
        @{ Exe = "C:\Program Files\Python311\python.exe"; Arg = $null }
    )
    foreach ($c in $candidates) {
        $cmd = Get-Command $c.Exe -ErrorAction SilentlyContinue
        if (-not $cmd) { continue }
        try {
            $pyArgs = @()
            if ($c.Arg) { $pyArgs += $c.Arg }
            $pyArgs += "--version"
            $out = & $c.Exe @pyArgs 2>&1
            if ($LASTEXITCODE -eq 0 -and $out -match "Python \d") {
                return $c
            }
        }
        catch {
            continue
        }
    }
    return $null
}

$py = Find-Python
if (-not $py) {
    Write-Error "No working Python interpreter found (tried py -3, python3, python, Python311 full path)."
    exit 1
}
$pyDisplay = if ($py.Arg) { "$($py.Exe) $($py.Arg)" } else { $py.Exe }
Write-Host "Using interpreter: $pyDisplay" -ForegroundColor Cyan

$pyExe = $py.Exe
$pyExtraArg = $py.Arg

function Invoke-Gate($scriptRelPath) {
    $scriptPath = Join-Path $repoRoot $scriptRelPath
    $callArgs = @()
    if ($pyExtraArg) { $callArgs += $pyExtraArg }
    $callArgs += $scriptPath
    Write-Host "`n=== Running $scriptRelPath ===" -ForegroundColor Cyan
    $output = & $pyExe @callArgs 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
    Write-Host $output
    return $exitCode
}

Push-Location $repoRoot
try {
    $lintExit = Invoke-Gate "tools/drift_lint.py"
    $tokenExit = Invoke-Gate "evals/measure-tokens.py"
}
finally {
    Pop-Location
}
Write-Host "`n[gate results] drift_lint exit=$lintExit  measure-tokens exit=$tokenExit" -ForegroundColor DarkGray

if ($lintExit -ne 0 -or $tokenExit -ne 0) {
    Write-Host "`nRELEASE GATE: FAIL (drift_lint exit=$lintExit, measure-tokens exit=$tokenExit)" -ForegroundColor Red
    exit 1
}
Write-Host "`nRELEASE GATE: PASS" -ForegroundColor Green
exit 0
