---
file: a1-input-validation.md
persona: A1 Input Validation
version: 2.8.0
last_updated: 2026-05-31
changelog: 2.4.2
---

# A1 — Input Validation & Sanitization

> Load this file when designing validation layers, choosing validation libraries, or implementing input sanitization. Complements `a7-security.md` (threat model) and `a1-error-handling.md` (what happens when validation fails).

## When to Load This File

- User says "validation", "sanitization", "input checking", "schema validation"
- Building API endpoints that accept user input
- Reviewing code for injection vulnerabilities
- Choosing between validation libraries

---

## §1 Where to Validate — Boundary Diagram

Validate at every system boundary. Never trust data crossing a boundary.

```
┌──────────────────────────────────────────────────────┐
│  EXTERNAL                                            │
│  (user input, third-party APIs, file uploads)        │
└────────────────┬─────────────────────────────────────┘
                 │  ← VALIDATE HERE (API layer / controller)
                 │    shape, types, required fields, ranges
┌────────────────▼─────────────────────────────────────┐
│  SERVICE LAYER                                       │
│  (business logic)                                    │
│                │  ← VALIDATE HERE (business rules)   │
│                │    authorization, state transitions, │
│                │    business constraints              │
└────────────────┬─────────────────────────────────────┘
                 │  ← SANITIZE HERE (data-access layer)
                 │    parameterized queries, ORM/ODM
┌────────────────▼─────────────────────────────────────┐
│  DATABASE / EXTERNAL SERVICE                         │
└──────────────────────────────────────────────────────┘
```

### Rules

1. **Fail fast** — validate at function entry, throw immediately on invalid input
2. **Validate shape before logic** — don't run business rules on malformed data
3. **Never validate only on the client** — client validation is UX, server validation is security
4. **Use a dedicated library** — don't hand-write regex for emails, URLs, dates

---

## §2 Library Selection

```
validationLibs[7]{stack,library,style,notes}:
Node.js/TS,Zod,schema-first / TypeScript-native,infers TS types from schemas — best for new TS projects
Node.js/TS,Joi,schema-first / runtime,mature / widely used / richer error messages
Node.js/TS,class-validator,decorator-based,good with NestJS / class-transformer combo
Python,Pydantic,model-based / type hints,built into FastAPI / automatic OpenAPI schema generation
Python,marshmallow,schema-based,Flask ecosystem / serialization + deserialization
.NET,FluentValidation,fluent API,standard for ASP.NET Core / rule chaining
.NET,DataAnnotations,attribute-based,built-in / simpler but less flexible
```

### Validation as Middleware

Validate BEFORE the request reaches the route handler:

```typescript
// Express + Zod example
import { z } from 'zod';

const CreateOrderSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive().max(1000),
  shippingAddress: z.object({
    street: z.string().min(1).max(200),
    city: z.string().min(1).max(100),
    zip: z.string().regex(/^\d{5}(-\d{4})?$/),
  }),
});

// Middleware factory
const validate = (schema: z.ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ errors: result.error.flatten() });
  }
  req.validated = result.data; // typed + sanitized
  next();
};

router.post('/orders', validate(CreateOrderSchema), orderController.create);
```

### FastAPI Example (Pydantic)

```python
from pydantic import BaseModel, Field

class CreateOrderRequest(BaseModel):
    product_id: str = Field(..., pattern=r'^[0-9a-f-]{36}$')
    quantity: int = Field(..., gt=0, le=1000)
    shipping_address: ShippingAddress

# FastAPI validates automatically — returns 422 on invalid input
@router.post("/orders")
async def create_order(body: CreateOrderRequest):
    ...
```

---

## §3 Sanitization Patterns

### What to Sanitize

```
sanitizationRules[5]{input_type,threat,action}:
HTML in user text,XSS (stored/reflected),escape or strip HTML tags (DOMPurify / bleach)
SQL in query params,SQL injection,parameterized queries only — NEVER string concatenation
File paths in user input,path traversal,resolve + verify within allowed directory
JSON with unexpected fields,mass assignment,pick only declared fields from schema (allowlist)
URLs in user input,SSRF,validate against allowlist of domains/protocols
```

