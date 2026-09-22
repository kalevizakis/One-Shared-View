<#
  essence-code — launch VS Code with a per-workspace telemetry tag.

  Stamps OTEL_RESOURCE_ATTRIBUTES=workspace.name=<folder> onto the VS Code
  process so every Copilot span is attributed to this workspace in the
  ESSENCE Token Dashboard ("Cost per Workspace" panel).

  Usage:
    essence-code                 # tag = current folder name, opens "."
    essence-code C:\path\to\repo # tag = "repo", opens that folder
    essence-code . my-label      # override the tag explicitly

  IMPORTANT (Windows single-instance caveat):
    VS Code reuses one background process. The tag is read when that process
    FIRST starts, so for the tag to take effect this should launch a fresh
    VS Code (no other VS Code window already open), or run after fully quitting
    VS Code. Windows opened later from an already-running instance inherit the
    tag of whichever instance started the background process. The dashboard
    panel reports the % of cost that is attributed, so untagged windows are
    never silently misrepresented.
#>
param(
    [string]$Path = ".",
    [string]$Label = ""
)

$ErrorActionPreference = "Stop"

# Resolve the target folder to an absolute path.
$resolved = Resolve-Path -LiteralPath $Path -ErrorAction SilentlyContinue
if (-not $resolved) {
    Write-Error "Path not found: $Path"
    exit 1
}
$full = $resolved.Path

# Derive the workspace label from the leaf folder name unless overridden.
if ([string]::IsNullOrWhiteSpace($Label)) {
    $Label = Split-Path -Leaf $full
}

# Sanitize: OTEL resource attribute values must not contain '=' or ','.
$Label = $Label -replace '[=,]', '-'

# Preserve any other resource attributes the user already set, then set/replace
# workspace.name for this launch.
$existing = $env:OTEL_RESOURCE_ATTRIBUTES
$pairs = @()
if (-not [string]::IsNullOrWhiteSpace($existing)) {
    $pairs = @($existing.Split(',') | Where-Object { $_ -and ($_ -notmatch '^\s*workspace\.name\s*=') })
}
$pairs += "workspace.name=$Label"
$env:OTEL_RESOURCE_ATTRIBUTES = ($pairs -join ',')

Write-Host "Launching VS Code  ->  workspace.name=$Label" -ForegroundColor Cyan
Write-Host "  $full" -ForegroundColor DarkGray

# Launch VS Code; it inherits the env var set above.
& code $full
