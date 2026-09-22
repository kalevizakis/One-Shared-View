---
file: a1-logging-observability.md
persona: A1 Logging & Observability
version: 2.8.0
last_updated: 2026-05-31
changelog: 2.4.2
---

# A1 — Logging & Observability

> Load this file when setting up logging infrastructure, adding observability to a service, configuring monitoring, or debugging production issues where logs are insufficient. Complements `a1-error-handling.md` (error lifecycle) and `a5-infrastructure.md` (infrastructure monitoring).

## When to Load This File

- User says "logging", "observability", "correlation ID", "monitoring", "tracing"
- Setting up a new service that needs structured logging
- Debugging production issues where current logs are insufficient
- Configuring log aggregation (ELK, Datadog, CloudWatch)

---

## §1 Log Levels & What to Log

```
logLevels[5]{level,when,example}:
FATAL,process is about to crash — unrecoverable programmer error,"Database connection pool exhausted — shutting down"
ERROR,operation failed — requires attention but process survives,"Payment processing failed for order #123: timeout after 30s"
WARN,unexpected condition — degraded but functional,"Cache miss rate >80% — falling back to direct DB queries"
INFO,significant business events — the audit trail,"Order #123 created by user U456 — total: $299.00"
DEBUG,developer diagnostics — NEVER in production default,"SQL query took 234ms: SELECT * FROM orders WHERE..."
```

### What to Include in Every Log Entry

```
logFields[7]{field,purpose,example}:
timestamp,when it happened,2025-01-15T14:30:22.456Z (ISO 8601 / UTC)
level,severity,INFO
correlationId,trace across services,x-txn-abc123def
service,which service emitted,order-service
message,human-readable description,Order created successfully
context,structured business data,{orderId: 123 / userId: 456 / amount: 299}
error,error details (when applicable),{name: TimeoutError / stack: ... / code: ETIMEOUT}
```

### What NOT to Log

- **Passwords, tokens, API keys** — never, even at DEBUG level
- **PII/PHI** — redact or hash (patient names, SSNs, email addresses) `[CC#2 PHI/PII]`
- **Full request/response bodies** — log summary, not payload (size, content-type, status)
- **High-cardinality data at INFO** — don't log every cache hit, every SQL query in production

---

## §2 Structured JSON Logging

All logs must be JSON — not plaintext. JSON enables filtering, aggregation, and alerting.

### Library Selection

```
logLibraries[5]{stack,library,notes}:
Node.js,Pino,fastest — structured JSON by default / async transport
Node.js (alt),Winston,more plugins — slightly slower / multiple transports
Python,structlog,structured logging wrapper / JSON serializer / processor pipeline
Python (alt),loguru,simpler API — less structured but good for smaller projects
.NET,Serilog,structured logging / JSON sink / enrichment pipeline
```

### Rule: Log to stdout

Let the **infrastructure** handle routing (Docker → CloudWatch, K8s → Fluentd → Elastic). The application writes to stdout/stderr only. No file-based logging in the application.

