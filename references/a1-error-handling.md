---
file: a1-error-handling.md
persona: A1 Error Handling
version: 2.8.0
last_updated: 2026-05-31
changelog: 2.4.2
---

# A1 — Error Handling Strategy

> Load this file when building error handling infrastructure, designing error classes, setting up error boundaries (React), centralized error handlers (backend), or graceful shutdown logic. For input validation specifically, see `a1-input-validation.md`.

## When to Load This File

- User says "error handling", "error boundary", "graceful shutdown", "crash recovery"
- Building new API or service that needs structured error responses
- Debugging production incidents caused by unhandled errors
- Setting up process signal handlers (SIGTERM, SIGINT)

---

## §1 Error Classification

Every error falls into one of two categories. Handle them differently.

### Decision Tree

```
Is the error caused by a known condition (bad input, network timeout, missing resource)?
├── YES → Operational Error → Handle gracefully, log, return structured response
└── NO → Programmer Error (bug) → Log full context, crash + restart (let process manager recover)
```

### Error Class Hierarchy

```typescript
// Base — all application errors extend this
abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly isOperational: boolean;
  readonly context?: Record<string, unknown>;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Operational errors — expected, handle gracefully
class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly isOperational = true;
}

class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly isOperational = true;
}

class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly isOperational = true;
}

// Programmer errors — unexpected, crash + restart
class DatabaseError extends AppError {
  readonly statusCode = 500;
  readonly isOperational = false;
}
```

### Python Equivalent

```python
class AppError(Exception):
    status_code: int = 500
    is_operational: bool = True

    def __init__(self, message: str, context: dict | None = None):
        super().__init__(message)
        self.context = context or {}

class NotFoundError(AppError):
    status_code = 404

class ValidationError(AppError):
    status_code = 400
```

---

## §2 Centralized Error Handler

One place handles all errors. NOT in middleware. NOT scattered across route handlers.

### Pattern

```
Module throws → Router catches → Middleware propagates → Centralized Handler decides
```

### Rules

1. **HTTP errors have no place in database code** — data-access layer throws domain errors, the handler maps them to HTTP status codes
2. **Log before responding** — structured JSON log with correlation ID, error class, stack, context
3. **Metrics** — increment error counters by type (operational vs programmer, by status code)
4. **Decide: recover or crash** — operational errors → return response, programmer errors → log + crash + let process manager restart

### Express Example

```typescript
// Centralized handler — NOT middleware
class ErrorHandler {
  handle(error: Error): void {
    if (error instanceof AppError && error.isOperational) {
      logger.warn({ err: error, context: error.context }, error.message);
      // Response already sent by middleware — this handles logging/metrics
    } else {
      logger.fatal({ err: error }, 'Programmer error — crashing');
      process.exit(1); // Let PM2/K8s restart
    }
  }
}

// Express error middleware — thin, delegates to handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  res.status(statusCode).json({
    error: { message: err.message, code: err.name }
  });
  errorHandler.handle(err);
});
```

### FastAPI Example

```python
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    logger.warning("Operational error", extra={"error": str(exc), "context": exc.context})
    return JSONResponse(status_code=exc.status_code, content={"error": {"message": str(exc)}})

@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    logger.fatal("Programmer error — unhandled", exc_info=exc)
    return JSONResponse(status_code=500, content={"error": {"message": "Internal server error"}})
```

---

## §3 Frontend Error Boundaries

Use **multiple** React error boundaries — not one for the entire app.

### Placement Strategy

```
errorBoundaries[4]{scope,catches,recovery}:
app-level,uncaught render errors,full-page fallback with "reload" button
feature-level,errors within a feature,feature-specific fallback / graceful degrade
component-level,flaky third-party widgets,placeholder component
data-level,API fetch failures,retry button + cached data if available
```

### API Error Interceptor

Configure once on the HTTP client — not in every component:

