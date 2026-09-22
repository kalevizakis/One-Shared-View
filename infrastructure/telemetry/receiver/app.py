"""
ESSENCE OTLP Receiver — receives OTLP HTTP, stores in PostgreSQL, forwards to Aspire.

Endpoints:
  POST /v1/traces  — receives trace spans (protobuf or JSON)
  POST /v1/logs    — receives log records
  GET  /api/health — health check
  GET  /api/spans  — query spans as JSON (for dashboard)
"""

import os
import json
import time
import hmac
import logging
from datetime import datetime, timezone

from flask import Flask, request, jsonify, Response
import psycopg2
import psycopg2.extras
import requests

# Protobuf imports for OTLP parsing
from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import ExportTraceServiceRequest
from opentelemetry.proto.collector.logs.v1.logs_service_pb2 import ExportLogsServiceRequest
from google.protobuf.json_format import MessageToDict

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

# Config
ASPIRE_OTLP_URL = os.environ.get('ASPIRE_OTLP_URL', 'http://aspire:18890')
DB_HOST = os.environ.get('DB_HOST', 'postgres')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_NAME = os.environ.get('DB_NAME', 'essence_telemetry')
DB_USER = os.environ.get('DB_USER', 'essence')
DB_PASS = os.environ['DB_PASS']  # Required — no hardcoded default
RECEIVER_TOKEN = os.environ.get('ESSENCE_RECEIVER_TOKEN')  # optional bearer token for read endpoints
_ALLOWED_HOSTS = {'localhost', '127.0.0.1', '::1'}


def _host_without_port(raw_host):
    """Strip the port from a Host header value, handling bracketed IPv6 literals."""
    raw_host = (raw_host or '').strip().lower()
    if raw_host.startswith('['):
        end = raw_host.find(']')
        return raw_host[1:end] if end != -1 else raw_host
    return raw_host.split(':', 1)[0]


@app.before_request
def _restrict_to_loopback():
    """Reject requests whose Host header isn't localhost/127.0.0.1 (DNS-rebinding guard).

    The server already binds to 127.0.0.1 only; this closes the one realistic
    residual vector — a browser tab resolving an attacker-controlled hostname to
    127.0.0.1 and issuing same-origin requests against it. Comparison is
    case-insensitive and handles bracketed IPv6 loopback (e.g. "[::1]:4318").
    """
    host = _host_without_port(request.host)
    if host not in _ALLOWED_HOSTS:
        return jsonify({'error': 'Forbidden host'}), 403


@app.before_request
def _require_bearer_token_for_reads():
    """If ESSENCE_RECEIVER_TOKEN is set, require it on the two read (GET) endpoints.

    The POST /v1/traces ingest path stays tokenless — VS Code's OTLP exporter has
    no way to send a custom Authorization header, so gating it would break ingest.
    Unset (default): behavior is unchanged from before this check existed.
    """
    if not RECEIVER_TOKEN:
        return None
    if request.path not in ('/api/spans', '/api/summary'):
        return None
    auth = request.headers.get('Authorization', '')
    scheme, _, token = auth.partition(' ')
    # RFC 6750: the auth-scheme token is case-insensitive.
    if scheme.lower() != 'bearer' or not hmac.compare_digest(token.strip(), RECEIVER_TOKEN):
        return jsonify({'error': 'Unauthorized'}), 401
    return None

# Gen AI attribute keys we extract into named columns
GEN_AI_KEYS = {
    'gen_ai.operation.name': 'operation_name',
    'gen_ai.system': 'provider_name',
    'gen_ai.agent.name': 'agent_name',
    'gen_ai.request.model': 'request_model',
    'gen_ai.response.model': 'response_model',
    'gen_ai.usage.input_tokens': 'input_tokens',
    'gen_ai.usage.output_tokens': 'output_tokens',
    'gen_ai.usage.cached_tokens': 'cached_tokens',
    'gen_ai.usage.cache_read.input_tokens': 'cached_tokens',
    'gen_ai.usage.cache_creation.input_tokens': 'cache_creation_tokens',
    'gen_ai.usage.cache_creation_input_tokens': 'cache_creation_tokens',
    'gen_ai.usage.reasoning_tokens': 'reasoning_tokens',
    'gen_ai.usage.reasoning.output_tokens': 'reasoning_tokens',  # VS Code 1.122+ preferred spelling
    'gen_ai.tool.name': 'tool_name',
    'gen_ai.tool.call.id': 'tool_call_id',
    'gen_ai.tool.type': 'tool_type',
    'gen_ai.chat.session_id': 'chat_session_id',
    'gen_ai.conversation.id': 'conversation_id',
    'gen_ai.turn.index': 'turn_index',
    'gen_ai.response.finish_reasons': 'finish_reasons',
    'gen_ai.client.operation.duration': 'duration_ms',
    'gen_ai.server.time_to_first_token': 'ttft_ms',
    'copilot_chat.time_to_first_token': 'ttft_ms',
    # github.copilot.* canonical namespace (VS Code 1.122+, dual-emitted alongside gen_ai.*/copilot_chat.*)
    'github.copilot.agent.type': 'agent_type',
    'github.copilot.git.repository': 'git_repository',
    'github.copilot.git.branch': 'git_branch',
    'github.copilot.github.org': 'github_org',
    'github.copilot.tool.parameters.edit_type': 'tool_edit_type',
    'github.copilot.tool.parameters.skill_name': 'tool_skill_name',
    'github.copilot.hook.decision': 'hook_decision',
    'github.copilot.hook.duration': 'hook_duration_s',
}

