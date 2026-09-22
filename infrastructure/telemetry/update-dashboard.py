"""
ESSENCE Token Dashboard — Automated Updater
Reads from PostgreSQL, rebuilds all dashboard sections.
Reference: DATA-FLOW-MAP.md

Usage:
    py.exe update-dashboard.py                    # update from PostgreSQL
    py.exe update-dashboard.py --dashboard PATH   # custom dashboard path
    py.exe update-dashboard.py --dry-run          # print data, don't write
"""
import psycopg2
import re
import sys
import math
import argparse
from datetime import datetime, timezone, timedelta

# ---------------------------------------------------------------------------
# Config (env vars for Docker, defaults for local)
# ---------------------------------------------------------------------------
import os

def _load_dotenv(path):
    """Load key=value pairs from .env into os.environ (no-op if file missing)."""
    try:
        with open(path, 'r', encoding='utf-8') as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith('#') and '=' in _line:
                    _k, _, _v = _line.partition('=')
                    os.environ.setdefault(_k.strip(), _v.strip())
    except FileNotFoundError:
        pass

_load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))
# Map Docker Compose variable name to the expected name if needed
if 'DB_PASS' not in os.environ and 'POSTGRES_PASSWORD' in os.environ:
    os.environ['DB_PASS'] = os.environ['POSTGRES_PASSWORD']

DB = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'port': int(os.environ.get('DB_PORT', '5433')),
    'dbname': os.environ.get('DB_NAME', 'essence_telemetry'),
    'user': os.environ.get('DB_USER', 'essence'),
    'password': os.environ['DB_PASS'],  # Required — no hardcoded default
}
DASH_DEFAULT = os.environ.get('DASHBOARD_PATH', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'essence-token-dashboard.html'))

# Offset in hours from UTC, e.g. "3" or "-5". Falls back to UTC+3 if unset/invalid.
try:
    LOCAL_TZ = timezone(timedelta(hours=float(os.environ.get('DASHBOARD_TZ_OFFSET_HOURS', '3'))))
except (TypeError, ValueError):
    LOCAL_TZ = timezone(timedelta(hours=3))

# ---------------------------------------------------------------------------
# Cost pricing — single source of truth in pricing.py (Copilot credits / 1M tokens).
# See DASHBOARD_COST_SOURCE.md (same directory) for the credit rates.
# ---------------------------------------------------------------------------
from pricing import get_pricing, calc_cost

_UNTAGGED = '(untagged)'
_CSS_GREEN = 'var(--green)'
_CSS_ORANGE = 'var(--orange)'
_CSS_RED = 'var(--red)'
_NO_DATA_HTML = '<div style="color:var(--text-dim);">No data</div>'

# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------
def fmt(n):
    """Format integer with commas: 1234567 -> '1,234,567'"""
    if n is None:
        return '0'
    return f'{int(n):,}'

def fmt_cost(c):
    if c <= 0:
        return '\u2014'
    n = max(1, int(round(c)))
    return f'~{n:,} Cr'

def fmt_tok(n):
    """Compact token count: 1234567890 -> '1.2B', 88234567 -> '88.2M', 492123 -> '492K'"""
    if n is None or n == 0:
        return '0'
    if n >= 1e9:
        return f'{n/1e9:.1f}B'
    if n >= 1e6:
        return f'{n/1e6:.1f}M'
    if n >= 1e3:
        return f'{n/1e3:.0f}K'
    return str(int(n))

def fmt_pct(p, decimals=1):
    return f'{p:.{decimals}f}%'

def fmt_ms(ms):
    if ms is None:
        return '\u2014'
    return f'{int(ms):,}ms'

