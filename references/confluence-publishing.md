---
file: confluence-publishing.md
persona: Cross-cutting (Confluence Publishing)
version: 2.8.0
last_updated: 2026-05-30
changelog: 2.4.2
---

# Confluence On-Prem Publishing — ESSENCE Reference

> **Version:** 1.0 · **Date:** 2026-04-27 · **Author:** ESSENCE A4/A5 · **Status:** Field-tested at Pfizer
>
> **Changelog:**
> | Version | Date | Change |
> |---------|------|--------|
> | 1.0 | 2026-04-27 | Initial — extracted from Single Curated LAAD Feed training publishing session |

---

## When to Load

Load this reference when the request involves:
- Publishing content to **Confluence on-prem** (not Cloud)
- SSO-authenticated Confluence (no API tokens available)
- Multi-page publishing (training materials, documentation suites, course modules)
- HTML → Confluence storage format conversion
- Confluence attachment management (SVG, images)
- Fixing rendering issues on Confluence pages

**Personas:** A4 (Documentation), A5 (Infrastructure), A1 (Development)

---

## Environment Detection

Before starting Confluence work, determine the environment:

| Factor | On-Prem (this reference) | Cloud (use `.agents/skills/confluence/`) |
|--------|--------------------------|------------------------------------------|
| URL pattern | `https://confluence.{company}.com` | `https://{org}.atlassian.net` |
| Auth | SSO / Kerberos — no API tokens | API tokens via `id.atlassian.com` |
| API access | Browser-session-only (Playwright) | Direct REST with bearer token |
| Tool | VS Code Simple Browser + `page.evaluate()` | Python scripts (`confluence_client.py`) |

If Cloud → use the standalone Confluence skill at `.agents/skills/confluence/SKILL.md`.
If On-Prem with SSO → use this reference.

---

## Phase 1: Authentication Setup

### SSO / Playwright Pattern

On-prem Confluence with SSO doesn't expose API tokens. Use the VS Code Simple Browser's authenticated session:

1. **Open Confluence** in VS Code Simple Browser (user navigates and authenticates via SSO)
2. **All API calls** go through `page.evaluate(async () => { ... })` — this inherits the browser's SSO cookies
3. **Required header** on every REST call: `'X-Atlassian-Token': 'no-check'` (bypasses XSRF)

```javascript
// Pattern: authenticated REST call via Playwright
const result = await page.evaluate(async () => {
  const resp = await fetch('/rest/api/content/PAGE_ID?expand=body.storage,version', {
    headers: { 'X-Atlassian-Token': 'no-check' }
  });
  return await resp.json();
});
```

### What Does NOT Work

| Approach | Why It Fails |
|----------|-------------|
| `document.cookie` | SSO cookies are `httpOnly` — not accessible via JS |
| `page.context().cookies()` | "Method not found: Storage.getCookies" in VS Code Simple Browser |
| Direct `fetch()` from terminal | No SSO session — 401/302 redirect to login |
| API token auth | Not available on on-prem SSO instances |

---

## Phase 2: Page CRUD Operations

### Create Page

```javascript
await page.evaluate(async () => {
  const resp = await fetch('/rest/api/content', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Atlassian-Token': 'no-check'
    },
    body: JSON.stringify({
      type: 'page',
      title: 'Module 1: Business Context',
      ancestors: [{ id: 'PARENT_PAGE_ID' }],
      space: { key: 'SPACE_KEY' },
      body: {
        storage: {
          value: '<p>Page content in XHTML storage format</p>',
          representation: 'storage'
        }
      }
    })
  });
  return await resp.json();
});
```

### Read Page (with content + version)

```javascript
const page = await page.evaluate(async () => {
  const resp = await fetch('/rest/api/content/PAGE_ID?expand=body.storage,version', {
    headers: { 'X-Atlassian-Token': 'no-check' }
  });
  return await resp.json();
});
// page.version.number → current version
// page.body.storage.value → current XHTML content
```

### Update Page

**Critical:** Must increment version number. Title must be included even if unchanged.

