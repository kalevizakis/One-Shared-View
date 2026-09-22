"""Single source of truth for ESSENCE token-cost pricing.

Costs are GitHub Copilot *credits* per 1,000,000 tokens. This module is imported
by both `update-dashboard.py` (the dashboard's cost column) and `full-summary.py`
(the standalone CLI summary) so the two can never diverge. See
`DASHBOARD_COST_SOURCE.md` (same directory) for how these credit rates map to the
Copilot model picker. Models not in the picker fall back to the nearest tier.
"""

# Copilot credits per 1M tokens.
PRICING = {
    'opus':         {'input': 500,  'cached':  50, 'output': 2500},  # Claude Opus 4.x
    'sonnet':       {'input': 300,  'cached':  30, 'output': 1500},  # Claude Sonnet 4.x
    'haiku':        {'input': 100,  'cached':  10, 'output':  500},  # Claude Haiku 4.x
    'codex':        {'input': 175,  'cached':  17, 'output': 1400},  # GPT-5.2/5.3-Codex
    'gpt-5.5':      {'input': 500,  'cached':  50, 'output': 3000},  # GPT-5.5
    'gpt-5.4-mini': {'input':  75,  'cached':   7, 'output':  450},  # GPT-5.4 mini
    'gpt-5.4':      {'input': 250,  'cached':  25, 'output': 1500},  # GPT-5.4
    'gpt-5-mini':   {'input':  25,  'cached':   2, 'output':  200},  # GPT-5 mini
    'gemini-flash': {'input': 150,  'cached':  15, 'output':  900},  # Gemini 3.x Flash
    'gemini-pro':   {'input': 200,  'cached':  20, 'output': 1200},  # Gemini 3.x Pro
    'gpt':          {'input':  25,  'cached':   2, 'output':  200},  # fallback (unlisted GPT)
}


# Ordered model-tier match rules — first predicate that matches wins. Kept as data
# (rather than a long if-chain) so the tiering stays explicit and get_pricing's
# cognitive complexity stays low.
_TIER_RULES = (
    ('opus',         lambda m: 'opus' in m),
    ('sonnet',       lambda m: 'sonnet' in m),
    ('haiku',        lambda m: 'haiku' in m),
    ('codex',        lambda m: 'codex' in m),
    ('gpt-5.5',      lambda m: '5.5' in m),
    ('gpt-5.4-mini', lambda m: '5.4' in m and 'mini' in m),
    ('gpt-5.4',      lambda m: '5.4' in m),
    ('gpt-5-mini',   lambda m: ('5' in m and 'mini' in m) or '5mini' in m),
    ('gemini-flash', lambda m: 'gemini' in m and ('flash' in m or '3.5' in m)),
    ('gemini-pro',   lambda m: 'gemini' in m),
)


def get_pricing(model):
    """Return (pricing_dict, matched) for a response-model string (None-safe).

    matched=False means no tier keyword matched and the 'gpt' fallback tier is
    being used as an estimate -- callers should surface this rather than
    silently mis-pricing an unrecognized model (it can be off by ~20x).
    """
    m = (model or '').lower()
    for key, matches in _TIER_RULES:
        if matches(m):
            return PRICING[key], True
    return PRICING['gpt'], False


def calc_cost(model, inp, out, cached):
    """Cost in Copilot credits for a (model, input, output, cached) token tuple.

    Token fields are coerced to non-negative and ``cached`` is clamped to ``<= inp``,
    so anomalous data (``None`` fields, or cached tokens exceeding input) can never
    produce a negative cost. Normal inputs are unaffected.
    """
    inp = max(inp or 0, 0)
    out = max(out or 0, 0)
    cached = min(max(cached or 0, 0), inp)
    p, _matched = get_pricing(model)
    non_cached = inp - cached
    return (non_cached / 1e6 * p['input']) + (cached / 1e6 * p['cached']) + (out / 1e6 * p['output'])
