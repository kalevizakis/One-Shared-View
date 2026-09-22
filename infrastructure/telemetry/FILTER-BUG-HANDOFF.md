# Period Filter Bug — Developer Handoff

> **[RESOLVED 2026-06-04 — sections below are the historical investigation.]**

**Date:** June 4, 2026  
**Status:** Resolved — browser updates from returned HTML payload  
**Priority:** High — filters were non-functional for end users  

---

## Resolution — June 4, 2026

The filter bug had two active causes:

1. `update-server.py` returned `success/output/error` but no usable `html` payload in the browser path because the running server was a stale local Python process started before the source patch.
2. The dashboard refresh used `document.open()` / `document.write()` / `document.close()`, which could replace the execution context and break subsequent clicks.

Fix applied:

- `update-server.py` now reads the refreshed dashboard from `DASHBOARD_PATH`, falling back to `SCRIPT_DIR/essence-token-dashboard.html` for local use.
- `essence-token-dashboard.html` now applies returned HTML with `DOMParser` and `document.body.innerHTML`, preserving the existing JavaScript globals used by inline `onclick` handlers.
- Stale local `update-server.py` Python processes were stopped so `127.0.0.1:4319` routes to the rebuilt updater server.

Verification:

- Integrated browser direct fetch to `http://127.0.0.1:4319/update?period=1w&workspace=all` returned keys `success,html,output,error` with a non-empty HTML payload containing `new DOMParser`.
- Integrated browser regression test changed period `24h` then `1w` consecutively. Both calls returned HTML payloads and the active button updated without page navigation or lost handlers.
- Dashboard copy check: workspace source, deployed host file, and Docker `/dashboard/essence-token-dashboard.html` were byte-identical before runtime refresh. Docker mounts `~/.essence-telemetry` to `/dashboard`; there is no separate baked `/app/essence-token-dashboard.html` runtime copy.

---

## 1. Summary

The period filter buttons (24H, 1 Week, 1 Month, 3 Months, 6 Months, All) on the ESSENCE Token Dashboard do not reliably update the displayed data. The server-side pipeline works correctly — the file on disk is rewritten with the correct period data — but the browser never loads the updated file.

---

## 2. Architecture (see DATA-FLOW-MAP.md §3.17)

```
User clicks "1 Week"
  → JS filterPeriod('1w')
    → fetch('http://127.0.0.1:4319/update?period=1w&workspace=all')
      → update-server.py parses ?period=1w
        → subprocess.run(python update-dashboard.py --period 1w)
          → SQL: WHERE inserted_at >= NOW() - INTERVAL '7 days'
          → Rewrites essence-token-dashboard.html (inside Docker container)
          → Marks <button data-period="1w"> as .active
      → Returns {"success": true, ...}
    → JS calls reloadDashboard() after success
      → Browser should re-read the updated HTML file
```

**The break is at the last step.** The browser does not reliably re-read the file.

---

## 3. What Works (Verified)

