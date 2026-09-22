-- ESSENCE Telemetry Schema
-- Stores OTLP spans from VS Code Copilot with full attribute fidelity

CREATE TABLE IF NOT EXISTS spans (
    id              SERIAL PRIMARY KEY,
    span_id         TEXT NOT NULL,
    trace_id        TEXT NOT NULL,
    parent_span_id  TEXT,
    name            TEXT,
    start_time_ms   BIGINT,
    end_time_ms     BIGINT,
    status_code     INTEGER,
    status_message  TEXT,
    -- Gen AI semantic conventions
    operation_name  TEXT,
    provider_name   TEXT,
    agent_name      TEXT,
    request_model   TEXT,
    response_model  TEXT,
    -- Token usage (including cache breakdown)
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    cached_tokens   INTEGER,
    cache_creation_tokens INTEGER,
    reasoning_tokens INTEGER,
    -- Tool info
    tool_name       TEXT,
    tool_call_id    TEXT,
    tool_type       TEXT,
    -- Session info
    chat_session_id TEXT,
    conversation_id TEXT,
    turn_index      INTEGER,
    -- Performance
    ttft_ms         REAL,
    duration_ms     REAL,
    -- Finish reason
    finish_reasons  TEXT,
    -- github.copilot.* canonical namespace (VS Code 1.122+)
    agent_type      TEXT,
    git_repository  TEXT,
    git_branch      TEXT,
    github_org      TEXT,
    tool_edit_type  TEXT,
    tool_skill_name TEXT,
    hook_decision   TEXT,
    hook_duration_s REAL,
    -- Full attributes as JSONB for anything not in named columns
    attributes      JSONB,
    -- Timestamps
    inserted_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(span_id, trace_id)
);

CREATE INDEX IF NOT EXISTS idx_spans_trace ON spans(trace_id);
CREATE INDEX IF NOT EXISTS idx_spans_time ON spans(start_time_ms);
CREATE INDEX IF NOT EXISTS idx_spans_model ON spans(response_model);
CREATE INDEX IF NOT EXISTS idx_spans_agent ON spans(agent_name);
CREATE INDEX IF NOT EXISTS idx_spans_session ON spans(chat_session_id);

-- Idempotent migration for databases created before the github.copilot.* columns
-- existed. No-op on fresh installs (columns already present above) and on volumes
-- that have already been migrated. The receiver also applies these at first write.
ALTER TABLE spans ADD COLUMN IF NOT EXISTS agent_type      TEXT;
ALTER TABLE spans ADD COLUMN IF NOT EXISTS git_repository  TEXT;
ALTER TABLE spans ADD COLUMN IF NOT EXISTS git_branch      TEXT;
ALTER TABLE spans ADD COLUMN IF NOT EXISTS github_org      TEXT;
ALTER TABLE spans ADD COLUMN IF NOT EXISTS tool_edit_type  TEXT;
ALTER TABLE spans ADD COLUMN IF NOT EXISTS tool_skill_name TEXT;
ALTER TABLE spans ADD COLUMN IF NOT EXISTS hook_decision   TEXT;
ALTER TABLE spans ADD COLUMN IF NOT EXISTS hook_duration_s REAL;
CREATE INDEX IF NOT EXISTS idx_spans_agent_type ON spans(agent_type);
CREATE INDEX IF NOT EXISTS idx_spans_git_repo ON spans(git_repository);

-- View for dashboard queries
CREATE OR REPLACE VIEW token_summary AS
SELECT
    response_model,
    COUNT(*) as call_count,
    SUM(input_tokens) as total_input,
    SUM(output_tokens) as total_output,
    SUM(cached_tokens) as total_cached,
    SUM(cache_creation_tokens) as total_cache_creation,
    SUM(input_tokens + output_tokens) as total_tokens,
    AVG(ttft_ms) as avg_ttft_ms,
    AVG(duration_ms) as avg_duration_ms
FROM spans
WHERE input_tokens IS NOT NULL AND input_tokens > 0
GROUP BY response_model;
