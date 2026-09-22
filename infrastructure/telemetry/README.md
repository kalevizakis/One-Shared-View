# ESSENCE Token Dashboard — Telemetry Pipeline

Full-stack observability pipeline for tracking VS Code Copilot token usage, costs, cache efficiency, and performance.

## Architecture

```
VS Code (OTLP) → Receiver (Flask :4318) → PostgreSQL (:5433)
                       ↓                        ↑
                  Aspire Dashboard (:18888)   Updater (:4319)
                                                 ↓
                                         HTML Dashboard (static file)
```

## Quick Start

```bash
python infrastructure/telemetry/setup.py
```

This will:

1. Copy pipeline files to `~/.essence-telemetry/`
2. Start 4 Docker containers
3. Configure VS Code OTLP settings
4. Open the dashboard in your browser

## Sync (after version updates)

```bash
python infrastructure/telemetry/setup.py --sync
```

Hash-compares each source file against the deployed copy, copies only what changed, and recreates the updater container if its code was updated. Use this after pulling a new ESSENCE version instead of re-running full setup.

## Workspace Tagging (per-project cost attribution)

The dashboard's V16 panel shows cost per workspace. For spans to be attributed, VS Code must be launched with the `essence-code` command:

```bash
# Install the launcher to your PATH (one-time)
python infrastructure/telemetry/setup.py --install-launcher

# Then launch VS Code with a workspace tag
essence-code C:\path\to\my-project
```

This sets `OTEL_RESOURCE_ATTRIBUTES=workspace.name=<folder>` on the VS Code process. Windows caveat: VS Code reuses one background process, so quit fully before launching with a new tag.

## Manual Setup

```bash
cd ~/.essence-telemetry
docker compose up -d --build
```

## Services

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5433 | Span storage |
| Receiver | 4318 | OTLP HTTP endpoint |
| Aspire | 18888 | Real-time trace viewer |
| Updater | 4319 | Dashboard refresh server |

## VS Code Settings

```json
{
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.otlpEndpoint": "http://localhost:4318",
  "github.copilot.chat.otel.captureContent": false,
  "github.copilot.chat.otel.dbSpanExporter.enabled": true
}
```

## Uninstall

```bash
python infrastructure/telemetry/setup.py --uninstall
```

## Per-Workspace Cost Attribution

The dashboard's **Cost per Workspace** panel groups token cost by the VS Code
workspace that produced it. VS Code does not emit a workspace identifier on its
own, so you tag each window with the `essence-code` launcher, which sets the
standard `OTEL_RESOURCE_ATTRIBUTES=workspace.name=<folder>` environment variable.
The receiver captures that resource attribute and stores it on every span.

### Usage

```powershell
# Windows (PowerShell)
.\infrastructure\telemetry\essence-code.ps1            # tag = current folder name
.\infrastructure\telemetry\essence-code.ps1 C:\repos\my-app
.\infrastructure\telemetry\essence-code.ps1 . my-label # explicit tag
```

```bash
# macOS / Linux
./infrastructure/telemetry/essence-code.sh            # tag = current folder name
./infrastructure/telemetry/essence-code.sh ~/repos/my-app
./infrastructure/telemetry/essence-code.sh . my-label # explicit tag
```

For convenience, put the script on your `PATH` (or alias it to `essence-code`)
so you can run `essence-code .` from any project.

### Single-instance caveat (read this)

VS Code reuses one background process and reads `OTEL_RESOURCE_ATTRIBUTES` when
that process **first starts**. For the tag to take effect, launch a fresh VS
Code (no other window already open) or run after fully quitting VS Code. Windows
opened from an already-running instance inherit the tag of whichever instance
started the background process.

Because coverage is therefore partial in mixed sessions, the panel shows an
explicit **`(untagged)`** row and a caption reporting the **% of cost
attributed** to a named workspace — untagged spans (old data, or windows
launched without `essence-code`) are never silently hidden or misattributed.