```javascript
await page.evaluate(async () => {
  // 1. Get current version
  const resp = await fetch('/rest/api/content/PAGE_ID?expand=version', {
    headers: { 'X-Atlassian-Token': 'no-check' }
  });
  const data = await resp.json();
  const currentVersion = data.version.number;

  // 2. PUT with incremented version
  const update = await fetch('/rest/api/content/PAGE_ID', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Atlassian-Token': 'no-check'
    },
    body: JSON.stringify({
      id: 'PAGE_ID',
      type: 'page',
      title: data.title,
      version: { number: currentVersion + 1 },
      body: {
        storage: {
          value: newHtmlContent,
          representation: 'storage'
        }
      }
    })
  });
  return await update.json();
});
```

### Delete Page (may fail)

DELETE `/rest/api/content/PAGE_ID` may return **403 Forbidden** if user lacks delete permissions.

**Workaround:** Rename page to `(Archived) Original Title` instead of deleting:
```javascript
// Rename instead of delete
body: JSON.stringify({
  id: 'PAGE_ID', type: 'page',
  title: '(Archived) Key Technical Decisions',
  version: { number: currentVersion + 1 },
  body: { storage: { value: existingContent, representation: 'storage' } }
})
```

### List Children & Attachments

```javascript
// Child pages
await fetch('/rest/api/content/PAGE_ID/child/page?limit=25');
// Attachments
await fetch('/rest/api/content/PAGE_ID/child/attachment?limit=10');
```

---

## Phase 3: HTML Content Handling

### Editor → Storage Conversion

Confluence has two HTML representations:
- **Editor format** — standard HTML (what you write)
- **Storage format** — Confluence XHTML with `ac:` namespace tags (what gets saved)

Convert editor HTML to storage format via API:

```javascript
const converted = await page.evaluate(async (html) => {
  const resp = await fetch('/rest/api/contentbody/convert/storage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Atlassian-Token': 'no-check'
    },
    body: JSON.stringify({ value: html, representation: 'editor' })
  });
  return await resp.json();
}, editorHtml);
// converted.value → storage format XHTML
```

### The ac:tag Placeholder Swap (CRITICAL)

`ac:` namespace tags (`ac:image`, `ac:structured-macro`, `ri:attachment`, etc.) are **NOT valid** in editor format. The converter rejects them with:

> `400: Undeclared namespace prefix "ac"`

**Workaround — placeholder swap pattern:**

```javascript
// BEFORE conversion: replace ac: tags with placeholders
let html = editorHtml;
const acTags = [];
html = html.replace(/<ac:[^>]*>.*?<\/ac:[^>]*>|<ac:[^\/]*\/>/gs, (match, offset) => {
  acTags.push(match);
  return `<!--ACPLACEHOLDER${acTags.length - 1}-->`;
});

// Convert the clean HTML
const converted = await convertToStorage(html);

// AFTER conversion: swap placeholders back
let storageHtml = converted.value;
acTags.forEach((tag, i) => {
  storageHtml = storageHtml.replace(`<!--ACPLACEHOLDER${i}-->`, tag);
});

// Now PUT with the final storageHtml
```

### Large HTML Upload via Chunking

Playwright's `page.evaluate()` has a practical limit on string argument size (~4KB safe). For larger content:

```javascript
// 1. Initialize accumulator
await page.evaluate(() => { window.__html = ''; });

// 2. Send chunks (~3-4KB each)
for (const chunk of chunks) {
  await page.evaluate((c) => {
    window.__html += c;
    return window.__html.length;
  }, chunk);
}

// 3. Use accumulated content in final API call
await page.evaluate(async () => {
  const html = window.__html;
  // ... use html in fetch() call
  delete window.__html;
});
```

---

## Phase 4: Confluence XHTML Compatibility

### Tags That Work Reliably

| Element | Notes |
|---------|-------|
| `<table>`, `<tr>`, `<td>`, `<th>` | Full inline style support. Use for layouts, diagrams, flow charts |
| `<pre><code>` | Code blocks. Use inline `<span style="color:...">` for syntax highlighting |
| `<ul>`, `<ol>`, `<li>` | Standard lists |
| `<h2>` – `<h4>` | Headings with inline styles |
| `<div>` | Simple block containers |
| `<span>` | Inline styling (must be properly closed) |
| `<ac:image>` + `<ri:attachment>` | Attached images/SVGs (storage format only) |
| `<ac:structured-macro>` | Confluence macros (children, TOC, etc.) |

### Tags / Patterns That Break

