import psycopg2, json, os, atexit
from datetime import datetime
from pricing import calc_cost  # shared cost SSOT — Copilot credits per 1M tokens

conn = psycopg2.connect(
    host=os.environ.get('DB_HOST', 'localhost'),
    port=int(os.environ.get('DB_PORT', '5433')),
    dbname=os.environ.get('DB_NAME', 'essence_telemetry'),
    user=os.environ.get('DB_USER', 'essence'),
    password=os.environ['DB_PASS'],
)
atexit.register(conn.close)  # ensure the connection closes even on an exception
cur = conn.cursor()

# Backfill TTFT
cur.execute('SELECT id, attributes FROM spans WHERE attributes IS NOT NULL AND ttft_ms IS NULL')
rows = cur.fetchall()
u = 0
for rid, raw in rows:
    a = json.loads(raw) if isinstance(raw, str) else raw
    ttft = a.get('copilot_chat.time_to_first_token')
    if ttft:
        cur.execute('UPDATE spans SET ttft_ms = %s WHERE id = %s', (float(ttft), rid))
        u += 1
conn.commit()
print(f'Backfilled TTFT for {u} rows')

# Summary by model
cur.execute('''
    SELECT response_model, COUNT(*) as calls,
           COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0),
           COALESCE(SUM(cached_tokens),0), COALESCE(SUM(cache_creation_tokens),0),
           ROUND(AVG(ttft_ms)::numeric,0),
           MIN(start_time_ms), MAX(end_time_ms)
    FROM spans WHERE input_tokens > 0
    GROUP BY response_model
''')
for r in cur.fetchall():
    print(f'{r[0]}: {r[1]} calls, in={r[2]:,}, out={r[3]:,}, cached={r[4]:,}, create={r[5]:,}, ttft_avg={r[6]}ms')

# Totals
cur.execute('''SELECT COUNT(*), SUM(input_tokens), SUM(output_tokens), SUM(cached_tokens), 
    SUM(cache_creation_tokens), MIN(start_time_ms), MAX(end_time_ms), COUNT(DISTINCT trace_id)
    FROM spans WHERE input_tokens > 0''')
t = cur.fetchone()
total_tokens = t[1] + t[2]
cache_pct = (t[3] / t[1] * 100) if t[1] else 0
print(f'\nTOTAL: {t[0]} calls, total={total_tokens:,}, in={t[1]:,}, out={t[2]:,}')
print(f'  cached={t[3]:,} ({cache_pct:.1f}%), cache_create={t[4]:,}')
start_t = datetime.fromtimestamp(t[5]/1000)
end_t = datetime.fromtimestamp(t[6]/1000)
print(f'  Window: {start_t.strftime("%Y-%m-%d %H:%M:%S")} to {end_t.strftime("%H:%M:%S")}')
duration = (t[6] - t[5]) / 1000
print(f'  Duration: {duration:.0f}s ({duration/60:.1f}m)')
print(f'  Traces: {t[7]}')

# Cost calc — Copilot credits via the shared pricing SSOT (pricing.py)
cur.execute('''
    SELECT response_model, SUM(input_tokens), SUM(output_tokens), SUM(cached_tokens)
    FROM spans WHERE input_tokens > 0 GROUP BY response_model
''')
print('\nCost (Copilot credits):')
total_cost = 0
for r in cur.fetchall():
    model, inp, out, cached = r
    cached = min(max(cached or 0, 0), inp or 0)
    non_cached_input = (inp or 0) - cached
    cost = calc_cost(model, inp, out, cached)
    print(f'  {model}: {cost:,.1f} cr (non-cached={non_cached_input:,}, cached={cached:,}, out={out:,})')
    total_cost += cost
print(f'  TOTAL COST: {total_cost:,.1f} credits')

# TTFT
cur.execute('''
    SELECT response_model,
           MIN(ttft_ms), PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ttft_ms),
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ttft_ms),
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ttft_ms),
           PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ttft_ms),
           MAX(ttft_ms), COUNT(ttft_ms)
    FROM spans WHERE ttft_ms > 0 GROUP BY response_model
''')
print('\nTTFT:')
for r in cur.fetchall():
    print(f'  {r[0]}: min={r[1]:.0f}, p25={r[2]:.0f}, med={r[3]:.0f}, p75={r[4]:.0f}, p95={r[5]:.0f}, max={r[6]:.0f} ({r[7]} calls)')

# Agents and tools
cur.execute("SELECT agent_name, COUNT(*) FROM spans WHERE agent_name IS NOT NULL GROUP BY agent_name ORDER BY COUNT(*) DESC")
print('\nAgents:')
for r in cur.fetchall():
    print(f'  {r[0]}: {r[1]}')

cur.execute("SELECT tool_name, COUNT(*) FROM spans WHERE tool_name IS NOT NULL GROUP BY tool_name ORDER BY COUNT(*) DESC")
print('\nTools:')
for r in cur.fetchall():
    print(f'  {r[0]}: {r[1]}')

# All spans
cur.execute('SELECT COUNT(*) FROM spans')
print(f'\nAll spans: {cur.fetchone()[0]}')

conn.close()
