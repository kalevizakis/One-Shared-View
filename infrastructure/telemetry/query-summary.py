"""Update existing spans with cache data from JSONB, then print summary."""
import psycopg2
import json
import os
import atexit

conn = psycopg2.connect(
    host=os.environ.get('DB_HOST', 'localhost'),
    port=int(os.environ.get('DB_PORT', '5433')),
    dbname=os.environ.get('DB_NAME', 'essence_telemetry'),
    user=os.environ.get('DB_USER', 'essence'),
    password=os.environ['DB_PASS'],
)
atexit.register(conn.close)  # ensure the connection closes even on an exception
cur = conn.cursor()

# Backfill cache columns from JSONB attributes
cur.execute('SELECT id, attributes FROM spans WHERE attributes IS NOT NULL')
rows = cur.fetchall()
updated = 0
for row_id, attrs_raw in rows:
    attrs = json.loads(attrs_raw) if isinstance(attrs_raw, str) else attrs_raw
    cache_read = attrs.get('gen_ai.usage.cache_read.input_tokens', 0)
    cache_create = attrs.get('gen_ai.usage.cache_creation.input_tokens', 0)
    ttft = attrs.get('gen_ai.server.time_to_first_token', None)
    if cache_read or cache_create:
        cur.execute(
            'UPDATE spans SET cached_tokens = %s, cache_creation_tokens = %s, ttft_ms = COALESCE(ttft_ms, %s) WHERE id = %s',
            (int(cache_read) if cache_read else 0, int(cache_create) if cache_create else 0, ttft, row_id)
        )
        updated += 1
conn.commit()
print(f'Backfilled {updated} rows with cache data')

# Summary by model
print('\n--- Summary by Model ---')
cur.execute('''
    SELECT response_model, COUNT(*) as calls,
           COALESCE(SUM(input_tokens),0) as input,
           COALESCE(SUM(output_tokens),0) as output,
           COALESCE(SUM(cached_tokens),0) as cached,
           COALESCE(SUM(cache_creation_tokens),0) as cache_create,
           ROUND(AVG(ttft_ms)::numeric, 0) as avg_ttft
    FROM spans WHERE input_tokens > 0
    GROUP BY response_model
''')
for r in cur.fetchall():
    print(f'  {r[0]}: {r[1]} calls, input={r[2]:,}, output={r[3]:,}, cached={r[4]:,}, cache_create={r[5]:,}, avg_ttft={r[6]}ms')

# Totals
cur.execute('''
    SELECT COUNT(*), 
           COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0), 
           COALESCE(SUM(cached_tokens),0), COALESCE(SUM(cache_creation_tokens),0),
           MIN(start_time_ms), MAX(end_time_ms),
           COUNT(DISTINCT trace_id)
    FROM spans WHERE input_tokens > 0
''')
t = cur.fetchone()
print(f'\n  TOTAL: {t[0]} calls, input={t[1]:,}, output={t[2]:,}, cached={t[3]:,}, cache_create={t[4]:,}')
print(f'  Traces: {t[7]}, Time range: {t[5]} to {t[6]}')

# All spans count
cur.execute('SELECT COUNT(*) FROM spans')
all_spans = cur.fetchone()[0]
print(f'  All spans (incl non-token): {all_spans}')

# TTFT by model
print('\n--- TTFT Distribution ---')
cur.execute('''
    SELECT response_model,
           MIN(ttft_ms), 
           PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ttft_ms),
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ttft_ms),
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ttft_ms),
           PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ttft_ms),
           MAX(ttft_ms),
           COUNT(ttft_ms)
    FROM spans WHERE ttft_ms IS NOT NULL AND ttft_ms > 0
    GROUP BY response_model
''')
for r in cur.fetchall():
    print(f'  {r[0]}: min={r[1]:.0f}, p25={r[2]:.0f}, median={r[3]:.0f}, p75={r[4]:.0f}, p95={r[5]:.0f}, max={r[6]:.0f} ({r[7]} calls)')

conn.close()
