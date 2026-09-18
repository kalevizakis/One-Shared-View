---
title: Template Project Defaults
created: Template
delete-when: Template defaults replaced (home page, header, footer customized)
referenced-in: current-context.md
---

# Template Project Defaults

This is a NextJS 15 starter template. When a user requests ANY app to be built, the following defaults **MUST be replaced**.

## What Must Be Replaced

### 1. Home Page (`src/app/page.tsx`)

The current home page is a **demo landing page** with example Hero, AI Prompts section, and About section.

**Action**: Replace entirely with the actual app's home/landing page.

### 2. Header (`src/components/layout/header.tsx`)

Default placeholder header.

**Action**: Customize with actual app logo, navigation, and branding.

### 3. Footer (`src/components/layout/footer.tsx`)

Default placeholder footer.

**Action**: Customize with actual app branding and links.

### 4. Layout Metadata (`src/app/layout.tsx`)

Default template metadata.

**Action**: Update `title` and `description` with actual app info.

## Template Stack (Pre-configured)

- **Framework**: Next.js 15 (App Router)
- **UI Library**: shadcn/ui components (extensive collection pre-installed)
- **Icons**: lucide-react only
- **Styling**: Tailwind CSS
- **Theming**: next-themes (dark/light mode)
- **Forms**: React Hook Form + Zod
- **Language**: TypeScript

## Technical Constraints (Non-negotiable)

- ✅ ONLY NextJS App Router
- ✅ ONLY shadcn/ui components
- ✅ ONLY lucide-react icons
- ❌ NO other frameworks, component libraries, or icon libraries

## Cleanup Checklist

When this note's `delete-when` condition is met:

1. Remove the `⚠️ TEMPLATE PROJECT STATUS` section from `current-context.md`
2. Remove the Open Item referencing this note from `current-context.md`
3. Remove this note's row from `notes/_index.md`
4. Delete this file (`notes/template-project.md`)
