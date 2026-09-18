# Spark Build Starter Template

This is a **blank starter template**, not a reference design.

## Important: do not copy the template's look and feel

Everything currently visible in this project — the landing page, the header and footer, the gradients, animations, colors, typography, and layout — is **placeholder content that exists only so the template renders something before real work begins**. None of it represents a design direction for the application you are about to build.

When starting work on a new project:

- **Ignore the existing styles, design, and flows entirely.** Do not treat the landing page, header, or footer as a visual or structural reference.
- **Design for the application being built.** Choose theming, colors, typography, spacing, and components based on the app's actual purpose, audience, and requirements — not on what the template ships with.
- **Replace the placeholder pages and layout components** (`src/app/page.tsx`, `src/components/layout/`) with ones appropriate for the new application. Nothing in them is meant to survive.
- **Define a proper theme** in `src/app/globals.css` (Tailwind CSS v4 design tokens / CSS variables) that fits the application, rather than keeping the template defaults.

The only parts intended to be reused as-is are the project setup itself and the standard [shadcn/ui](https://ui.shadcn.com) components in `src/components/ui/` — and even those should be themed and composed to match the application being built.

## What's included

- [Next.js](https://nextjs.org) (App Router, Turbopack) with React and TypeScript
- [Tailwind CSS v4](https://tailwindcss.com) with CSS-variable-based theming and dark mode via `next-themes`
- [shadcn/ui](https://ui.shadcn.com) component set in `src/components/ui/` (configured via `components.json`; add more with `bunx shadcn@latest add <component>`)
- `react-hook-form` + `zod` for forms and validation
- [Bun](https://bun.sh) as package manager and script runner

## Project structure

```
src/
  app/          # App Router pages, layout, global styles (placeholder content)
  components/
    layout/     # Placeholder header/footer/theme toggle — replace per project
    ui/         # shadcn/ui components — reusable building blocks
  lib/          # Utilities (cn helper)
agent-memory/   # Working notes for the coding agent (project map, decisions)
```

