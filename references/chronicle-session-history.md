---
file: chronicle-session-history.md
persona: Cross-cutting (Chronicle)
version: 2.8.0
last_updated: 2026-08-11
changelog: 2.8.0
---

# Chronicle — Session History & Continuity

> **VS Code only** — on other hosts, note "Chronicle: n/a" once and skip this file's protocol.

> **Persona:** cross | **Load when:** Session start continuity, "what did I work on?", debugging repeat failures, standup reports, searching past sessions

Chronicle is VS Code's built-in session history store — a local SQLite database that automatically records chat sessions, conversation turns, files touched, and external references (PRs, issues, commits). It is accessed via the `session_store_sql` tool.

---

## Schema

```
TABLES[6]{table,columns,notes}:
sessions,"id TEXT PK, cwd, repository, host_type, branch, summary, agent_name, agent_description, created_at, updated_at","One row per chat session"
turns,"id INTEGER PK, session_id FK, turn_index, user_message, assistant_response, timestamp","Capped: user 1K chars, assistant 5K chars"
session_files,"id INTEGER PK, session_id FK, file_path, tool_name, turn_index, first_seen_at","Files touched via tool calls (read/edit/create)"
session_refs,"id INTEGER PK, session_id FK, ref_type, ref_value, turn_index, created_at","PR numbers, issue numbers, commit SHAs"
checkpoints,"id INTEGER PK, session_id FK, checkpoint_number, title, overview, history, work_done, technical_details, important_files, next_steps, created_at","Session checkpoints with structured context"
search_index,"FTS5 virtual table: content, session_id, source_type, source_id","Full-text search across all session data"
```

---

## Query Patterns

### Session continuity (first turn)
```sql
-- Last session in this workspace/repo
SELECT s.id, s.summary, s.branch, s.updated_at,
       GROUP_CONCAT(sf.file_path, ', ') as files
FROM sessions s
LEFT JOIN session_files sf ON sf.session_id = s.id
WHERE s.repository LIKE '%repo-name%'
ORDER BY s.updated_at DESC
LIMIT 1;
```

### Standup (last 24h)
```sql
SELECT s.id, s.summary, s.branch, s.repository, s.updated_at
FROM sessions s
WHERE s.updated_at >= datetime('now', '-1 day')
ORDER BY s.updated_at DESC;
```

### Search by keyword (FTS5)
```sql
SELECT s.id, s.summary, si.content
FROM search_index si
JOIN sessions s ON s.id = si.session_id
WHERE si.content MATCH 'keyword'
ORDER BY s.updated_at DESC
LIMIT 5;
```

### Files worked on recently
```sql
SELECT sf.file_path, COUNT(*) as sessions_count,
       MAX(sf.first_seen_at) as last_touched
FROM session_files sf
GROUP BY sf.file_path
ORDER BY last_touched DESC
LIMIT 20;
```

### Find sessions that touched a specific file
```sql
SELECT s.id, s.summary, s.branch, sf.tool_name, s.updated_at
FROM session_files sf
JOIN sessions s ON s.id = sf.session_id
WHERE sf.file_path LIKE '%filename%'
ORDER BY s.updated_at DESC;
```

### PR/issue references
```sql
SELECT s.id, s.summary, sr.ref_type, sr.ref_value
FROM session_refs sr
JOIN sessions s ON s.id = sr.session_id
WHERE sr.ref_type = 'pr' -- or 'issue', 'commit'
ORDER BY sr.created_at DESC;
```

---

## When to Query Chronicle

| Trigger | Action |
|---------|--------|
| **Session first turn (gated)** | Query last session in this workspace for continuity context — only when the request has workspace/codebase grounding (Non-Negotiable #3); skip for a standalone, no-context request |
| **User asks "what did I work on?"** | Standup query (last 24h or custom range) |
| **Debugging a repeat failure** | FTS5 search for the error message across all sessions |
| **"Have we done this before?"** | FTS5 search for the topic/pattern |
| **Before writing R#5 memory** | Check if Chronicle already has relevant session history — avoid duplicating raw facts; R#5 should add curated insight on top |
| **Resuming multi-day work** | Query sessions by branch or repo to reconstruct timeline |

---

## Chronicle vs R#5 Memory

```
COMPARISON[2]{aspect,chronicle,r5_memory}:
"What it stores","Raw session transcripts, file paths, tool calls, timestamps (automatic)","Curated decisions, learnings, patterns, errors (manual)"
"Best for","'What happened?' — finding, resuming, searching history","'What matters?' — preserving hard-won insights across sessions"
```

They are complementary. Chronicle is the automatic breadcrumb trail; R#5 distills the important bits. Use Chronicle to find raw context, then R#5 to record the insight.

---

## Tool Reference

- **Tool:** `session_store_sql`
- **Actions:** `query` (SQL), `standup` (pre-built last-24h report), `reindex` (rebuild index)
- **SQL dialect:** SQLite — use `datetime('now', '-1 day')` for date math, FTS5 `MATCH` for text search
- **Read-only:** Only SELECT and WITH statements allowed
- **Slash commands:** `/chronicle:standup`, `/chronicle:search`, `/chronicle:tips`, `/chronicle:cost-tips`, `/chronicle:reindex`
- **Session sync (VS Code 1.123+):** Sessions now sync automatically to GitHub account, making Chronicle history available cross-machine and cross-workspace. The `session_store_sql` tool queries the local replica; cloud sync keeps it populated even after switching machines.