| Component | Test | Result |
|---|---|---|
| PostgreSQL queries | `EXPLAIN ANALYZE` on `WHERE inserted_at >= NOW() - INTERVAL '7 days'` | 5ms with `idx_spans_inserted_at` index |
| Server endpoint | `Invoke-WebRequest http://localhost:4319/update?period=1w` | Returns 200, `success: true`, correct data |
| Server endpoint | `Invoke-WebRequest http://localhost:4319/update?period=all` | Returns 200, `success: true`, ~91,341 Cr, 12,209 calls |
| All 6 periods | Tested via PowerShell `Invoke-WebRequest` | All return correct, different values |
| `fetch()` from browser | `page.evaluate(() => fetch('http://127.0.0.1:4319/update?period=3m'))` | Returns 200, `success: true` |
| CORS | Server handles `null` origin (file:// pages) | No CORS errors |
| File write (container→host) | Checked `period-btn active` on disk before/after server call | File IS updated on disk (confirmed `24h` → active after calling `?period=24h`) |
| PRICING dict | Credits-based, all 11 models | `fmt_cost()` returns `~N,NNN Cr` |
| Docker containers | All 4 healthy: postgres, receiver, updater, aspire | Running on correct ports |

---

## 4. What Fails

**The browser reload after a successful server response does not pick up the new file.**

### Attempted reload strategies (all failed):

| Approach | Code | Behavior |
|---|---|---|
| `location.reload()` | Original code | Silently fails on `file://` URIs in VS Code integrated browser |
| `location.replace(url)` | `window.location.replace(url)` | Loads cached version — does not re-read file from disk |
| `fetch + document.write` | `fetch(url, {cache:'no-store'}).then(html => {document.open(); document.write(html); document.close()})` | Replaces DOM but breaks scripts/event listeners; also still reads cached content |
| `location.href = url + '?_=' + Date.now()` | Cache-bust query string | `file://` protocol may try to find a literal file with `?_=` in the name |
| Immediate `reloadDashboard()` (no setTimeout) | Removed 1200ms delay | Reloads before Docker volume sync completes — gets stale file |
| `setTimeout(reloadDashboard, 2000)` | 2-second delay for Docker sync | Active button correct but still shows stale cost data |
| **JSON HTML Payload + DOM Injection** | `applyHtml(data.html)` natively | First click succeeds; subsequent clicks fail (UI "gets stuck" because `document.write` wipes event listeners or drops script context). |

### Root cause hypothesis

Two compounding issues:
1. **Docker bind mount sync lag on Windows.** The container writes to `/dashboard/essence-token-dashboard.html` inside the container. This is bind-mounted to `~/.essence-telemetry/` on the host. Windows Docker Desktop has a known 1-3 second lag for bind mount file sync (especially on non-WSL2 backends).
2. **Browser caching of `file://` URIs.** Both the VS Code integrated browser (Electron webview) and standard browsers aggressively cache `file://` content. Standard HTTP cache-busting techniques (query strings, `cache: 'no-store'`) do not reliably work for `file://`.

---

## 5. Key Files

| File | Location | Role |
|---|---|---|
| Dashboard HTML (source) | `infrastructure/telemetry/essence-token-dashboard.html` | Source of truth for the HTML template |
| Dashboard HTML (deployed) | `~/.essence-telemetry/essence-token-dashboard.html` | Volume-mounted file the browser loads |
| Update script (source) | `infrastructure/telemetry/update-dashboard.py` | Queries DB, rewrites HTML with data |
| Update script (deployed) | `~/.essence-telemetry/update-dashboard.py` | Baked into Docker image at build |
| Update server | `~/.essence-telemetry/update-server.py` | HTTP server on :4319, calls update-dashboard.py via subprocess |
| Docker Compose | `~/.essence-telemetry/docker-compose.yml` | Defines all 4 services |
| Dockerfile | `~/.essence-telemetry/updater.Dockerfile` | Bakes .py files into image — must `docker compose build updater` after changes |
| Data flow docs | `infrastructure/telemetry/DATA-FLOW-MAP.md` | Full pipeline documentation |
| Pricing source | `DASHBOARD_COST_SOURCE.md` (same directory, moved from workspace root 2026-08) | Credit rates per model |

---

## 6. Database Schema (relevant)

```
Table: spans
Key columns: inserted_at (TIMESTAMPTZ), input_tokens, output_tokens, cached_tokens, response_model
Index: idx_spans_inserted_at ON spans (inserted_at)  ← ADDED during this session
Index: idx_spans_workspace_name ON spans ((attributes->>'workspace.name'))
```

The `idx_spans_inserted_at` index was missing and caused all periods except `24h` to time out (full table scan on ~12K rows). **This is now fixed** — the index exists in the DB and the Python script has a self-healing `CREATE INDEX IF NOT EXISTS` on every refresh.

---

## 7. Current State of `reloadDashboard()` (deployed)

```javascript
function reloadDashboard() {
  var url = window.location.href.split('#')[0].split('?')[0];
  fetch(url + '?_=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.text(); })
    .then(function (html) {
      document.open();
      document.write(html);
      document.close();
      window.history.replaceState(null, '', url);
    })
    .catch(function () {
      window.location.href = url + '?_=' + Date.now();
    });
}
```

Called from three places (triggerUpdate, filterPeriod, filterWorkspace) via:
```javascript
setTimeout(reloadDashboard, 2000);
```

---

## 8. Suggested Fix Approaches (Untested)

### Option A: Serve the dashboard over HTTP instead of file://
- Add an nginx or Python `http.server` container that serves the HTML on a port (e.g., `:8080`)
- Browser loads `http://localhost:8080/essence-token-dashboard.html`
- Standard `location.reload()` works reliably over HTTP
- Cache-busting via `?_=timestamp` or `Cache-Control` headers works
- **Pros:** Eliminates both the file:// caching issue and Docker volume sync lag (nginx reads from the same volume)
- **Cons:** Adds one more container

### Option B: Polling-based reload
- After success, poll the file via `fetch` every 500ms checking for a version marker
- The Python updater writes a `data-version="timestamp"` attribute to the HTML
- JS keeps fetching until it sees a new version, then does `document.write`
- **Pros:** Works regardless of sync lag
- **Cons:** More complex JS

### Option C: Server returns the HTML directly
- Instead of writing to a file and reloading, have the server return the full HTML in the JSON response
- JS replaces the page content directly from the response
- **Pros:** No file sync or caching issues at all
- **Cons:** Large JSON responses (~200KB), changes the server API contract

### Option D: WebSocket / Server-Sent Events
- Server pushes a "refresh ready" event after file write completes
- JS listens and reloads only when notified
- **Pros:** Precise timing, no polling
- **Cons:** Significant architecture change

---

## 9. Reproduction Steps

1. Open `~/.essence-telemetry/essence-token-dashboard.html` in VS Code integrated browser
2. Verify current period (look at which button has `.active` class)
3. Click a different period button (e.g., "All")
4. Observe: toast shows "Filtering to all data…" then "Filtered — reloading..."
5. Expected: page reloads with new data (different cost, different call count)
6. Actual: page shows stale data from previous period

To verify the server side works independently:
```powershell
# Before
findstr "period-btn active" "$HOME\.essence-telemetry\essence-token-dashboard.html"
# Call server
Invoke-WebRequest "http://localhost:4319/update?period=all" -UseBasicParsing -TimeoutSec 30
# After — file on disk WILL have changed
findstr "period-btn active" "$HOME\.essence-telemetry\essence-token-dashboard.html"
```

---

## 10. Changes Made During This Session

| Change | File(s) | Status |
|---|---|---|
| Added `idx_spans_inserted_at` index to PostgreSQL | Live DB + update-dashboard.py (self-heal) | ✅ Working |
| Updated PRICING dict to credit-based | update-dashboard.py (source + deployed) | ✅ Working |
| Updated `fmt_cost()` to return `~N,NNN Cr` | update-dashboard.py (source + deployed) | ✅ Working |
| Rebuilt Docker image (`docker compose build updater`) | updater container | ✅ Working |
| Replaced `location.reload()` with `reloadDashboard()` | essence-token-dashboard.html (both copies) | ⚠️ Partially working |
| Adjusted setTimeout delay (1200ms → 0 → 2000ms) | essence-token-dashboard.html (both copies) | ⚠️ Not sufficient |
| Return new HTML in JSON payload (`"html": new_html`) | `update-server.py` | ✅ Working, returns fast |
| Inject HTML directly via `document.write(data.html)` | `essence-token-dashboard.html` | ⚠️ First click works, breaks subsequent clicks |

**Important:** The deployed HTML (`~/.essence-telemetry/`) may have been edited by the user after these changes. Always check current file contents before editing.

---

## 12. Most Recent Unsuccessful Attempt

**Goal:** Bypass the 2-second Docker bind mount lag and `file://` cache completely by having the backend send the fresh HTML instantly in the JSON response, then injecting it via `document.write()`.

**What we did:**
1. Modified `update-server.py`: Read `/app/essence-token-dashboard.html` immediately after `subprocess.run` completes. Append it to `{"success": True, "html": new_html}` JSON payload.
2. Modified `essence-token-dashboard.html`: Added this function:
   ```javascript
   function applyHtml(html) {
     document.open();
     document.write(html);
     document.close();
   }
   ```
3. Modified `triggerUpdate()`, `filterPeriod()`, and `filterWorkspace()` to call `applyHtml(data.html)` immediately instead of waiting for the file via `setTimeout`.
   
**Why it failed:** 
While it perfectly resolved the lag and file caching on the *first* click (the DOM instantly swapped to the correct data), subsequent clicks completely stopped working. The UI gets "stuck". This typically happens because `document.open()`/`document.write()` replaces the entire document, erasing the global execution context, isolating inline scripts, or detaching existing event listeners.

---

## 11. Environment

- **OS:** Windows (not WSL)
- **Docker:** Docker Desktop for Windows
- **VS Code:** Integrated browser (Electron webview) + standard browser support required
- **PostgreSQL:** 16-alpine, port 5433 (host) → 5432 (container)
- **Update server:** Python 3.12, port 4319
- **Dashboard URL:** `file:///<your-home>/.essence-telemetry/essence-token-dashboard.html`