| Pattern | Problem | Fix |
|---------|---------|-----|
| `<div style="display:flex">` with `<span>` children | Confluence strips closing tags, causing cascade | Use `<table>` with inline-styled `<td>` cells |
| `<span>` closed with `</div>` | Tag mismatch — silently mangled | Ensure proper tag pairing |
| Flexbox / Grid CSS | Not supported in XHTML storage | Use `<table>` layouts |
| External CSS / `<style>` blocks | Stripped during storage | Use inline `style=""` on every element |
| `<img src="data:...">` for large images | May hit size limits | Upload as attachment, reference via `<ac:image>` |

### Style Normalization

Confluence normalizes inline styles during save:
- `#003B71` → `rgb(0,59,113)`
- `22px` → `22.0px`
- This is cosmetic — styles still apply correctly

### Complex Layouts: Table-Based Diagrams

For DAG flows, architecture diagrams, or any layout that would normally use flexbox:

```html
<!-- Flow diagram as table: each column = a node -->
<table style="border-collapse: separate; border-spacing: 6px 4px; width: 100%;">
  <tr>
    <!-- Node 1 -->
    <td style="background: #e3f2fd; border: 2px solid #1565c0; border-radius: 8px;
               padding: 8px; text-align: center; vertical-align: top; width: 9%;">
      <strong>Node Name</strong><br/>
      <span style="font-size: 11px; color: #555;">Description</span>
    </td>
    <!-- Arrow -->
    <td style="text-align: center; vertical-align: middle; font-size: 18px; padding: 0 2px;">→</td>
    <!-- Node 2 -->
    <td style="background: #fff3e0; border: 2px solid #e65100; border-radius: 8px;
               padding: 8px; text-align: center; vertical-align: top;">
      <strong>Next Node</strong>
    </td>
  </tr>
</table>
```

**Key properties:** `border-collapse: separate`, `border-spacing`, `border-radius` on `<td>` all work.

---

## Phase 5: Attachment Management

### Upload New Attachment

```javascript
await page.evaluate(async () => {
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg">...</svg>`;
  const formData = new FormData();
  const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
  formData.append('file', blob, 'diagram.svg');

  const resp = await fetch('/rest/api/content/PAGE_ID/child/attachment', {
    method: 'POST',
    headers: { 'X-Atlassian-Token': 'no-check' },
    body: formData
  });
  return await resp.json();
});
```

### Update Existing Attachment

```javascript
await fetch('/rest/api/content/PAGE_ID/child/attachment/ATTACHMENT_ID/data', {
  method: 'POST',  // POST, not PUT
  headers: { 'X-Atlassian-Token': 'no-check' },
  body: formData
});
```

### Reference Attachment in Page Content

```html
<!-- In storage format XHTML -->
<ac:image ac:width="900">
  <ri:attachment ri:filename="diagram.svg" />
</ac:image>
```

### SVG Encoding Fix

SVGs with UTF-8 special characters (✅, ❌, →, —) may display as `â□□` when uploaded without proper encoding.

**Root cause:** Multi-byte UTF-8 sequences interpreted as Latin-1 characters.

**Fix pattern:**
```javascript
// Download existing SVG
const svgResp = await fetch('/download/attachments/PAGE_ID/diagram.svg');
const svgText = await svgResp.text();

// Replace corrupted byte sequences with correct Unicode
let fixed = svgText;
fixed = fixed.replace(/\u00e2\u009c\u0085/g, '✅');  // U+2705
fixed = fixed.replace(/\u00e2\u009d\u008c/g, '❌');  // U+274C
fixed = fixed.replace(/\u00e2\u0080\u0094/g, '—');   // U+2014 em-dash
fixed = fixed.replace(/\u00e2\u0086\u0092/g, '→');   // U+2192 arrow

// Re-upload with explicit charset
const blob = new Blob([fixed], { type: 'image/svg+xml;charset=utf-8' });
```

---

## Phase 6: Plugin Interference & Workarounds

### Table Filter/Sorter Plugin

Confluence's Table Filter plugin injects into `<th>` elements:
```html
<div class="tablesorter-header-inner">
  <button class="headerButton" style="color: rgb(23, 43, 77);">Header Text</button>
</div>
```

This overrides any `color` set on the `<th>`, even with `!important`.

**Fix:** Wrap header text in an inner `<span>`:
```html
<th style="background-color: #003B71; color: #ffffff;">
  <span style="color: #ffffff !important; font-weight: bold;">Header Text</span>