```typescript
// lib/api-client.ts
api.interceptors.response.use(undefined, (error) => {
  if (error.response?.status === 401) {
    // Trigger logout or token refresh
    authStore.logout();
  }
  // Notification toast for all API errors
  notifications.error(error.response?.data?.message || 'Request failed');
  return Promise.reject(error);
});
```

### Error Tracking (Production)

- Use **Sentry** (or Datadog RUM) with source maps for stack traces
- Tag errors with: user ID (anonymized), feature name, deployment version
- Set alert thresholds: >5 new errors/minute → Slack notification

---

## §4 Graceful Shutdown

When a process receives SIGTERM (K8s pod termination, deploy), it must:

### Shutdown Sequence

```
1. SIGTERM received
2. Health check returns unhealthy → load balancer stops sending new requests
3. Stop accepting new connections (server.close())
4. Wait for in-flight requests to drain (Stoppable library or manual tracking)
5. Close database connections, flush logs, release resources
6. Exit with code 0
```

### Rules

- **Node.js must be PID 1** — use `node server.js` in Dockerfile CMD, NOT `npm start` (npm swallows signals)
- **30-second grace period** in K8s — if not done, SIGKILL arrives
- **Keep-Alive connections** — notify clients to reconnect (Connection: close header)
- **Log the shutdown** — "Graceful shutdown initiated", "N requests drained", "Shutdown complete"

### Anti-Patterns

```
antiPatterns[3]{pattern,risk}:
npm start as Docker CMD,npm swallows SIGTERM — process never receives shutdown signal
No drain timeout,in-flight requests get killed mid-response
Cleanup without try/catch,one failed cleanup step prevents remaining cleanup
```

---

## §5 Error Response Format

### Standard Error Response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Quantity must be a positive integer",
    "details": [
      { "field": "quantity", "issue": "must be > 0", "received": -5 }
    ],
    "correlationId": "txn-abc123"
  }
}
```

### Rules

1. **Never expose stack traces** in production responses — log them server-side only
2. **Use error codes** (machine-readable) alongside messages (human-readable)
3. **Include correlation ID** — enables support to find the full log trail
4. **Consistent shape** — every error response has the same structure, regardless of status code

### User-Facing Message Quality

The `message` field is the user's only window into what went wrong. A good message is the difference between a recoverable action and an abandoned task.

```toon
messageQuality[4]{Principle,Bad,Good}:
Be specific + actionable,"Something went wrong","Quantity must be 1 or more — you entered 0"
Say what to do next,"Invalid input","Enter a date in MM/DD/YYYY format"
Never leak internals,"NullPointerException at line 412","We couldn't load your order — please retry"
Match the audience,"FK constraint violation on orders_user_id","That account no longer exists"
```

- **Two audiences, two channels:** the user gets the plain-language `message`; the developer gets the stack trace + `correlationId` in the server log. Never cross them.
- **Tone:** state the problem and the next step — don't blame the user ("you failed") or over-apologize.

---

## §6 Never Swallow Errors

The most common error-handling failure isn't missing handling — it's **fake** handling that hides the problem. An error that's caught and silenced is worse than an uncaught one: the system keeps running in a corrupt state with no signal.

```toon
swallowAntiPatterns[4]{Pattern,WhyItHurts,DoInstead}:
Empty catch block,Error vanishes — no log / no signal / silent corruption,Catch only to handle or enrich-and-rethrow; never to ignore
Catch-log-continue on an unrecoverable error,Code proceeds with invalid state as if nothing happened,Log then rethrow / fail the operation — don't fall through
Catching too broadly (except Exception / catch (e)),Hides bugs you never meant to handle (typos / nulls),Catch the narrowest type you can actually recover from
Swallowing to "make the test pass",Bug ships hidden behind a green test,Fix the cause — a caught-and-ignored error is a deferred incident
```

**Rule:** Only catch an error if you will (a) recover from it, (b) add context and rethrow, or (c) translate it to a domain error. If none apply, let it propagate to the centralized handler (§2).