def fmt_duration(seconds):
    d = int(seconds // 86400)
    h = int((seconds % 86400) // 3600)
    m = int((seconds % 3600) // 60)
    if d > 0:
        return f'{d}d {h}h {m}m'
    if h > 0:
        return f'{h}h {m}m'
    return f'{m}m'

def model_tag_class(model):
    m = (model or '').lower()
    if 'claude' in m or 'opus' in m or 'sonnet' in m:
        return 'opus'
    return 'mini'

def model_short(model):
    m = (model or '').lower()
    if 'opus' in m:
        return 'opus'
    if 'sonnet' in m:
        return 'sonnet'
    if 'mini' in m:
        return 'mini'
    return (model or '')[:10]

# ---------------------------------------------------------------------------
# PostgreSQL queries
# ---------------------------------------------------------------------------
PERIOD_MAP = {
    '24h':  '1 day',
    '1w':   '7 days',
    '1m':   '1 month',
    '3m':   '3 months',
    '6m':   '6 months',
    'all':  None,
}

def _fetch_latest_session(cur, time_filter, ws_params=()):
    """Fetch latest session trace info for the session banner."""
    cur.execute(f'''
        SELECT trace_id, COUNT(*) as span_count,
            COUNT(*) FILTER (WHERE input_tokens IS NOT NULL AND input_tokens > 0) as llm_turns
        FROM spans WHERE trace_id IS NOT NULL{time_filter}
        GROUP BY trace_id
        HAVING COUNT(*) >= 3
        ORDER BY MAX(inserted_at) DESC
        LIMIT 1
    ''', ws_params)
    latest = cur.fetchone()
    if latest:
        tid = latest[0]
        return {
            'latest_trace_id': tid[:8] + '\u2026' + tid[-4:] if len(tid) > 12 else tid,
            'latest_span_count': latest[1],
            'latest_turn_count': latest[2],
        }
    return {
        'latest_trace_id': '\u2014',
        'latest_span_count': 0,
        'latest_turn_count': 0,
    }


def _aggregate_workspace_costs(cur, time_filter, ws_params=()):
    """Compute per-workspace cost from model-level rows."""
    # Per-workspace cost (resource attribute workspace.name, set via the essence-code
    # launcher). Spans with no tag fall into an explicit '(untagged)' bucket so the
    # panel never silently hides unattributed cost. Grouped by model so cost reuses
    # the same per-model pricing as the rest of the dashboard.
    cur.execute(f'''
        SELECT COALESCE(NULLIF(attributes->>'workspace.name', ''), '(untagged)') AS workspace,
            response_model, COUNT(*), COALESCE(SUM(input_tokens),0),
            COALESCE(SUM(output_tokens),0), COALESCE(SUM(cached_tokens),0)
        FROM spans WHERE input_tokens IS NOT NULL AND input_tokens > 0{time_filter}
        GROUP BY workspace, response_model
    ''', ws_params)
    ws_acc = {}
    for row in cur.fetchall():
        ws, model = row[0], row[1] or 'unknown'
        calls, inp, out, cached = row[2], row[3], row[4], row[5]
        cost = calc_cost(model, inp, out, cached)
        a = ws_acc.setdefault(ws, {'workspace': ws, 'calls': 0, 'input': 0,
                                   'output': 0, 'cached': 0, 'cost': 0.0})
        a['calls'] += calls
        a['input'] += inp
        a['output'] += out
        a['cached'] += cached
        a['cost'] += cost
    workspaces = sorted(ws_acc.values(), key=lambda x: x['cost'], reverse=True)
    ws_total_cost = sum(w['cost'] for w in workspaces)
    attributed_cost = sum(w['cost'] for w in workspaces if w['workspace'] != _UNTAGGED)
    return {
        'workspaces': workspaces,
        'workspace_total_cost': ws_total_cost,
        'workspace_attributed_pct': (attributed_cost / ws_total_cost * 100) if ws_total_cost else 0,
    }


def _apply_workspace_filter(cur, time_filter, workspace):
    """Query workspace options and build the workspace SQL filter clause."""
    ws_expr = "COALESCE(NULLIF(attributes->>'workspace.name', ''), '(untagged)')"
    cur.execute(f'''
        SELECT {ws_expr} AS ws, COUNT(*) FROM spans
        WHERE input_tokens IS NOT NULL AND input_tokens > 0
        GROUP BY ws ORDER BY COUNT(*) DESC
    ''')
    ws_options = [r[0] for r in cur.fetchall()]
    ws_params = ()
    if workspace != 'all' and workspace in ws_options:
        # Use the index-friendly raw attribute predicate (not the COALESCE wrapper)
        # so the functional index is used. '(untagged)' = NULL or empty string.
        if workspace == _UNTAGGED:
            time_filter += " AND (attributes->>'workspace.name' IS NULL OR attributes->>'workspace.name' = '')"
        else:
            time_filter += " AND attributes->>'workspace.name' = %s"
            ws_params = (workspace,)
        active_ws = workspace
    else:
        active_ws = 'all'
    return time_filter, active_ws, ws_options, ws_params


def _bucket_sessions(sessions_raw):
    """Group session rows into size buckets and compute aggregates."""
    buckets = {'1-5': [], '6-15': [], '16-30': [], '31+': []}
    for row in sessions_raw:
        cnt = row[1]
        entry = {'trace_id': row[0], 'spans': cnt, 'input': row[2], 'output': row[3], 'cached': row[4]}
        if cnt <= 5:
            buckets['1-5'].append(entry)
        elif cnt <= 15:
            buckets['6-15'].append(entry)
        elif cnt <= 30:
            buckets['16-30'].append(entry)
        else:
            buckets['31+'].append(entry)
    result = {}
    for label, entries in buckets.items():
        result[label] = {
            'sessions': len(entries),
            'total_input': sum(e['input'] for e in entries),
            'total_output': sum(e['output'] for e in entries),
            'total_cached': sum(e['cached'] for e in entries),
            'avg_input': int(sum(e['input'] for e in entries) / len(entries)) if entries else 0,
        }
    return result


def _fetch_github_columns(cur, time_filter, ws_params=()):
    """Fetch github.copilot.* breakdowns if the schema supports them."""
    # github.copilot.* breakdowns (VS Code 1.122+). The named columns only exist on
    # migrated databases — probe information_schema first so an un-migrated DB degrades
    # to an empty panel instead of raising and aborting the entire dashboard update.
    cur.execute('''
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'spans' AND column_name IN
          ('agent_type','git_repository','git_branch','github_org',
           'tool_edit_type','tool_skill_name','hook_decision','hook_duration_s')
    ''')
    gh_cols = {r[0] for r in cur.fetchall()}
    result = {
        'gh_available': len(gh_cols) == 8,
        'agent_types': [], 'repositories': [], 'edit_types': [],
        'skills': [], 'hooks': [],
    }
    if not result['gh_available']:
        return result

    cur.execute(f'''
        SELECT agent_type, COUNT(*), COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0)
        FROM spans WHERE agent_type IS NOT NULL{time_filter}
        GROUP BY agent_type ORDER BY COUNT(*) DESC
    ''', ws_params)
    result['agent_types'] = [{'type': r[0], 'count': r[1], 'input': r[2], 'output': r[3]} for r in cur.fetchall()]

    cur.execute(f'''
        SELECT git_repository, COALESCE(MAX(git_branch), ''), COUNT(*),
            COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0)
        FROM spans WHERE git_repository IS NOT NULL{time_filter}
        GROUP BY git_repository ORDER BY SUM(input_tokens) DESC NULLS LAST LIMIT 10
    ''', ws_params)
    result['repositories'] = [{'repo': r[0], 'branch': r[1], 'count': r[2], 'input': r[3], 'output': r[4]} for r in cur.fetchall()]

    cur.execute(f'''
        SELECT tool_edit_type, COUNT(*)
        FROM spans WHERE tool_edit_type IS NOT NULL{time_filter}
        GROUP BY tool_edit_type ORDER BY COUNT(*) DESC
    ''', ws_params)
    result['edit_types'] = [{'type': r[0], 'count': r[1]} for r in cur.fetchall()]

    cur.execute(f'''
        SELECT tool_skill_name, COUNT(*)
        FROM spans WHERE tool_skill_name IS NOT NULL{time_filter}
        GROUP BY tool_skill_name ORDER BY COUNT(*) DESC
    ''', ws_params)
    result['skills'] = [{'name': r[0], 'count': r[1]} for r in cur.fetchall()]

    cur.execute(f'''
        SELECT hook_decision, COUNT(*), ROUND(COALESCE(AVG(hook_duration_s),0)::numeric, 3)
        FROM spans WHERE hook_decision IS NOT NULL{time_filter}
        GROUP BY hook_decision ORDER BY COUNT(*) DESC
    ''', ws_params)
    result['hooks'] = [{'decision': r[0], 'count': r[1], 'avg_s': float(r[2] or 0)} for r in cur.fetchall()]

    return result


def fetch_all_data(period='all', workspace='all'):
    conn = psycopg2.connect(**DB)
    cur = conn.cursor()
    data = {'period': period}

    # Functional index on the workspace attribute keeps the per-workspace filter
    # fast (equality predicate below is index-eligible). IF NOT EXISTS makes this a
    # cheap metadata check on every refresh and self-heals fresh installs.
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_spans_workspace_name "
        "ON spans ((attributes->>'workspace.name'))"
    )
    # Index on inserted_at — required for period filters (1w/1m/3m/6m/all).
    # Without this, every non-24h period does a full table scan and times out.
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_spans_inserted_at ON spans (inserted_at)"
    )
    conn.commit()

    # Build time filter
    interval = PERIOD_MAP.get(period)
    time_filter = ''
    if interval:
        time_filter = f" AND inserted_at >= NOW() - INTERVAL '{interval}'"

    # Workspace filter. The full (unfiltered) list of workspaces drives the header
    # dropdown so it stays stable regardless of the active period/workspace. The
    # selected value is validated against that list, so only known-good values ever
    # reach SQL (no injection surface); unknown values fall back to 'all'.
    time_filter, active_ws, ws_options, ws_params = _apply_workspace_filter(cur, time_filter, workspace)
    data['workspace_options'] = ws_options
    data['workspace'] = active_ws

    # Totals
    cur.execute(f'''
        SELECT COUNT(*), COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0),
            COALESCE(SUM(cached_tokens),0), COALESCE(SUM(cache_creation_tokens),0),
            MIN(inserted_at), MAX(inserted_at)
        FROM spans WHERE input_tokens IS NOT NULL AND input_tokens > 0{time_filter}
    ''', ws_params)
    r = cur.fetchone()
    data['llm_calls'] = r[0]
    data['total_input'] = r[1]
    data['total_output'] = r[2]
    data['total_cached'] = r[3]
    data['total_cache_create'] = r[4]
    data['total_tokens'] = r[1] + r[2]
    data['window_start'] = r[5]
    data['window_end'] = r[6]
    data['duration_s'] = (r[6] - r[5]).total_seconds() if r[5] and r[6] else 0
    data['cache_pct'] = (data['total_cached'] / data['total_input'] * 100) if data['total_input'] else 0

    cur.execute(f'SELECT COUNT(*), COUNT(DISTINCT trace_id) FROM spans WHERE 1=1{time_filter}', ws_params)
    r = cur.fetchone()
    data['total_spans'] = r[0]
    data['traces'] = r[1]

    # Latest session (most recent trace) for session banner
    data.update(_fetch_latest_session(cur, time_filter, ws_params))

    # Per-model
    cur.execute(f'''
        SELECT response_model, COUNT(*), COALESCE(SUM(input_tokens),0),
            COALESCE(SUM(output_tokens),0), COALESCE(SUM(cached_tokens),0),
            COALESCE(SUM(cache_creation_tokens),0), ROUND(AVG(ttft_ms)::numeric)
        FROM spans WHERE input_tokens IS NOT NULL AND input_tokens > 0{time_filter}
        GROUP BY response_model ORDER BY SUM(input_tokens) DESC
    ''', ws_params)
    data['models'] = []
    data['total_cost'] = 0
    for row in cur.fetchall():
        model = row[0] or 'unknown'
        inp, out, cached, cw = row[2], row[3], row[4], row[5]
        cached = cached or 0
        p, matched = get_pricing(model)
        non_cached = inp - cached
        cost_input = non_cached / 1e6 * p['input']
        cost_cached = cached / 1e6 * p['cached']
        cost_output = out / 1e6 * p['output']
        cost = cost_input + cost_cached + cost_output
        cache_pct = (cached / inp * 100) if inp else 0
        data['models'].append({
            'name': model, 'calls': row[1],
            'input': inp, 'output': out, 'cached': cached,
            'cache_write': cw, 'cache_pct': cache_pct,
            'avg_ttft': row[6], 'cost': cost,
            'cost_input': cost_input, 'cost_cached': cost_cached, 'cost_output': cost_output,
            'priced': matched,
        })
        data['total_cost'] += cost

    # TTFT percentiles
    cur.execute(f'''
        SELECT response_model, MIN(ttft_ms)::integer,
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ttft_ms)::integer,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ttft_ms)::integer,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ttft_ms)::integer,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ttft_ms)::integer,
            MAX(ttft_ms)::integer, COUNT(*)
        FROM spans WHERE ttft_ms IS NOT NULL AND ttft_ms > 0{time_filter}
        GROUP BY response_model
    ''', ws_params)
    data['ttft'] = {}
    for row in cur.fetchall():
        data['ttft'][row[0]] = {
            'min': row[1], 'p25': row[2], 'p50': row[3],
            'p75': row[4], 'p95': row[5], 'max': row[6], 'count': row[7]
        }

    # Agents
    cur.execute(f'''
        SELECT agent_name, COUNT(*), COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0)
        FROM spans WHERE agent_name IS NOT NULL{time_filter}
        GROUP BY agent_name ORDER BY COUNT(*) DESC
    ''', ws_params)
    data['agents'] = [{'name': r[0], 'count': r[1], 'input': r[2], 'output': r[3]} for r in cur.fetchall()]

    # Tools
    cur.execute(f'''
        SELECT tool_name, COUNT(*), ROUND(COALESCE(AVG(duration_ms),0)::numeric / 1000, 2)
        FROM spans WHERE tool_name IS NOT NULL{time_filter}
        GROUP BY tool_name ORDER BY COUNT(*) DESC
    ''', ws_params)
    data['tools'] = [{'name': r[0], 'count': r[1], 'avg_s': float(r[2] or 0)} for r in cur.fetchall()]

    # Finish reasons
    cur.execute(f'''
        SELECT finish_reasons, COUNT(*)
        FROM spans WHERE finish_reasons IS NOT NULL AND finish_reasons != ''{time_filter}
        GROUP BY finish_reasons ORDER BY COUNT(*) DESC
    ''', ws_params)
    data['finishes'] = [{'reason': r[0], 'count': r[1]} for r in cur.fetchall()]

    # Individual LLM calls
    cur.execute(f'''
        SELECT span_id, agent_name, response_model,
            input_tokens, output_tokens, COALESCE(cached_tokens,0),
            COALESCE(cache_creation_tokens,0), ttft_ms, duration_ms,
            start_time_ms, turn_index
        FROM spans WHERE input_tokens IS NOT NULL AND input_tokens > 0{time_filter}
        ORDER BY start_time_ms
    ''', ws_params)
    data['calls'] = [{
        'span_id': r[0], 'agent': r[1], 'model': r[2],
        'input': r[3], 'output': r[4], 'cached': r[5],
        'cache_write': r[6], 'ttft': r[7], 'duration': r[8],
        'start_ms': r[9], 'turn': r[10],
    } for r in cur.fetchall()]

    # Session size distribution (traces grouped by span count)
    cur.execute(f'''
        SELECT trace_id, COUNT(*) as cnt,
            COALESCE(SUM(input_tokens),0) as total_input,
            COALESCE(SUM(output_tokens),0) as total_output,
            COALESCE(SUM(cached_tokens),0) as total_cached
        FROM spans WHERE input_tokens IS NOT NULL AND input_tokens > 0{time_filter}
        GROUP BY trace_id
    ''', ws_params)
    sessions_raw = cur.fetchall()
    data['session_buckets'] = _bucket_sessions(sessions_raw)

    # Hourly consumption
    cur.execute(f'''
        SELECT date_trunc('hour', inserted_at) as hour,
            COUNT(*) as llm_calls,
            COALESCE(SUM(input_tokens),0) as input,
            COALESCE(SUM(output_tokens),0) as output,
            COALESCE(SUM(cached_tokens),0) as cached
        FROM spans WHERE input_tokens IS NOT NULL AND input_tokens > 0{time_filter}
        GROUP BY date_trunc('hour', inserted_at)
        ORDER BY hour
    ''', ws_params)
    data['hourly'] = [{
        'hour': r[0], 'calls': r[1], 'input': r[2],
        'output': r[3], 'cached': r[4], 'billable': r[2] - r[4],
    } for r in cur.fetchall()]

    # Background agent analysis (agents with poor cache efficiency)
    cur.execute(f'''
        SELECT agent_name, response_model, COUNT(*) as calls,
            COALESCE(SUM(input_tokens),0) as input,
            COALESCE(SUM(output_tokens),0) as output,
            COALESCE(SUM(cached_tokens),0) as cached,
            ROUND(COALESCE(SUM(cached_tokens),0)::numeric / NULLIF(SUM(input_tokens),0) * 100, 1) as cache_pct
        FROM spans WHERE input_tokens IS NOT NULL AND input_tokens > 0 AND agent_name IS NOT NULL{time_filter}
        GROUP BY agent_name, response_model
        ORDER BY (SUM(input_tokens) - COALESCE(SUM(cached_tokens),0)) DESC
    ''', ws_params)
    data['agent_efficiency'] = [{
        'agent': r[0], 'model': r[1], 'calls': r[2],
        'input': r[3], 'output': r[4], 'cached': r[5],
        'cache_pct': float(r[6]) if r[6] else 0,
        'billable': r[3] - r[5],
    } for r in cur.fetchall()]

    data.update(_fetch_github_columns(cur, time_filter, ws_params))

    data.update(_aggregate_workspace_costs(cur, time_filter, ws_params))

    conn.close()
    return data

# ---------------------------------------------------------------------------
# HTML section builders
# ---------------------------------------------------------------------------

def build_kpi_row(d):
    cards = [
        ('accent', 'Total Tokens',  fmt_tok(d['total_tokens']),  'input + output'),
        ('green',  'Cache Hit Rate', fmt_pct(d['cache_pct']), 'of input tokens cached'),
        ('orange', 'Total Input',    fmt_tok(d['total_input']), 'all input tokens'),
        ('cyan',   'Cached Tokens', fmt_tok(d['total_cached']), 'prompt cache hits'),
        ('red',    'Output Tokens',  fmt_tok(d['total_output']), 'all output tokens'),
        ('yellow', 'Copilot Credits', fmt_cost(d['total_cost']), 'Copilot picker rates'),
        ('purple', 'LLM Calls',     str(d['llm_calls']),    f"{d['traces']} agent turns"),
        ('pink',   'Wall Clock',    fmt_duration(d['duration_s']), 'first \u2192 last'),
    ]
    lines = ['  <div class="kpi-row">']
    for i, (color, label, value, sub) in enumerate(cards, 1):
        lines.append(f'    <div class="kpi {color}">')
        lines.append(f'      <div class="label">{i}. {label}</div>')
        lines.append(f'      <div class="value">{value}</div>')
        lines.append(f'      <div class="sub">{sub}</div>')
        lines.append('    </div>')
    lines.append('  </div>')
    return '\n'.join(lines)


def build_cost_table(d):
    tot_ci = sum(m['cost_input'] for m in d['models'])
    tot_cc = sum(m['cost_cached'] for m in d['models'])
    tot_co = sum(m['cost_output'] for m in d['models'])
    sub = 'font-size:10px;color:var(--text-dim);margin-top:1px;'
    rows = []
    for m in d['models']:
        tag = model_tag_class(m['name'])
        non_cached = m['input'] - m['cached']
        unpriced = '' if m.get('priced', True) else f' <span style="color:{_CSS_ORANGE};font-size:10px;" title="No exact pricing tier matched — estimated at base tier">\u26a0 estimated</span>'
        rows.append(f'''        <tr>
          <td><span class="model-tag {tag}">{m['name']}</span>{unpriced}</td>
          <td class="r" style="color:var(--yellow);">{fmt_cost(m['cost'])}</td>
          <td class="r">{fmt_cost(m['cost_input'])}<div style="{sub}">{fmt_tok(non_cached)} non-cached</div></td>
          <td class="r" style="color:var(--green);">{fmt_cost(m['cost_cached'])}<div style="{sub}">{fmt_tok(m['cached'])} cached</div></td>
          <td class="r">{fmt_cost(m['cost_output'])}<div style="{sub}">{fmt_tok(m['output'])} output</div></td>
        </tr>''')
    tot_nc = d['total_input'] - d['total_cached']
    rows.append(f'''        <tr class="total-row">
          <td>Total</td>
          <td class="r" style="color:var(--yellow);"><strong>{fmt_cost(d['total_cost'])}</strong></td>
          <td class="r"><strong>{fmt_cost(tot_ci)}</strong><div style="{sub}">{fmt_tok(tot_nc)} non-cached</div></td>
          <td class="r" style="color:var(--green);"><strong>{fmt_cost(tot_cc)}</strong><div style="{sub}">{fmt_tok(d['total_cached'])} cached</div></td>
          <td class="r"><strong>{fmt_cost(tot_co)}</strong><div style="{sub}">{fmt_tok(d['total_output'])} output</div></td>
        </tr>''')
    pricing_ref = '''      <div style="font-size:10px;color:var(--text-dim);margin-top:8px;">* GitHub Copilot credits per 1M tokens — see DASHBOARD_COST_SOURCE.md</div>'''
    return f'''      <table>
        <tr><th>Model</th><th class="r">Total Cr</th><th class="r">Input Cr</th><th class="r">Cached Cr</th><th class="r">Output Cr</th></tr>
{chr(10).join(rows)}
      </table>
{pricing_ref}'''


def build_cache_ring(d):
    pct = d['cache_pct']
    circ = 314.16
    dash = circ * pct / 100
    if pct > 50:
        color = _CSS_GREEN
    elif pct > 20:
        color = _CSS_ORANGE
    else:
        color = _CSS_RED
    return f'''      <div style="text-align:center;padding:16px 0;">
        <div class="cache-ring">
          <svg viewBox="0 0 120 120" width="120" height="120">
            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" stroke-width="10" />
            <circle cx="60" cy="60" r="50" fill="none" stroke="{color}" stroke-width="10"
              stroke-dasharray="{dash:.1f} {circ}" stroke-linecap="round" />
          </svg>
          <div class="center-text">
            <div class="big" style="font-size:16px;color:{color};">{fmt_pct(pct)}</div>
            <div class="small">cache<br>hit rate</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-dim);line-height:1.8;">
          <div>Total input: <strong style="color:var(--accent);">{fmt(d['total_input'])}</strong></div>
          <div>Total cached: <strong style="color:var(--green);">{fmt(d['total_cached'])}</strong></div>
          <div>Total output: <strong style="color:var(--red);">{fmt(d['total_output'])}</strong></div>
        </div>
      </div>'''


def build_token_composition(d):
    bars = []
    for m in d['models']:
        total = m['input'] + m['output']
        tag = model_tag_class(m['name'])
        cached_pct = (m['cached'] / total * 100) if total else 0
        cw_pct = (m['cache_write'] / total * 100) if total else 0
        new_input = m['input'] - m['cached'] - m['cache_write']
        new_pct = max(0, (new_input / total * 100)) if total else 0
        out_pct = (m['output'] / total * 100) if total else 0
        bars.append(f'''      <div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span
            class="model-tag {tag}">{m['name']}</span><span
            style="font-size:11px;color:var(--text-dim);">{fmt(total)}</span></div>
        <div class="bar-container" style="height:10px;">
          <div class="bar-fill bar-cached" style="width:{cached_pct}%"></div>
          <div class="bar-fill bar-create" style="width:{cw_pct}%"></div>
          <div class="bar-fill bar-new" style="width:{new_pct}%"></div>
          <div class="bar-fill bar-output" style="width:{out_pct}%"></div>
        </div>
      </div>''')
    legend = '''      <div style="display:flex;gap:14px;font-size:10px;color:var(--text-dim);margin-top:8px;">
        <span>\u25a0 cached</span>
        <span style="color:var(--orange);">\u25a0 cache write</span>
        <span style="color:var(--accent);">\u25a0 new input</span>
        <span style="color:var(--red);">\u25a0 output</span>
      </div>'''
    return '\n'.join(bars) + '\n' + legend


def build_breakdown_table(d):
    rows = []
    for m in d['models']:
        tag = model_tag_class(m['name'])
        rows.append(f'''        <tr>
          <td><span class="model-tag {tag}">{m['name']}</span></td>
          <td class="r">{m['calls']}</td>
          <td class="r">{fmt(m['input'])}</td>
          <td class="r">{fmt(m['output'])}</td>
          <td class="r">{fmt(m['cached'])}</td>
          <td class="r">{fmt_pct(m['cache_pct'])}</td>
          <td class="r">{fmt(m['cache_write'])}</td>
          <td class="r">{fmt_ms(m['avg_ttft'])}</td>
          <td class="r" style="color:var(--yellow);">{fmt_cost(m['cost'])}</td>
        </tr>''')
    tot_calls = sum(m['calls'] for m in d['models'])
    tot_cw = sum(m['cache_write'] for m in d['models'])
    rows.append(f'''        <tr class="total-row">
          <td>Total</td>
          <td class="r"><strong>{tot_calls}</strong></td>
          <td class="r"><strong>{fmt(d['total_input'])}</strong></td>
          <td class="r"><strong>{fmt(d['total_output'])}</strong></td>
          <td class="r"><strong>{fmt(d['total_cached'])}</strong></td>
          <td class="r"><strong>{fmt_pct(d['cache_pct'])}</strong></td>
          <td class="r"><strong>{fmt(tot_cw)}</strong></td>
          <td class="r">\u2014</td>
          <td class="r" style="color:var(--yellow);"><strong>{fmt_cost(d['total_cost'])}</strong></td>
        </tr>''')
    pricing_ref = '''      <div style="font-size:10px;color:var(--text-dim);margin-top:8px;">* GitHub Copilot credits per 1M tokens — see DASHBOARD_COST_SOURCE.md</div>'''
    return f'''      <table>
        <tr><th>Model</th><th class="r">Calls</th><th class="r">Input</th><th class="r">Output</th>
          <th class="r">Cached</th><th class="r">Cache %</th><th class="r">Cache Write</th>
          <th class="r">Avg TTFT</th><th class="r">Credits</th></tr>
{chr(10).join(rows)}
      </table>
{pricing_ref}'''


def build_efficiency_panel(d):
    ratio = (d['total_output'] / d['total_input'] * 100) if d['total_input'] else 0
    tool_calls = sum(t['count'] for t in d.get('tools', []))
    out_per_tool = int(d['total_output'] / tool_calls) if tool_calls else 0
    avg_input = int(d['total_input'] / d['llm_calls']) if d['llm_calls'] else 0
    return f'''      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
          <div style="padding:10px;background:rgba(88,166,255,0.06);border-radius:8px;">
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px;">OUTPUT / INPUT RATIO</div>
            <div style="font-size:22px;font-weight:700;color:var(--accent);">{fmt_pct(ratio, 2)}</div>
            <div style="font-size:11px;color:var(--text-dim);">{fmt(d['total_output'])} out / {fmt(d['total_input'])} in tokens</div>
          </div>
          <div style="padding:10px;background:rgba(57,210,192,0.06);border-radius:8px;">
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px;">OUTPUT PER TOOL CALL</div>
            <div style="font-size:22px;font-weight:700;color:var(--cyan);">{fmt(out_per_tool)} <span style="font-size:11px;font-weight:400;color:var(--text-dim);">tokens</span></div>
            <div style="font-size:11px;color:var(--text-dim);">{fmt(d['total_output'])} tokens / {fmt(tool_calls)} tools</div>
          </div>
          <div style="padding:10px;background:rgba(188,140,255,0.06);border-radius:8px;">
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px;">AVG INPUT PER CALL</div>
            <div style="font-size:22px;font-weight:700;color:var(--purple);">{fmt(avg_input)} <span style="font-size:11px;font-weight:400;color:var(--text-dim);">tokens</span></div>
            <div style="font-size:11px;color:var(--text-dim);">across {fmt(d['llm_calls'])} LLM calls</div>
          </div>
        </div>'''


def build_tokens_per_call(d):
    calls = sorted(d['calls'], key=lambda c: c['input'] + c['output'], reverse=True)[:20]
    if not calls:
        return _NO_DATA_HTML
    max_tok = calls[0]['input'] + calls[0]['output']
    bars = []
    for c in calls:
        total = c['input'] + c['output']
        pct = (math.log10(max(total, 1)) / math.log10(max(max_tok, 10))) * 100 if max_tok > 1 else 0
        tag = model_tag_class(c['model'] or '')
        short = model_short(c['model'] or '')
        if c['start_ms']:
            ts = datetime.fromtimestamp(c['start_ms'] / 1000, tz=timezone.utc).astimezone(LOCAL_TZ)
            time_label = ts.strftime('%M:%S')
        else:
            time_label = '\u2014'
        bars.append(f'        <div style="display:flex;align-items:center;gap:8px;"><span style="font-size:10px;color:var(--text-dim);width:50px;text-align:right;">{time_label}</span><span class="model-tag {tag}" style="width:70px;text-align:center;font-size:10px;">{short}</span><div style="flex:1;height:14px;background:var(--border);border-radius:3px;overflow:hidden;"><div style="width:{pct:.0f}%;height:100%;background:var(--purple);border-radius:3px;"></div></div><span style="font-size:10px;color:var(--text-dim);width:80px;text-align:right;">{fmt(total)}</span></div>')
    return f'''      <div style="font-size:11px;color:var(--text-dim);margin-bottom:12px;">Horizontal bars \u00b7 log scale \u00b7 sorted by total tokens</div>
      <div style="display:flex;flex-direction:column;gap:3px;">
{chr(10).join(bars)}
      </div>'''


def build_cumulative_chart(d):
    calls = d['calls']
    if not calls:
        return _NO_DATA_HTML
    cumulative = []
    running = 0
    for c in calls:
        running += c['input'] + c['output']
        cumulative.append(running)
    max_val = cumulative[-1] if cumulative else 1
    n = len(cumulative)
    points = ['0% 100%']
    for i, val in enumerate(cumulative):
        x = (i + 1) / n * 100
        y = 100 - (val / max_val * 100)
        points.append(f'{x:.1f}% {y:.1f}%')
    points.append('100% 100%')
    polygon = ', '.join(points)
    cost_total = sum(calc_cost(c['model'] or '', c['input'], c['output'], c['cached']) for c in calls)
    labels = ''
    for frac in [0, 0.25, 0.5, 0.75, 1.0]:
        val = int(max_val * (1 - frac))
        labels += f'        <div style="position:absolute;top:{frac*100:.0f}%;right:100%;margin-right:4px;font-size:9px;color:var(--text-dim);white-space:nowrap;">{fmt(val)}</div>\n'
    return f'''      <div style="position:relative;height:200px;margin:20px 0 10px 70px;">
{labels}        <div style="position:absolute;inset:0;background:var(--border);border-radius:4px;overflow:hidden;">
          <div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(88,166,255,0.3), rgba(88,166,255,0.05));clip-path:polygon({polygon});"></div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-dim);margin-top:8px;">
        <span>Final: <strong>{fmt(max_val)}</strong></span>
        <span>Credits: <strong style="color:var(--yellow);">{fmt_cost(cost_total)}</strong></span>
      </div>'''


def build_ttft_chart(d):
    ttft = d['ttft']
    if not ttft:
        return '<div style="color:var(--text-dim);">No TTFT data</div>'
    all_vals = []
    for stats in ttft.values():
        all_vals.extend([stats['min'], stats['max']])
    g_min = min(all_vals)
    g_max = max(all_vals)
    rng = g_max - g_min if g_max > g_min else 1
    def pct(v):
        return ((v - g_min) / rng) * 100
    rows = []
    for model, s in ttft.items():
        tag = model_tag_class(model)
        short = model_short(model)
        wl = pct(s['min'])
        ww = pct(s['max']) - wl
        bl = pct(s['p25'])
        bw = max(pct(s['p75']) - bl, 1)
        ml = pct(s['p50']) - bl
        rows.append(f'''        <div style="margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span class="model-tag {tag}" style="width:70px;text-align:center;font-size:10px;">{short}</span>
            <span style="font-size:10px;color:var(--text-dim);">({s['count']} calls)</span>
          </div>
          <div style="position:relative;height:20px;margin-left:78px;">
            <div style="position:absolute;top:9px;left:{wl:.1f}%;width:{ww:.1f}%;height:2px;background:var(--text-dim);"></div>
            <div style="position:absolute;top:2px;left:{bl:.1f}%;width:{bw:.1f}%;height:16px;background:rgba(88,166,255,0.3);border:1px solid var(--accent);border-radius:2px;">
              <div style="position:absolute;left:{ml:.1f}%;top:0;bottom:0;width:2px;background:var(--accent);"></div>
            </div>
          </div>
          <div style="display:flex;gap:12px;margin-left:78px;font-size:9px;color:var(--text-dim);margin-top:2px;">
            <span>min {fmt_ms(s['min'])}</span><span>p25 {fmt_ms(s['p25'])}</span><span>med {fmt_ms(s['p50'])}</span>
            <span>p75 {fmt_ms(s['p75'])}</span><span>p95 {fmt_ms(s['p95'])}</span><span>max {fmt_ms(s['max'])}</span>
          </div>
        </div>''')
    axis = ''
    for frac in [0, 0.25, 0.5, 0.75, 1.0]:
        val = g_min + rng * frac
        axis += f'<span style="font-size:9px;color:var(--text-dim);">{fmt_ms(val)}</span>'
    return f'''{chr(10).join(rows)}
      <div style="display:flex;justify-content:space-between;margin-left:78px;margin-top:8px;">{axis}</div>'''


def build_agents_table(d):
    rows = '\n'.join(f'''        <tr>
          <td><span class="agent-tag">{a['name']}</span></td>
          <td class="r">{a['count']}</td>
          <td class="r">{fmt(a['input'])}</td>
          <td class="r">{fmt(a['output'])}</td>
        </tr>''' for a in d['agents'])
    return f'''      <table>
        <tr><th>Agent</th><th class="r">Calls</th><th class="r">Input</th><th class="r">Output</th></tr>
{rows}
      </table>'''


def build_tools_table(d):
    tool_rows = '\n'.join(f'''          <tr>
            <td><code style="color:var(--cyan);">{t['name']}</code></td>
            <td class="r">{t['count']}</td>
            <td class="r">{t['avg_s']:.2f}s</td>
          </tr>''' for t in d['tools'])
    finish_rows = '\n'.join(f'''          <tr>
            <td><code style="color:var(--green);">{f['reason']}</code></td>
            <td class="r">{f['count']}</td>
          </tr>''' for f in d['finishes'])
    return f'''      <div style="margin-bottom:12px;">
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;">TOOL CALLS</div>
        <table>
          <tr><th>Tool</th><th class="r">Count</th><th class="r">Avg</th></tr>
{tool_rows}
        </table>
      </div>
      <div>
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;">FINISH REASONS</div>
        <table>
          <tr><th>Reason</th><th class="r">Count</th></tr>
{finish_rows}
        </table>
      </div>'''


def build_github_context(d):
    """github.copilot.* breakdowns (VS Code 1.122+): agent type, repository,
    edit type, skill, hook outcome. Degrades to a hint when the source DB has
    not been migrated or no copilot-chat spans carry these attributes yet."""
    if not d.get('gh_available'):
        return ('<div style="color:var(--text-dim);">Source database not yet migrated '
                'for <code style="color:var(--cyan);">github.copilot.*</code> columns. '
                'Restart the receiver to apply the schema migration.</div>')

    has_any = any(d[k] for k in ('agent_types', 'repositories', 'edit_types', 'skills', 'hooks'))
    if not has_any:
        return ('<div style="color:var(--text-dim);">No <code style="color:var(--cyan);">'
                'github.copilot.*</code> attributes in the selected period. These are emitted '
                'by VS Code 1.122+ (legacy <code>copilot_chat.*</code> spans carry no repo/agent context).</div>')

    sections = []

    if d['agent_types']:
        rows = '\n'.join(f'''          <tr>
            <td><span class="agent-tag">{a['type']}</span></td>
            <td class="r">{a['count']}</td>
            <td class="r">{fmt(a['input'])}</td>
            <td class="r">{fmt(a['output'])}</td>
          </tr>''' for a in d['agent_types'])
        sections.append(f'''      <div style="margin-bottom:12px;">
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;">AGENT TYPE</div>
        <table>
          <tr><th>Type</th><th class="r">Calls</th><th class="r">Input</th><th class="r">Output</th></tr>
{rows}
        </table>
      </div>''')

    if d['repositories']:
        rows = '\n'.join(f'''          <tr>
            <td><code style="color:var(--cyan);">{r['repo']}</code>{(' <span style="color:var(--text-dim);font-size:10px;">@ ' + r['branch'] + '</span>') if r['branch'] else ''}</td>
            <td class="r">{r['count']}</td>
            <td class="r">{fmt(r['input'])}</td>
            <td class="r">{fmt(r['output'])}</td>
          </tr>''' for r in d['repositories'])
        sections.append(f'''      <div style="margin-bottom:12px;">
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;">REPOSITORY (top 10 by input tokens)</div>
        <table>
          <tr><th>Repo</th><th class="r">Calls</th><th class="r">Input</th><th class="r">Output</th></tr>
{rows}
        </table>
      </div>''')

    if d['edit_types']:
        rows = '\n'.join(f'''          <tr>
            <td><code style="color:var(--green);">{e['type']}</code></td>
            <td class="r">{e['count']}</td>
          </tr>''' for e in d['edit_types'])
        sections.append(f'''      <div style="margin-bottom:12px;">
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;">EDIT TYPE</div>
        <table>
          <tr><th>Type</th><th class="r">Count</th></tr>
{rows}
        </table>
      </div>''')

    if d['skills']:
        rows = '\n'.join(f'''          <tr>
            <td><code style="color:var(--purple);">{s['name']}</code></td>
            <td class="r">{s['count']}</td>
          </tr>''' for s in d['skills'])
        sections.append(f'''      <div style="margin-bottom:12px;">
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;">SKILL INVOCATIONS</div>
        <table>
          <tr><th>Skill</th><th class="r">Count</th></tr>
{rows}
        </table>
      </div>''')

    if d['hooks']:
        rows = '\n'.join(f'''          <tr>
            <td><code style="color:var(--orange);">{h['decision']}</code></td>
            <td class="r">{h['count']}</td>
            <td class="r">{h['avg_s']:.3f}s</td>
          </tr>''' for h in d['hooks'])
        sections.append(f'''      <div>
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;">HOOK OUTCOMES</div>
        <table>
          <tr><th>Decision</th><th class="r">Count</th><th class="r">Avg Dur</th></tr>
{rows}
        </table>
      </div>''')

    return '\n'.join(sections)


def build_workspace_cost(d):
    """Cost per VS Code workspace, attributed via the workspace.name resource
    attribute (set by the essence-code launcher). Spans with no tag appear in an
    explicit '(untagged)' row, and a caption reports the % of cost that is
    attributed so the panel never overstates coverage."""
    workspaces = d.get('workspaces', [])
    if not workspaces:
        return '<div style="color:var(--text-dim);">No data in the selected period.</div>'

    only_untagged = all(w['workspace'] == _UNTAGGED for w in workspaces)
    if only_untagged:
        return ('<div style="background:var(--card-bg);border:1px solid var(--yellow);border-radius:8px;'
                'padding:14px 18px;margin:8px 0;">'
                '<div style="color:var(--yellow);font-weight:bold;margin-bottom:8px;">'
                '\u26a0 All cost is untagged — per-workspace attribution is not active</div>'
                '<div style="color:var(--text-dim);font-size:12px;line-height:1.6;">'
                'To see cost broken down by project, launch VS Code with the '
                '<code style="color:var(--green);">essence-code</code> command instead of '
                '<code>code</code>:<br><br>'
                '<code style="color:var(--cyan);background:rgba(255,255,255,0.05);padding:2px 8px;'
                'border-radius:4px;">essence-code C:\\path\\to\\my-project</code><br><br>'
                'This stamps <code style="color:var(--cyan);">workspace.name</code> onto every '
                'telemetry span. Run <code style="color:var(--green);">python setup.py --install-launcher'
                '</code> to add it to your PATH.<br>'
                '<span style="color:var(--text-dim);font-size:10px;">'
                'Note: VS Code reuses one background process on Windows. The tag is read when '
                'that process first starts, so quit VS Code fully before launching with a new tag.'
                '</span></div></div>')

    total_cost = d.get('workspace_total_cost', 0) or 1
    rows = []
    for w in workspaces:
        is_untagged = w['workspace'] == _UNTAGGED
        share = w['cost'] / total_cost * 100
        name_cell = (f'<span style="color:var(--text-dim);font-style:italic;">{w["workspace"]}</span>'
                     if is_untagged
                     else f'<code style="color:var(--cyan);">{w["workspace"]}</code>')
        rows.append(f'''          <tr>
            <td>{name_cell}</td>
            <td class="r">{w['calls']}</td>
            <td class="r">{fmt(w['input'])}</td>
            <td class="r">{fmt(w['output'])}</td>
            <td class="r" style="color:var(--yellow);">{fmt_cost(w['cost'])}</td>
            <td class="r">{fmt_pct(share)}</td>
          </tr>''')
    rows_html = '\n'.join(rows)

    attributed_pct = d.get('workspace_attributed_pct', 0)
    low_attribution = attributed_pct < 50
    hint = ''
    if low_attribution:
        hint = (' To increase attribution, launch VS Code with '
                '<code style="color:var(--green);">essence-code</code> '
                'instead of <code>code</code>.')
    caption = (f'<div style="font-size:10px;color:var(--text-dim);margin-top:8px;">'
               f'{fmt_pct(attributed_pct)} of credits attributed to a named workspace. '
               f'Untagged spans (old data or windows launched without '
               f'<code>essence-code</code>) are grouped separately.{hint}</div>')

    return f'''      <table>
          <tr><th>Workspace</th><th class="r">Calls</th><th class="r">Input</th><th class="r">Output</th><th class="r">Credits</th><th class="r">Share</th></tr>
{rows_html}
        </table>
{caption}'''


def build_context_growth(d):
    calls = d['calls']
    if not calls:
        return _NO_DATA_HTML
    cumulative = []
    running = 0
    for c in calls:
        running += c['input']
        cumulative.append(running)
    max_val = cumulative[-1] if cumulative else 1
    n = len(cumulative)
    points = ['0% 100%']
    for i, val in enumerate(cumulative):
        x = (i + 1) / n * 100
        y = 100 - (val / max_val * 100)
        points.append(f'{x:.1f}% {y:.1f}%')
    points.append('100% 100%')
    polygon = ', '.join(points)
    return f'''      <div style="position:relative;height:150px;margin:20px 0 10px 60px;">
        <div style="position:absolute;inset:0;background:var(--border);border-radius:4px;overflow:hidden;">
          <div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(63,185,80,0.3), rgba(63,185,80,0.05));clip-path:polygon({polygon});"></div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-dim);margin-top:8px;">
        <span>Start</span>
        <span>Total input: <strong>{fmt(max_val)}</strong></span>
      </div>'''


def _session_bucket_color(label):
    """Return CSS color variable for a session size bucket label."""
    if label == '1-5':
        return _CSS_GREEN
    if label == '6-15':
        return 'var(--accent)'
    if label == '16-30':
        return _CSS_ORANGE
    return _CSS_RED


def _session_impact_verdict(buckets, total_input_all):
    """Return (severity_color, verdict_text) for the session impact summary."""
    long_sessions = buckets.get('31+', {'sessions': 0, 'total_input': 0})
    total_sessions = sum(b['sessions'] for b in buckets.values())
    long_pct = (long_sessions['sessions'] / total_sessions * 100) if total_sessions else 0
    long_input_pct = (long_sessions['total_input'] / total_input_all * 100) if total_input_all else 0
    if long_input_pct > 30:
        return (_CSS_RED,
                f'⚠ {long_sessions["sessions"]} long sessions ({fmt_pct(long_pct, 0)} of sessions) consume {fmt_pct(long_input_pct, 0)} of all input tokens. Start new chats every 5–8 turns.')
    if long_input_pct > 15:
        return (_CSS_ORANGE,
                f'{long_sessions["sessions"]} long sessions use {fmt_pct(long_input_pct, 0)} of input. Consider shorter sessions.')
    return (_CSS_GREEN, 'Session lengths look healthy. Keep using short, focused chats.')


def build_session_impact(d):
    """Panel: Session Length Impact — shows how long sessions drive cost."""
    buckets = d.get('session_buckets', {})
    if not buckets:
        return '<div style="color:var(--text-dim);">No session data</div>'
    order = ['1-5', '6-15', '16-30', '31+']
    total_input_all = sum(b.get('total_input', 0) for b in buckets.values())
    max_input = max((b.get('total_input', 0) for b in buckets.values()), default=1)
    rows = []
    for label in order:
        b = buckets.get(label, {'sessions': 0, 'total_input': 0, 'total_cached': 0, 'avg_input': 0, 'total_output': 0})
        pct_of_total = (b['total_input'] / total_input_all * 100) if total_input_all else 0
        bar_pct = (b['total_input'] / max_input * 100) if max_input else 0
        billable = b['total_input'] - b.get('total_cached', 0)
        cost = 0
        for m in d.get('models', []):
            if total_input_all > 0:
                cost += m['cost'] * (b['total_input'] / total_input_all)
        color = _session_bucket_color(label)
        rows.append(f'''        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:12px;font-weight:600;color:{color};">{label} spans</span>
            <span style="font-size:11px;color:var(--text-dim);">{b['sessions']} sessions · {fmt_pct(pct_of_total, 0)} of input</span>
          </div>
          <div class="bar-container" style="height:14px;">
            <div class="bar-fill" style="width:{bar_pct:.0f}%;background:{color};border-radius:3px;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-dim);margin-top:2px;">
            <span>Input: {fmt_tok(b['total_input'])}</span>
            <span>Billable: {fmt_tok(billable)}</span>
            <span style="color:var(--yellow);">{fmt_cost(cost)}</span>
          </div>
        </div>''')
    # Summary insight
    severity, verdict = _session_impact_verdict(buckets, total_input_all)
    rows.append(f'''        <div style="margin-top:12px;padding:8px 12px;background:rgba(255,255,255,0.03);border-left:3px solid {severity};border-radius:0 4px 4px 0;font-size:11px;color:var(--text);">{verdict}</div>''')
    return '\n'.join(rows)


def _hourly_intensity_color(bar_pct):
    """Return CSS color variable for hourly bar intensity."""
    if bar_pct > 75:
        return _CSS_RED
    if bar_pct > 40:
        return _CSS_ORANGE
    return 'var(--accent)'


def build_hourly_consumption(d):
    """Panel: Hourly Consumption — shows token burn rate by hour."""
    hourly = d.get('hourly', [])
    if not hourly:
        return '<div style="color:var(--text-dim);">No hourly data</div>'
    max_billable = max((h['billable'] for h in hourly), default=1)
    rows = []
    for h in hourly:
        hr = h['hour'].astimezone(LOCAL_TZ).strftime('%H:%M') if h['hour'] else '—'
        bar_pct = (h['billable'] / max_billable * 100) if max_billable else 0
        cost = 0
        for m in d.get('models', []):
            if d['total_input'] > 0:
                cost += m['cost'] * (h['input'] / d['total_input'])
        intensity = _hourly_intensity_color(bar_pct)
        rows.append(f'''        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
          <span style="font-size:10px;color:var(--text-dim);width:40px;text-align:right;font-family:monospace;">{hr}</span>
          <div style="flex:1;height:12px;background:var(--border);border-radius:3px;overflow:hidden;position:relative;">
            <div style="width:{bar_pct:.0f}%;height:100%;background:{intensity};border-radius:3px;"></div>
          </div>
          <span style="font-size:9px;color:var(--text-dim);width:50px;text-align:right;">{fmt_tok(h['billable'])}</span>
          <span style="font-size:9px;color:var(--yellow);width:40px;text-align:right;">{fmt_cost(cost)}</span>
          <span style="font-size:9px;color:var(--text-dim);width:30px;text-align:right;">{h['calls']}</span>
        </div>''')
    header = '''      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:9px;color:var(--text-dim);">
        <span style="width:40px;text-align:right;">Hour</span>
        <span style="flex:1;text-align:center;">Net Billable Tokens</span>
        <span style="width:50px;text-align:right;">Billable</span>
        <span style="width:40px;text-align:right;">Cost</span>
        <span style="width:30px;text-align:right;">Calls</span>
      </div>'''
    peak = max(hourly, key=lambda h: h['billable'])
    peak_hr = peak['hour'].astimezone(LOCAL_TZ).strftime('%H:%M') if peak['hour'] else '—'
    summary = f'''      <div style="margin-top:10px;font-size:11px;color:var(--text-dim);">Peak hour: <strong style="color:var(--red);">{peak_hr}</strong> with {fmt_tok(peak['billable'])} billable tokens across {peak['calls']} LLM calls</div>'''
    return header + '\n' + '\n'.join(rows) + '\n' + summary


def _friendly_agent(name):
    """Convert internal agent names to user-friendly labels."""
    mapping = {
        'backgroundTodoAgent': 'Background Agent',
        'summarizeConversationHistory-full': 'Low Cache',
        'summarizeConversationHistory': 'Low Cache',
        'panel/editAgent': 'Edit Agent',
        'panel/chat': 'Chat Panel',
        'copilot-chat': 'Copilot Chat',
        'inline/completions': 'Inline Completions',
    }
    if name in mapping:
        return mapping[name]
    # CamelCase / dash splitting fallback
    s = re.sub(r'([a-z])([A-Z])', r'\1 \2', name)
    s = s.replace('-', ' ').replace('_', ' ').replace('/', ' › ')
    return s.title()


def _check_long_sessions(d, recs):
    """Check for long sessions consuming excessive input tokens."""
    long = d.get('session_buckets', {}).get('31+', {'sessions': 0, 'total_input': 0})
    total_input = d.get('total_input', 1)
    if long['sessions'] > 0 and total_input > 0:
        pct = long['total_input'] / total_input * 100
        if pct > 25:
            recs.append(('HIGH', _CSS_RED, 'Long Sessions',
                f'{long["sessions"]} sessions with 31+ spans consume {fmt_pct(pct, 0)} of input. '
                f'Start a new chat every 5–8 turns to prevent context snowball.'))


def _check_background_agents(d, recs):
    """Check for background agents with poor cache efficiency."""
    for ae in d.get('agent_efficiency', []):
        if 'background' in ae['agent'].lower() and ae['cache_pct'] < 30 and ae['billable'] > 500000:
            recs.append(('HIGH', _CSS_RED, _friendly_agent(ae['agent']),
                f'{ae["calls"]} calls with only {fmt_pct(ae["cache_pct"])} cache hit = {fmt_tok(ae["billable"])} wasted billable tokens. '
                f'Disable in settings: "github.copilot.chat.agent.backgroundTodoAgent.enabled": false'))


def _check_agent_cache(d, recs):
    """Check for non-background agents with low cache efficiency."""
    for ae in d.get('agent_efficiency', []):
        if 'background' in ae['agent'].lower():
            continue
        if ae['cache_pct'] < 50 and ae['billable'] > 100000:
            recs.append(('MEDIUM', _CSS_ORANGE, 'Low Cache Efficiency',
                f'{fmt_pct(ae["cache_pct"])} cache hit on {ae["calls"]} calls. '
                f'{fmt_tok(ae["billable"])} billable tokens could be reduced with shorter sessions.'))


def _check_model_cost(d, recs):
    """Check for single model dominating cost."""
    if not d.get('models'):
        return
    top_model = d['models'][0]
    if top_model['cost'] > 10 and len(d['models']) > 1:
        cheap_cost = sum(m['cost'] for m in d['models'][1:])
        ratio = top_model['cost'] / max(cheap_cost, 0.01)
        if ratio > 50:
            recs.append(('MEDIUM', _CSS_ORANGE, 'Model Cost Imbalance',
                f'{top_model["name"]} costs {fmt_cost(top_model["cost"])} ({ratio:.0f}x more than all other models combined). '
                f'Route simple Q&A to GPT-4o-mini via the model picker.'))


def _check_tool_reads(d, recs):
    """Check for excessive file read tool calls."""
    for t in d.get('tools', []):
        if t['name'] == 'read_file' and t['count'] > 50:
            recs.append(('MEDIUM', _CSS_ORANGE, 'Frequent File Reads',
                f'{t["count"]} read_file calls inflate context history. '
                f'Use the Explore subagent for large reads to keep the main chat lean.'))


def _check_cache_health(d, recs):
    """Check for healthy cache patterns."""
    if d.get('cache_pct', 0) > 90:
        recs.append(('OK', _CSS_GREEN, 'Cache Hit Rate',
            f'{fmt_pct(d["cache_pct"])} cache hit rate is excellent. '
            f'Anthropic prompt caching is working effectively.'))


def build_recommendations(d):
    """Panel: Usage Insights — dynamic recommendations based on detected patterns."""
    recs = []
    _check_long_sessions(d, recs)
    _check_background_agents(d, recs)
    _check_agent_cache(d, recs)
    _check_model_cost(d, recs)
    _check_tool_reads(d, recs)
    _check_cache_health(d, recs)

    if not recs:
        recs.append(('OK', _CSS_GREEN, 'No Issues Detected',
            'Token consumption patterns look healthy.'))

    _SEVERITY_ICONS = {'HIGH': '🔴', 'MEDIUM': '🟠'}

    cards = []
    for idx, (severity, color, title, desc) in enumerate(recs):
        letter = chr(65 + idx)  # A, B, C, ...
        icon = _SEVERITY_ICONS.get(severity, '🟢')
        cards.append(f'''        <div style="flex:1 1 0%;min-width:0;padding:10px 12px;background:rgba(255,255,255,0.02);border-left:3px solid {color};border-radius:0 4px 4px 0;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <span style="font-size:14px;">{icon}</span>
            <span style="font-size:12px;font-weight:600;color:{color};">{severity}</span>
            <span style="font-size:12px;color:var(--text);font-weight:500;">{letter}. {title}</span>
          </div>
          <div style="font-size:11px;color:var(--text-dim);line-height:1.5;overflow-wrap:break-word;">{desc}</div>
        </div>''')
    return '      <div style="display:flex;gap:12px;">\n' + '\n'.join(cards) + '\n      </div>'


# ---------------------------------------------------------------------------
# Panel replacement engine
# ---------------------------------------------------------------------------

def count_divs(text):
    """Count <div and </div> occurrences in text. Returns (opens, closes)."""
    import re
    opens = len(re.findall(r'<div', text))
    closes = len(re.findall(r'</div>', text))
    return opens, closes


def verify_div_balance(html, label=''):
    """Check global div balance. Warns if unbalanced."""
    opens, closes = count_divs(html)
    diff = opens - closes
    if diff != 0:
        print(f'  ⚠ DIV IMBALANCE {label}: {opens} opens, {closes} closes, diff={diff}')
    return diff


def replace_panel_content(html, heading_text, new_content):
    """Find panel by heading text, replace content between </h2> and panel's closing </div>.
    Uses balanced div counting to find the correct panel boundary."""
    # Search for heading_text only within <h2> tags to avoid matching content text
    h2_pattern = re.compile(r'<h2[^>]*>[^<]*' + re.escape(heading_text))
    h2_match = h2_pattern.search(html)
    if not h2_match:
        # Fallback: try finding heading_text followed by </h2> (with optional text between)
        fallback = re.compile(re.escape(heading_text) + r'[^<]*</h2>')
        h2_match = fallback.search(html)
    if not h2_match:
        print(f'  WARNING: "{heading_text}" not found in heading, skipping')
        return html
    idx = h2_match.start()

    # Walk backwards to find the <div class="panel..."> that contains this heading.
    # Must use regex to match panels with extra classes like "panel collapsible".
    # Pattern matches <div class="panel"> or <div class="panel collapsible"> etc.
    panel_pattern = re.compile(r'<div\s+class="panel(?:\s[^"]*)?"')
    matches = list(panel_pattern.finditer(html, 0, idx))
    panel_start = matches[-1].start() if matches else -1
    if panel_start < 0:
        print(f'  WARNING: panel div not found for "{heading_text}"')
        return html

    # Find </h2> after heading
    h2_end = html.find('</h2>', idx)
    if h2_end < 0:
        return html
    content_start = h2_end + 5

    # Count balanced divs from panel_start to find the closing </div>
    depth = 0
    i = panel_start
    panel_end = -1
    while i < len(html):
        if html[i:i+4] == '<div':
            depth += 1
        elif html[i:i+6] == '</div>':
            depth -= 1
            if depth == 0:
                panel_end = i
                break
        i += 1

    if panel_end < 0:
        print(f'  WARNING: could not find closing div for "{heading_text}"')
        return html

    # Verify new content has balanced divs
    nc_opens, nc_closes = count_divs(new_content)
    if nc_opens != nc_closes:
        print(f'  ⚠ BUILDER BUG: "{heading_text}" content has {nc_opens} opens, {nc_closes} closes')

    # Replace content between </h2> and the closing </div> of the panel
    return html[:content_start] + '\n' + new_content + '\n    ' + html[panel_end:]


def _update_header_timestamps(html, d):
    """Update header timestamps and window range display."""
    now = datetime.now(LOCAL_TZ)
    now_display = now.strftime('%b %d, %Y \u00b7 %H:%M:%S')
    html = re.sub(
        r'(<span id="lastUpdated"[^>]*>)\([^)]+\)(</span>)',
        lambda m: f'{m.group(1)}({now_display}){m.group(2)}',
        html
    )
    if d['window_start']:
        ws = d['window_start'].astimezone(LOCAL_TZ)
        we = d['window_end'].astimezone(LOCAL_TZ)
        dur = we - ws
        total_sec = int(dur.total_seconds())
        days, remainder = divmod(total_sec, 86400)
        hours, remainder = divmod(remainder, 3600)
        mins = remainder // 60
        if days > 0:
            dur_str = f'{days}d {hours}h {mins:02d}m'
        elif hours > 0:
            dur_str = f'{hours}h {mins:02d}m'
        else:
            dur_str = f'{mins}m'
        ws_display = ws.strftime('%b %d, %H:%M')
        we_display = we.strftime('%b %d, %H:%M')
        html = re.sub(
            r'(<span class="meta-value">)[^<]+(</span>\s*<span\s+class="meta-badge">)[^<]*(</span>)',
            lambda m: f'{m.group(1)}{ws_display} \u2192 {we_display}{m.group(2)}{dur_str}{m.group(3)}',
            html,
            count=1
        )
    print('  \u2713 Header timestamps')
    return html


def _update_filters(html, d):
    """Update period filter buttons and workspace dropdown."""
    period = d.get('period', 'all')
    for p_key in PERIOD_MAP:
        active_cls = 'period-btn active' if p_key == period else 'period-btn'
        html = re.sub(
            rf'class="period-btn(?:\s+active)?" data-period="{p_key}"',
            f'class="{active_cls}" data-period="{p_key}"',
            html
        )
    print(f'  \u2713 Period filter ({period})')

    # Workspace filter dropdown — rebuild <option> list from the live workspace set,
    # marking the active selection. Replaces the inner HTML of #workspaceFilter.
    def _esc(s):
        return (s.replace('&', '&amp;').replace('<', '&lt;')
                 .replace('>', '&gt;').replace('"', '&quot;'))
    active_ws = d.get('workspace', 'all')
    opt_lines = [f'<option value="all"{" selected" if active_ws == "all" else ""}>All workspaces</option>']
    for ws_name in d.get('workspace_options', []):
        sel = ' selected' if ws_name == active_ws else ''
        opt_lines.append(f'<option value="{_esc(ws_name)}"{sel}>{_esc(ws_name)}</option>')
    opts_html = ''.join(opt_lines)
    html = re.sub(
        r'(<select id="workspaceFilter"[^>]*>).*?(</select>)',
        lambda m: f'{m.group(1)}{opts_html}{m.group(2)}',
        html,
        count=1,
        flags=re.DOTALL
    )
    print(f'  \u2713 Workspace filter ({active_ws}, {len(d.get("workspace_options", []))} options)')
    return html


def _update_session_banner(html, d):
    """Update the session banner with latest session data."""
    spans = d.get('latest_span_count', 0)
    turns = d.get('latest_turn_count', 0)
    trace_label = d.get('latest_trace_id', '\u2014')
    over_cls = 'over' if turns > 15 else ''
    if turns > 15:
        cta = f'\u26a0 {turns} turns \u2014 start a new chat to reduce context cost'
    elif turns > 0:
        cta = f'{turns} turns'
    else:
        cta = ''
    banner_html = f'''    <div class="session-banner {over_cls}" style="position:relative;">
      <span class="session-count">Current Session \u2014 <strong id="session-span-count">{spans}</strong> spans</span>
      <span class="session-cta">{cta}</span>
    </div>'''
    html = re.sub(
        r'<div class="session-banner[^"]*"[^>]*>.*?</div>',
        banner_html,
        html,
        count=1,
        flags=re.DOTALL
    )
    print(f'  \u2713 Session banner ({spans} spans, {turns} turns, {trace_label})')
    return html


def _update_kpi_row(html, d):
    """Replace the KPI row HTML using balanced div counting."""
    kpi_start = html.find('<div class="kpi-row">')
    if kpi_start >= 0:
        depth = 0
        i = kpi_start
        while i < len(html):
            if html[i:i+4] == '<div':
                depth += 1
            elif html[i:i+6] == '</div>':
                depth -= 1
                if depth == 0:
                    kpi_end = i + 6
                    break
            i += 1
        html = html[:kpi_start] + build_kpi_row(d) + html[kpi_end:]
        print('  \u2713 KPI cards')
    return html


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description='Update ESSENCE Token Dashboard from PostgreSQL')
    parser.add_argument('--dashboard', default=DASH_DEFAULT, help='Dashboard HTML path')
    parser.add_argument('--dry-run', action='store_true', help='Print data only')
    parser.add_argument('--period', default='all', choices=list(PERIOD_MAP.keys()),
                        help='Time period filter (default: all)')
    parser.add_argument('--workspace', default='all',
                        help='Workspace filter by workspace.name (default: all)')
    args = parser.parse_args()

    print(f'Querying PostgreSQL (period={args.period}, workspace={args.workspace})...')
    d = fetch_all_data(period=args.period, workspace=args.workspace)

    print(f'  LLM Calls: {d["llm_calls"]}')
    print(f'  Total Tokens: {fmt(d["total_tokens"])}')
    print(f'  Cache Hit: {fmt_pct(d["cache_pct"])}')
    print(f'  Cost: {fmt_cost(d["total_cost"])}')
    print(f'  Spans: {d["total_spans"]}')
    print(f'  Models: {", ".join(m["name"] for m in d["models"])}')
    if d['window_start']:
        ws = d['window_start'].astimezone(LOCAL_TZ).strftime('%H:%M:%S')
        we = d['window_end'].astimezone(LOCAL_TZ).strftime('%H:%M:%S')
        print(f'  Window: {ws} \u2192 {we} ({fmt_duration(d["duration_s"])})')

    if args.dry_run:
        print('\n[DRY RUN] Not writing.')
        return

    print(f'\nReading {args.dashboard}...')
    with open(args.dashboard, 'r', encoding='utf-8') as f:
        html = f.read()

    # Verify input HTML is balanced before modifying
    pre_diff = verify_div_balance(html, 'INPUT')
    if pre_diff != 0:
        print(f'  ⚠ Input HTML already has {abs(pre_diff)} unbalanced div(s). Fix before running.')
        return

    # Header timestamps
    html = _update_header_timestamps(html, d)

    # Period and workspace filters
    html = _update_filters(html, d)

    # Session banner
    html = _update_session_banner(html, d)

    # KPI row
    html = _update_kpi_row(html, d)

    # All panels
    panels = [
        ('Cost by Model',           build_cost_table),
        ('Cache Efficiency',        build_cache_ring),
        ('Token Composition',       build_token_composition),
        ('Token Breakdown by Model', build_breakdown_table),
        ('V9 \u2014',               build_efficiency_panel),
        ('Tokens per LLM Call',     build_tokens_per_call),
        ('Cumulative Tokens',       build_cumulative_chart),
        ('Time to First Token',     build_ttft_chart),
        ('Internal Agent Types',    build_agents_table),
        ('Tools',                   build_tools_table),
        ('Workspace and Agent Context', build_github_context),
        ('Cost per Workspace',      build_workspace_cost),
        ('Context Growth',          build_context_growth),
        ('Session Length Impact',   build_session_impact),
        ('Hourly Consumption',     build_hourly_consumption),
        ('Usage Insights',         build_recommendations),
    ]
    for heading, builder in panels:
        new_content = builder(d)
        html = replace_panel_content(html, heading, new_content)
        print(f'  \u2713 {heading}')

    # Verify div balance before writing
    diff = verify_div_balance(html, 'FINAL')
    if diff != 0:
        print(f'  ⚠ WARNING: {abs(diff)} {"missing </div>" if diff > 0 else "extra </div>"} detected!')
        print('  Dashboard NOT saved to prevent layout corruption.')
        print('  Fix builder functions or template HTML and re-run.')
        return

    with open(args.dashboard, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'\nDashboard saved: {args.dashboard}')


if __name__ == '__main__':
    main()