_Sources: [12-Factor App — XI. Logs](https://12factor.net/logs) — treat logs as event streams; the app never manages routing or storage, it writes unbuffered to stdout._

---

## §3 Correlation IDs

Every request gets a unique ID that follows it across all services and log entries.

### Middleware Pattern (Node.js)

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const als = new AsyncLocalStorage<Map<string, string>>();

// Middleware: extract or generate correlation ID
app.use((req, res, next) => {
  const store = new Map<string, string>();
  const txnId = req.headers['x-correlation-id'] as string || randomUUID();
  store.set('correlationId', txnId);
  res.setHeader('x-correlation-id', txnId);
  als.run(store, () => next());
});

// Logger: auto-append correlation ID
function getCorrelationId(): string {
  return als.getStore()?.get('correlationId') ?? 'no-context';
}
```

### FastAPI Pattern (Python)

```python
import uuid
from contextvars import ContextVar
from starlette.middleware.base import BaseHTTPMiddleware

correlation_id: ContextVar[str] = ContextVar("correlation_id", default="no-context")

class CorrelationIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        txn_id = request.headers.get("x-correlation-id", str(uuid.uuid4()))
        correlation_id.set(txn_id)
        response = await call_next(request)
        response.headers["x-correlation-id"] = txn_id
        return response
```

### Cross-Service Propagation

When calling another service, forward the correlation ID:

```
Header: x-correlation-id: {same-uuid}
```

This enables tracing a single user request across API gateway → auth service → order service → payment service → notification service.

---

## §4 Sensitive Data Redaction

### Redaction Rules

```
redactionRules[5]{field_pattern,action,example}:
password / secret / token / apiKey,replace value with [REDACTED],{"password": "[REDACTED]"}
email,hash or mask,{"email": "j***@pfizer.com"}
SSN / national ID,never log — omit entirely,field not present in log
credit card,mask all but last 4,{"card": "****-****-****-1234"}
PHI (diagnosis / medication / patient name),never log — omit entirely,field not present in log
```

### Implementation

Use Pino's `redact` option or a custom serializer — don't rely on developers remembering to filter manually:

```typescript
const logger = pino({
  redact: ['req.headers.authorization', '*.password', '*.token', '*.apiKey']
});
```

---

## §5 Monitoring Checklist

### Core Metrics (Minimum Viable Monitoring)

```
coreMetrics[6]{metric,threshold,alert}:
Error rate,> 1% of requests in 5 min,Slack + PagerDuty
Response time (p95),> 2s sustained for 5 min,Slack
CPU usage,> 80% sustained for 10 min,Slack
Memory usage,> 85% of limit or > 1.4GB for Node.js,Slack + PagerDuty
Process restart count,> 2 in 10 min,PagerDuty
Queue depth (if applicable),> 1000 pending jobs for 15 min,Slack
```

### RED Method (Request-Driven Services)

- **R**ate — requests per second
- **E**rrors — failed requests per second
- **D**uration — response time distribution (p50, p95, p99)

### USE Method (Infrastructure Resources)

- **U**tilization — % of resource capacity in use
- **S**aturation — queue depth, backpressure
- **E**rrors — hardware/infrastructure errors

### SLI / SLO / Error Budget

Thresholds above are arbitrary until tied to a reliability target. Frame them as objectives:

```
sloModel[3]{term,definition,example}:
SLI (indicator),a measurement of behavior from the user's perspective,"% of requests served < 500ms" / "% of requests without a 5xx"
SLO (objective),the target value for an SLI over a window,"99.9% of requests < 500ms over 30 days"
Error budget,1 − SLO — the allowed unreliability; spend it on releases,"0.1% ≈ 43 min/month of budget; burn it fast → freeze risky deploys"
```

> **Why this matters:** an SLO turns "is p95 < 2s" from a guess into a contract. Alert on **error-budget burn rate**, not raw thresholds — it cuts false pages and ties alerts to user impact.

_Sources: [Google SRE Book — SLOs](https://sre.google/sre-book/service-level-objectives/) (SLI/SLO/error budget). RED method: Tom Wilkie/Weaveworks. USE method: Brendan Gregg._

---

## §6 Distributed Tracing

Logs and metrics are two of the **three pillars** of observability — the third is **traces**. Correlation IDs (§3) are a hand-rolled trace; [OpenTelemetry](https://opentelemetry.io/) (OTel) is the vendor-neutral standard that replaces them.

### Vocabulary

```
traceModel[4]{term,definition}:
Span,a single unit of work (one operation) — has a name, start/end time, attributes, and events
Trace,the full path of one request across services — a tree of spans; the first is the root span
Context propagation,passing trace_id + span_id across service calls so spans join one trace (W3C `traceparent` header)
Baggage,arbitrary key-value context carried alongside the trace (e.g. tenantId) — the standardized form of §3's correlation forwarding
```

### Link Logs to Traces

Include `trace_id` and `span_id` in every structured log entry. This is what makes §1's `correlationId` field obsolete — the trace context *is* the correlation, and it lets you jump from a log line straight to the waterfall view of that request.

```
log fields (§1) + trace context:
{ "level":"ERROR", "trace_id":"4bf92f...", "span_id":"00f067...", "message":"payment timeout" }
```

### Instrumentation

```
instrumentation[2]{approach,when}:
Auto / zero-code,start here — OTel agents auto-instrument HTTP/DB/queue calls with no code changes
Manual,add spans around business-critical operations the auto-instrumentation can't see (e.g. a pricing calculation)
```

> **Sampling:** trace every request in dev; sample in production (head or tail) to control cost — but always keep traces for errors and slow requests.

_Sources: [OpenTelemetry — Observability Primer & Signals](https://opentelemetry.io/docs/concepts/signals/) (traces/spans/baggage, logs correlated with a span); [W3C Trace Context](https://www.w3.org/TR/trace-context/) (`traceparent`). Verified 2026-05-30._

---

## Common Rationalizations

```
rationalizations[5]{excuse,reality}:
"Log everything, disk is cheap",high-cardinality logging is expensive to store AND query, and buries signal in noise — log significant events, sample the rest (§1)
"Add the PII, we'll need it for debugging",CC#2 violation — redact/omit PII/PHI; debug with IDs that join to a secured store, never raw patient data (§4)
"File logging is fine",breaks 12-Factor — the app shouldn't own routing/rotation; write to stdout and let infra aggregate (§2)
"We'll add tracing later",retrofitting context propagation across services is painful; trace_id in logs from day one is nearly free (§6)
"Set the alert threshold and move on",raw thresholds page on non-events; tie alerts to an SLO error-budget burn rate instead (§5)
```

## Red Flags — Stop and Reconsider

```
redFlags[6]{signal,why}:
Secret / token / API key in a log line,never — even at DEBUG; redact at the serializer, not by convention (§4)
PII/PHI in logs,CC#2 — omit or hash; this is a compliance breach, not a style issue (§1/§4)
Plaintext (non-JSON) logs,unfilterable / unaggregatable — structured JSON is mandatory (§2)
No correlation/trace ID across services,a single user request can't be reconstructed — add context propagation (§3/§6)
DEBUG logging on in production by default,cost + noise + leak risk — INFO baseline, DEBUG behind a flag (§1)
Alerting on raw thresholds with no SLO,alert fatigue — page on user-impacting budget burn, not CPU blips (§5)
```
