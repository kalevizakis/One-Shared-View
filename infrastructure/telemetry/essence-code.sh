#!/usr/bin/env bash
#
# essence-code — launch VS Code with a per-workspace telemetry tag.
#
# Stamps OTEL_RESOURCE_ATTRIBUTES=workspace.name=<folder> onto the VS Code
# process so every Copilot span is attributed to this workspace in the
# ESSENCE Token Dashboard ("Cost per Workspace" panel).
#
# Usage:
#   essence-code                 # tag = current folder name, opens "."
#   essence-code /path/to/repo   # tag = "repo", opens that folder
#   essence-code . my-label      # override the tag explicitly
#
# Single-instance caveat: VS Code reuses one background process and reads the
# tag when that process FIRST starts. For the tag to take effect, launch a
# fresh VS Code (no other window open) or run after fully quitting VS Code.
# Windows opened from an already-running instance inherit the original tag.
# The dashboard reports the % of cost attributed, so untagged windows are
# never silently misrepresented.
#
set -euo pipefail

TARGET="${1:-.}"
LABEL="${2:-}"

if [ ! -e "$TARGET" ]; then
  echo "Path not found: $TARGET" >&2
  exit 1
fi

FULL="$(cd "$TARGET" 2>/dev/null && pwd)"
if [ -z "$FULL" ]; then
  echo "Could not resolve path: $TARGET" >&2
  exit 1
fi

if [ -z "$LABEL" ]; then
  LABEL="$(basename "$FULL")"
fi

# Sanitize: OTEL resource attribute values must not contain '=' or ','.
LABEL="${LABEL//=/-}"
LABEL="${LABEL//,/-}"

# Preserve other resource attributes, drop any existing workspace.name.
EXISTING="${OTEL_RESOURCE_ATTRIBUTES:-}"
KEPT=""
if [ -n "$EXISTING" ]; then
  IFS=',' read -ra PARTS <<< "$EXISTING"
  for p in "${PARTS[@]}"; do
    case "$p" in
      workspace.name=*|" workspace.name="*) ;;  # drop
      "") ;;
      *) KEPT="${KEPT:+$KEPT,}$p" ;;
    esac
  done
fi
export OTEL_RESOURCE_ATTRIBUTES="${KEPT:+$KEPT,}workspace.name=$LABEL"

echo "Launching VS Code  ->  workspace.name=$LABEL"
echo "  $FULL"

code "$FULL"