### Anti-Patterns

```
antiPatterns[4]{pattern,risk,fix}:
String concatenation in SQL,injection,"Use parameterized queries / ORM query builder"
Regex-only email validation,bypass + ReDoS,"Use library validator (Zod .email() / Joi .email())"
Blacklist filtering,incomplete — attackers find bypasses,"Use allowlist — define what IS valid not what isn't"
Trusting Content-Type header,polyglot file upload attacks,"Validate actual file content (magic bytes) not just extension"
```

_Sources: [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html) & [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) — allowlist over blocklist, canonicalize-then-validate, file-content verification._

---

## §4 Validation Depth — Syntactic vs Semantic

Shape-checking is necessary but not sufficient. Validate in layers, and **canonicalize before validating** or the check is bypassable.

```
validationDepth[3]{layer,checks,example}:
Syntactic,type / format / range / required — "is it well-formed?",quantity is an int 1..1000; zip matches /^\d{5}(-\d{4})?$/
Semantic,cross-field + business invariants — "does it make sense?",ship date ≥ order date; discount ≤ subtotal; state transition draft→submitted is legal
Contextual,authorization + ownership at use time — "is THIS caller allowed THIS record?",user owns the order they're editing (see §5 A01)
```

### Canonicalize-First Rule

```
canonicalization[4]{input,normalize_before_validating,bypass_if_skipped}:
Unicode text,NFC normalization,homoglyph / combining-char filter bypass
File paths,resolve to absolute + realpath,../ traversal slips past a naive prefix check
URLs,parse + lowercase host + resolve,//evil.com or encoded-host SSRF allowlist bypass
Email / usernames,trim + casefold,duplicate-account / collision via case or whitespace
```

> **Order matters:** normalize → validate → use. Validating *then* normalizing lets the normalization step re-introduce a value your validator already rejected.

---

## §5 OWASP Top 10 Alignment

```
owaspMapping[5]{owasp_2025,validation_defense}:
A05:2025 Injection,parameterized queries / ORM — validate all inputs before DB layer
A01:2025 Broken Access Control,validate authorization at service layer — not just route guards
A06:2025 Insecure Design,validate business invariants (negative quantities / negative prices / impossible state transitions)
A08:2025 Software or Data Integrity Failures,validate file uploads (size limits / type checking / virus scanning)
A07:2025 Authentication Failures,validate credential format — rate limit login attempts — lock after N failures
```

> **OWASP Top 10:2025 IDs.** Injection moved A03→**A05** and Insecure Design A04→**A06** vs the 2021 list; if you see old IDs elsewhere, this table is the current reference.

_Sources: [OWASP Top 10:2025](https://owasp.org/Top10/2025/) — current category IDs (verified 2026-05-30)._

---

## Common Rationalizations

```
rationalizations[5]{excuse,reality}:
"The client already validates it",client validation is UX only — anyone can bypass it with curl; server validation is the security boundary (§1 rule 3)
"It's an internal service, skip validation",internal callers get compromised too; validate at every boundary — defense in depth, not perimeter-only
"I'll just escape on output",output encoding handles XSS but not injection/SSRF/mass-assignment — validate input AND encode output, they're different defenses
"Regex is enough for emails/URLs",hand-rolled regex causes ReDoS and misses edge cases — use a library validator (§3 anti-patterns)
"Blocklist the bad characters",attackers always find an unlisted bypass — allowlist what IS valid instead (§3)
```

## Red Flags — Stop and Reconsider

```
redFlags[6]{signal,why}:
String-concatenated SQL/shell/query,injection (A05:2025) — switch to parameterized queries / safe APIs immediately
Validation only in the browser/client,no server-side check = no security boundary (§1)
User input reaching a file path / URL fetch unvalidated,path traversal / SSRF — canonicalize + allowlist (§4)
Validating before canonicalizing,bypassable — normalize first, then validate (§4 Canonicalize-First)
Accepting whole request body into a model,mass assignment — pick only declared fields (§3)
File trusted by extension or Content-Type,polyglot upload — verify magic bytes (§3 anti-patterns)
```