# Columns added after the original schema shipped. Applied idempotently to existing
# databases at first write so deployments upgrade without a volume reset.
_NEW_COLUMNS = [
    ('agent_type', 'TEXT'),
    ('git_repository', 'TEXT'),
    ('git_branch', 'TEXT'),
    ('github_org', 'TEXT'),
    ('tool_edit_type', 'TEXT'),
    ('tool_skill_name', 'TEXT'),
    ('hook_decision', 'TEXT'),
    ('hook_duration_s', 'REAL'),
]
_schema_migrated = False

# Extracted constant to avoid duplicate string literals (SonarQube S1192)
CONTENT_TYPE_JSON = 'application/json'


def migrate_schema(conn):
    """Idempotently add github.copilot.* named columns to an existing database.

    Safe to call repeatedly: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
    are no-ops once applied. Runs lazily on first write so it never blocks import
    or fails when the DB is briefly unreachable at startup.
    """
    global _schema_migrated
    if _schema_migrated:
        return
    ddl = [f"ALTER TABLE spans ADD COLUMN IF NOT EXISTS {name} {sqltype}"
           for name, sqltype in _NEW_COLUMNS]
    ddl += [
        "CREATE INDEX IF NOT EXISTS idx_spans_agent_type ON spans(agent_type)",
        "CREATE INDEX IF NOT EXISTS idx_spans_git_repo ON spans(git_repository)",
    ]
    cur = conn.cursor()
    for stmt in ddl:
        try:
            cur.execute(stmt)
        except Exception as e:
            logger.warning(f"Schema migration step skipped: {e}")
    cur.close()
    _schema_migrated = True
    logger.info("Schema migration check complete (github.copilot.* columns)")


def get_db():
    """Get a database connection with retry."""
    for attempt in range(5):
        try:
            conn = psycopg2.connect(
                host=DB_HOST, port=DB_PORT,
                dbname=DB_NAME, user=DB_USER, password=DB_PASS
            )
            conn.autocommit = True
            return conn
        except psycopg2.OperationalError:
            if attempt < 4:
                time.sleep(2)
            else:
                raise


def extract_attr_value(attr):
    """Extract value from an OTLP attribute dict."""
    if 'stringValue' in attr.get('value', {}):
        return attr['value']['stringValue']
    if 'intValue' in attr.get('value', {}):
        return int(attr['value']['intValue'])
    if 'doubleValue' in attr.get('value', {}):
        return float(attr['value']['doubleValue'])
    if 'boolValue' in attr.get('value', {}):
        return attr['value']['boolValue']
    if 'arrayValue' in attr.get('value', {}):
        vals = attr['value']['arrayValue'].get('values', [])
        return json.dumps([extract_attr_value({'value': v}) for v in vals])
    return str(attr.get('value', ''))


def _extract_resource_attrs(resource_spans):
    """Extract resource-level attributes from an OTLP resource_spans entry."""
    resource_attrs = {}
    for attr in resource_spans.get('resource', {}).get('attributes', []):
        resource_attrs[attr.get('key', '')] = extract_attr_value(attr)
    return resource_attrs