</th>
```

The `<span>` persists inside the injected `<button>`, and `!important` on the span wins.

---

## Phase 7: Multi-Page Publishing Workflow

For publishing multi-module training materials or documentation suites:

### Step 1: Parse Source Material
- Identify modules/sections from source HTML or Markdown
- Map each module to a child page
- Identify embedded diagrams (SVG, base64 images) that need attachment extraction

### Step 2: Create Page Hierarchy
```
Parent Page (overview table + children macro)
├── Module 1: Topic A
├── Module 2: Topic B
├── Module 3: Topic C
└── Quick Reference
```

- Create parent page first with module overview table
- Include `<ac:structured-macro ac:name="children">` to auto-list child pages
- Use `<ac:parameter ac:name="sort">creation</ac:parameter>` for creation-order sorting

### Step 3: Create Child Pages (in order)
- Create pages sequentially — Confluence sorts by creation date in sidebar
- For each page with diagrams: extract images → upload as attachments → reference via `<ac:image>`
- Apply editor→storage conversion with ac:tag placeholder swap for each page

### Step 4: Verify Rendering
- Screenshot each page via Playwright
- Check for: broken layouts, encoding corruption, missing images, style overrides
- Fix issues using the patterns in Phases 4–6

### Step 5: Page Management
- **Renaming:** Update title in PUT body (include all existing content)
- **Renumbering:** When removing a module, update both `<title>` and `<h2>` heading numbers on affected pages, plus parent table
- **Archiving:** If deletion returns 403, rename to `(Archived) ...` — page stays but is clearly marked

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|--------------|-------------|-----------------|
| Using flexbox/grid for layouts | XHTML storage strips CSS layout | Use `<table>` with inline styles |
| Putting `ac:` tags in editor format | 400 error: undeclared namespace | Placeholder swap pattern (Phase 3) |
| Setting `color` on `<th>` directly | Table Filter plugin overrides it | Wrap text in `<span>` with `!important` |
| Using `<style>` blocks | Stripped during storage conversion | Inline styles on every element |
| Assuming `python` command works | May be `py.exe` on Windows | Check `py.exe`, `python3`, `python` |
| Sending large HTML in one `page.evaluate()` | Exceeds argument size limit | Chunk into ~3-4KB segments |
| Using `document.cookie` for auth | SSO cookies are httpOnly | Use `page.evaluate(fetch(...))` |
| DELETE for unwanted pages | May return 403 on restricted spaces | Rename to `(Archived) ...` |

---

## Checklist: Before Publishing

- [ ] Confluence page open in VS Code Simple Browser and authenticated
- [ ] Target space key and parent page ID identified
- [ ] Source content parsed into modules/sections
- [ ] Diagrams extracted and ready for attachment upload
- [ ] `ac:` tags identified and placeholder swap planned
- [ ] Python available as `py.exe` / `python3` / `python` (verified)

## Checklist: After Publishing

- [ ] Each page renders correctly (screenshot verification)
- [ ] All diagrams/SVGs display without encoding corruption
- [ ] Table headers show correct text color (check for plugin interference)
- [ ] Page sidebar order matches intended module sequence
- [ ] Parent page overview table matches child page titles and count
- [ ] `children` macro lists all pages correctly

## Common Rationalizations

| Excuse | Rebuttal |
|--------|----------|
| "I'll just paste the HTML directly" | Confluence storage format is XHTML, not HTML. Unclosed tags, invalid nesting, and unescaped entities will corrupt the page silently. Always use the conversion API. |
| "The page looks fine in preview" | Preview and storage format render differently. Always verify the published page, not just the API response. |
| "I'll fix the formatting after publishing" | Manual Confluence formatting is fragile — one edit can break the XHTML structure. Get it right in the API call. |
| "SVGs are just images, they'll work" | SVGs in Confluence require UTF-8 encoding verification, attachment upload, and `ac:image` + `ri:attachment` tags. They don't work as inline base64. |

## Red Flags

- Publishing without using the editor→storage conversion API
- `ac:` namespace tags in editor-format HTML (will cause 400 errors)
- No version number increment on page updates (will cause 409 conflicts)
- Missing `X-Atlassian-Token: no-check` header (XSRF rejection)
- Inline base64 images instead of attachment uploads
- Large HTML payloads sent in a single `page.evaluate()` call (>5KB)
- Publishing without post-publish screenshot verification
