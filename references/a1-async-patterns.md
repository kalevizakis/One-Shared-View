---
file: a1-async-patterns.md
persona: A1 Async Patterns
version: 2.8.0
last_updated: 2026-05-30
changelog: 2.4.2
---

# A1 — Background Jobs & Async Processing

> Load this file when building task queues, background workers, scheduled jobs, or event-driven processing. Skip for simple async/await patterns within a single request — this covers multi-process async work.

## When to Load This File

- User says "background job", "task queue", "worker", "async processing", "scheduled task"
- Building features that need: email sending, report generation, data export, webhook delivery
- Designing retry logic for unreliable external services
- Setting up dead letter queues for failed job analysis

---

## §1 Queue Architecture

### Components

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  PRODUCER    │────▶│   BROKER    │────▶│   WORKER    │
│  (API/app)   │     │  (Redis/    │     │  (consumer) │
│              │     │   RabbitMQ) │     │             │
│  Adds jobs   │     │  Stores +   │     │  Processes  │
│  to queue    │     │  routes     │     │  jobs       │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                           ┌───────────────────┴──────────────────┐
                           │                                      │
                    ┌──────▼──────┐                        ┌──────▼──────┐
                    │  COMPLETED  │                        │   FAILED    │
                    │  (cleanup)  │                        │  (retry or  │
                    │             │                        │   DLQ)      │
                    └─────────────┘                        └─────────────┘
```

### Library Selection

```
queueLibs[5]{stack,library,broker,notes}:
Node.js,BullMQ,Redis,most popular — 4 classes: Queue/Worker/QueueEvents/FlowProducer
Node.js,Agenda,MongoDB,good when already using MongoDB — cron-style scheduling
Python,Celery,Redis or RabbitMQ,de facto standard — beat scheduler for cron jobs
Python,Dramatiq,Redis or RabbitMQ,simpler API — better defaults than Celery
.NET,Hangfire,SQL Server or Redis,dashboard built-in — fire-and-forget / scheduled / recurring
```

---

## §2 Retry Strategies

When a job fails, retry with backoff — don't hammer the failing service.

### Built-In Strategies

```
retryStrategies[3]{strategy,formula,use_when}:
Fixed,delay ms after every attempt,external service with known recovery time (e.g. rate limit resets in 60s)
Exponential,2^(attempt-1) × delay ms,general-purpose — prevents thundering herd
Exponential + jitter,exponential × random(0.5-1.0),distributed systems — prevents synchronized retries
```

### Configuration Example (BullMQ)

```typescript
await queue.add('send-email', { to, subject, body }, {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 1000,   // 1s, 2s, 4s, 8s, 16s
    jitter: 0.5,   // ±50% randomization
  },
  removeOnComplete: { age: 24 * 3600 },  // cleanup after 24h
  removeOnFail: false,                    // keep for analysis
});
```

### Custom Strategy

Return `-1` from custom backoff to stop retrying (e.g., 4xx errors shouldn't retry):

```typescript
const worker = new Worker('api-calls', processor, {
  settings: {
    backoffStrategy: (attempts: number, type: string, err: Error) => {
      if (err.message.includes('4xx')) return -1; // don't retry client errors
      return Math.pow(2, attempts - 1) * 1000;   // exponential for server errors
    },
  },
});
```

### Celery Example (Python)

```python
@app.task(bind=True, max_retries=5, default_retry_delay=60)
def send_notification(self, user_id: int, message: str):
    try:
        external_service.send(user_id, message)
    except ConnectionError as exc:
        raise self.retry(exc=exc, countdown=2 ** self.request.retries * 10)
```

---

## §3 Idempotency

Jobs may be delivered more than once (worker crash after processing but before ACK). Design for it.

### Patterns

```
idempotencyPatterns[3]{pattern,how,when}:
Idempotency key (header/field),store key in DB — reject duplicate if key exists,API-triggered jobs (payment / webhook delivery)
Database constraint,unique constraint on (entity_id + action + date),data transformation jobs (ETL / sync)
Conditional write,UPDATE ... WHERE status = 'pending',state machine transitions (order lifecycle)
```

### Rules

1. **Every job must have an idempotency key** — either caller-provided or derived from job data
2. **Check before processing** — not after (avoid side effects on duplicates)
3. **Make side effects idempotent** — sending email twice? Use email service dedup. Charging twice? Use payment provider idempotency key.

---

## §4 Dead Letter Queue (DLQ)

Jobs that exhaust all retry attempts move to a DLQ for manual inspection.

### Flow

```
Job fails → retry 1 → retry 2 → ... → retry N → MOVE TO DLQ
                                                      │
                                                      ▼
                                              Manual inspection:
                                              - Fix root cause
                                              - Replay job
                                              - Discard with reason
```

### Rules

1. **Never discard silently** — every exhausted job must be inspectable
2. **Alert on DLQ growth** — if DLQ depth > threshold → Slack alert
3. **Include original error** — store last error message + stack with the DLQ entry
4. **Replay mechanism** — one-click replay from DLQ back to main queue after fix

---

## §5 Worker Patterns

### Concurrency

```
concurrencyRules[3]{workload,concurrency,reason}:
CPU-bound (image resize / PDF gen),1 per core,avoid contention — use worker threads or separate processes
IO-bound (API calls / email),10-50 per worker,waiting on network — high concurrency is fine
Mixed,separate queues,route CPU-bound and IO-bound to different worker pools
```

### Graceful Worker Shutdown

Integrates with `a1-error-handling.md` §4:

1. Worker receives SIGTERM
2. Stop picking up NEW jobs (`worker.close()`)
3. Wait for IN-PROGRESS jobs to complete (respect job timeout)
4. If timeout exceeded, move job back to waiting (will be retried by another worker)
5. Exit cleanly

---

## §6 Circuit Breaker

Retry (§2) handles *transient* failures. When a dependency is *persistently* down, retrying every job makes it worse — piling load onto a dead service and stalling the queue. A circuit breaker fails fast instead.

### States

```toon
circuitStates[3]{State,Behavior,Transition}:
CLOSED,Calls pass through normally — failures counted,Open when failure rate/count crosses threshold
OPEN,Calls rejected immediately (fail fast) — no call to the dependency,After cooldown timer → HALF-OPEN
HALF-OPEN,Allow a few trial calls,All succeed → CLOSED / any fail → back to OPEN
```

### Rules

1. **Trip on a threshold** — e.g. 50% failures over the last 20 calls, or N consecutive failures.
2. **Fail fast when OPEN** — return a cached value, a queued retry-later, or a clear "service unavailable" — never hang.
3. **Pair with retry, don't replace it** — retry the individual call; the breaker protects against the *systemic* outage.
4. **Per-dependency breakers** — one breaker per external service, so a down payment API doesn't block email.
5. **Observe it** — emit a metric/alert on every OPEN transition (a tripped breaker is an incident signal).

### Libraries

```toon
circuitLibs[3]{Stack,Library}:
Node.js,opossum
Python,pybreaker / tenacity (retry) + purgatory
.NET,Polly (retry + circuit breaker + bulkhead in one)
```

**Sources:** Michael Nygard, *Release It!* (Circuit Breaker / Bulkhead / Timeout stability patterns); Martin Fowler, "CircuitBreaker".