def _build_span_row(span, resource_attrs):
    """Build a database row dict from a single OTLP span and its resource attributes."""
    # Seed with resource attrs; span-level attrs override on collision.
    attrs = dict(resource_attrs)
    named_cols = {}

    for attr in span.get('attributes', []):
        key = attr.get('key', '')
        val = extract_attr_value(attr)
        attrs[key] = val

        if key in GEN_AI_KEYS:
            col = GEN_AI_KEYS[key]
            named_cols[col] = val

    # Convert timestamps (nanoseconds to milliseconds)
    start_ns = int(span.get('startTimeUnixNano', 0))
    end_ns = int(span.get('endTimeUnixNano', 0))

    row = {
        'span_id': span.get('spanId', ''),
        'trace_id': span.get('traceId', ''),
        'parent_span_id': span.get('parentSpanId', ''),
        'name': span.get('name', ''),
        'start_time_ms': start_ns // 1_000_000 if start_ns else None,
        'end_time_ms': end_ns // 1_000_000 if end_ns else None,
        'status_code': span.get('status', {}).get('code', 0),
        'status_message': span.get('status', {}).get('message', ''),
        'attributes': json.dumps(attrs),
    }
    row.update(named_cols)
    return row


def parse_spans_from_dict(data):
    """Parse spans from OTLP JSON dict format."""
    spans_to_insert = []

    for resource_spans in data.get('resourceSpans', []):
        # Resource-level attributes (e.g. service.name, workspace.name) are
        # stamped once per exporter and apply to every span in this group.
        # Capture them so per-workspace/per-service attribution is possible.
        resource_attrs = _extract_resource_attrs(resource_spans)

        for scope_spans in resource_spans.get('scopeSpans', []):
            for span in scope_spans.get('spans', []):
                spans_to_insert.append(_build_span_row(span, resource_attrs))

    return spans_to_insert


def store_spans(spans):
    """Insert spans into PostgreSQL, skipping duplicates."""
    if not spans:
        return 0

    conn = get_db()
    migrate_schema(conn)
    cur = conn.cursor()
    inserted = 0

    cols = [
        'span_id', 'trace_id', 'parent_span_id', 'name',
        'start_time_ms', 'end_time_ms', 'status_code', 'status_message',
        'operation_name', 'provider_name', 'agent_name',
        'request_model', 'response_model',
        'input_tokens', 'output_tokens', 'cached_tokens',
        'cache_creation_tokens', 'reasoning_tokens',
        'tool_name', 'tool_call_id', 'tool_type',
        'chat_session_id', 'conversation_id', 'turn_index',
        'ttft_ms', 'duration_ms', 'finish_reasons',
        'agent_type', 'git_repository', 'git_branch', 'github_org',
        'tool_edit_type', 'tool_skill_name', 'hook_decision', 'hook_duration_s',
        'attributes'
    ]

    placeholders = ', '.join(['%s'] * len(cols))
    col_names = ', '.join(cols)

    for span in spans:
        values = [span.get(c) for c in cols]
        try:
            cur.execute(
                f"INSERT INTO spans ({col_names}) VALUES ({placeholders}) "
                f"ON CONFLICT (span_id, trace_id) DO NOTHING",
                values
            )
            inserted += cur.rowcount
        except Exception as e:
            logger.error(f"Insert error: {e}")
            conn.rollback()

    conn.commit()
    cur.close()
    conn.close()
    return inserted


def forward_to_aspire(path, data, content_type):
    """Forward the raw request to Aspire dashboard."""
    try:
        url = f"{ASPIRE_OTLP_URL}{path}"
        resp = requests.post(
            url, data=data,
            headers={'Content-Type': content_type},
            timeout=5
        )
        logger.debug(f"Forwarded to Aspire: {resp.status_code}")
    except Exception as e:
        logger.warning(f"Aspire forward failed: {e}")


@app.route('/v1/traces', methods=['POST'])
def receive_traces():
    """Receive OTLP trace spans."""
    raw_data = request.get_data()
    content_type = request.content_type or ''

    # Forward raw payload to Aspire
    forward_to_aspire('/v1/traces', raw_data, content_type)

    # Parse the payload
    try:
        if 'protobuf' in content_type or 'proto' in content_type:
            msg = ExportTraceServiceRequest()
            msg.ParseFromString(raw_data)
            data = MessageToDict(msg, preserving_proto_field_name=True)
        else:
            data = json.loads(raw_data)

        spans = parse_spans_from_dict(data)
        count = store_spans(spans)
        logger.info(f"Stored {count} spans ({len(spans)} total in batch)")
    except Exception as e:
        logger.error(f"Parse/store error: {e}", exc_info=True)

    return Response('{}', status=200, content_type=CONTENT_TYPE_JSON)


@app.route('/v1/logs', methods=['POST'])
def receive_logs():
    """Receive OTLP logs — forward to Aspire only."""
    raw_data = request.get_data()
    content_type = request.content_type or ''
    forward_to_aspire('/v1/logs', raw_data, content_type)
    return Response('{}', status=200, content_type=CONTENT_TYPE_JSON)


@app.route('/v1/metrics', methods=['POST'])
def receive_metrics():
    """Receive OTLP metrics — forward to Aspire only."""
    raw_data = request.get_data()
    content_type = request.content_type or ''
    forward_to_aspire('/v1/metrics', raw_data, content_type)
    return Response('{}', status=200, content_type=CONTENT_TYPE_JSON)


@app.route('/api/health', methods=['GET'])
def health():
    """Health check."""
    try:
        conn = get_db()
        conn.cursor().execute('SELECT 1')
        conn.close()
        return jsonify({'status': 'healthy', 'db': 'connected'})
    except Exception:
        return jsonify({'status': 'unhealthy'}), 503


def _validate_query_filters():
    """Validate and collect query filter conditions from request args.

    Returns (conditions, params, error_response) where error_response is
    None on success, or a Flask response tuple on validation failure.
    """
    conditions = ['1=1']
    params = []

    session_id = request.args.get('session_id')
    if session_id:
        # Validate session_id format (hex + hyphens only)
        if not all(c in '0123456789abcdef-' for c in session_id.lower()):
            return None, None, (jsonify({'error': 'Invalid session_id format'}), 400)
        conditions.append('chat_session_id = %s')
        params.append(session_id)

    model = request.args.get('model')
    if model:
        # Validate model name (alphanumeric, hyphens, dots, underscores)
        if not all(c.isalnum() or c in '-._' for c in model):
            return None, None, (jsonify({'error': 'Invalid model format'}), 400)
        conditions.append('response_model LIKE %s')
        params.append(f'%{model}%')

    since_ms = request.args.get('since_ms')
    if since_ms:
        try:
            since_ms = int(since_ms)
        except ValueError:
            return None, None, (jsonify({'error': 'since_ms must be an integer'}), 400)
        conditions.append('start_time_ms >= %s')
        params.append(since_ms)

    return conditions, params, None


def _serialize_span_rows(rows):
    """Convert database rows to JSON-serializable dicts."""
    result = []
    for row in rows:
        r = dict(row)
        r['inserted_at'] = str(r['inserted_at']) if r['inserted_at'] else None
        if r.get('attributes'):
            r['attributes'] = json.loads(r['attributes']) if isinstance(r['attributes'], str) else r['attributes']
        result.append(r)
    return result


@app.route('/api/spans', methods=['GET'])
def query_spans():
    """Query spans for dashboard. Params: session_id, model, limit, since_ms."""
    conditions, params, error = _validate_query_filters()
    if error:
        return error

    try:
        limit = max(1, min(int(request.args.get('limit', 500)), 5000))
    except ValueError:
        limit = 500

    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    where = ' AND '.join(conditions)
    cur.execute(
        f"SELECT * FROM spans WHERE {where} ORDER BY start_time_ms DESC LIMIT %s",
        params + [limit]
    )
    rows = cur.fetchall()

    cur.close()
    conn.close()
    return jsonify(_serialize_span_rows(rows))


@app.route('/api/summary', methods=['GET'])
def query_summary():
    """Token summary grouped by model. Params: session_id, since_ms."""
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    conditions = ['input_tokens IS NOT NULL', 'input_tokens > 0']
    params = []

    session_id = request.args.get('session_id')
    if session_id:
        conditions.append('chat_session_id = %s')
        params.append(session_id)

    since_ms = request.args.get('since_ms')
    if since_ms:
        try:
            since_ms = int(since_ms)
        except ValueError:
            return jsonify({'error': 'since_ms must be an integer'}), 400
        conditions.append('start_time_ms >= %s')
        params.append(since_ms)

    where = ' AND '.join(conditions)
    cur.execute(f"""
        SELECT
            response_model,
            COUNT(*) as call_count,
            COALESCE(SUM(input_tokens), 0) as total_input,
            COALESCE(SUM(output_tokens), 0) as total_output,
            COALESCE(SUM(cached_tokens), 0) as total_cached,
            COALESCE(SUM(cache_creation_tokens), 0) as total_cache_creation,
            COALESCE(SUM(input_tokens) + SUM(output_tokens), 0) as total_tokens,
            ROUND(AVG(ttft_ms)::numeric, 1) as avg_ttft_ms,
            MIN(ttft_ms) as min_ttft_ms,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ttft_ms) as median_ttft_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ttft_ms) as p95_ttft_ms,
            MAX(ttft_ms) as max_ttft_ms,
            MIN(start_time_ms) as first_call_ms,
            MAX(end_time_ms) as last_call_ms
        FROM spans
        WHERE {where}
        GROUP BY response_model
    """, params)

    rows = cur.fetchall()
    result = [dict(r) for r in rows]

    cur.close()
    conn.close()
    return jsonify(result)


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=4318, debug=False)
