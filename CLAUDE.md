# Sanpay

Welfare/credit platform for the employees of **شرکت جهان‌فولاد سیرجان** (Jahan Foolad Sirjan), built by **شرکت طرح و توسعه دیار مانا**. Employees receive purchase credit for contracted stores plus welfare credits; stores get their own panel; employees log in from the app's home page. Functional scope: `~/Downloads/jahan-foolad.pdf` (Persian proposal — virtual credit card, QR one-time-code purchases, contracted stores, rations/ارزاق distribution, reporting; phase 2 adds travel services).

**Current workflow: design-first.** UI is being finalized with mock data only — do not wire pages to the backend until the design is approved.

## Projects

| Project | Path | What it is |
|---|---|---|
| `app` | `apps/app` | Employee-facing app. **Persian, RTL** (`lang="fa" dir="rtl"`). Serve: port **4200** |
| `dashboard` | `apps/dashboard` | Admin/management dashboard (English/LTR so far). Serve: port **4300** |
| `api` | `apps/api` | NestJS + Prisma 7 + PostgreSQL |
| `ui` | `packages/ui` | Shared spartan/ui library — all 57 primitives as secondary entrypoints: `import { HlmButtonImports } from '@sanpay/ui/button'` |

## Design system (important — user-approved, do not regress)

- **Glassmorphism, light-first.** Dark mode is opt-in via the `.dark` class only — never default to dark and never follow OS preference. Palette: violet `#7C3AED` primary, emerald `#059669` accent, lavender `#FAF5FF` background.
- Single source of truth: `packages/ui/theme/glass.css` (imported by both apps) + `design-system/sanpay/MASTER.md`.
- Style spartan components via CSS variables and `[data-slot=…]` overrides in `glass.css`. **Never hand-edit generated files under `packages/ui/*`** — they must stay regeneratable via `nx g @spartan-ng/cli:ui <name>` (config in `components.json`).
- Backdrop blur only on elevated surfaces (cards, dialogs, menus, sheets…), not inputs/rows. Keep the `prefers-reduced-transparency` / `prefers-reduced-motion` fallbacks. Text contrast ≥ 4.5:1. SVG icons only, no emoji.
- Do NOT use `background-attachment: fixed` — it blanks/janks Chromium on scroll; the fixed gradient lives on `body::before` in `glass.css`.
- Use the `ui-ux-pro-max` skill (global, `~/.agents/skills/ui-ux-pro-max`) for style/palette/UX decisions, and the `spartan` skill + `spartan-ui` MCP server (`.mcp.json`) for component APIs.

## Persian/RTL conventions (`apps/app`)

- Vazirmatn font, **self-hosted** via `@fontsource/vazirmatn` CSS imports in `apps/app/src/styles.css` — never add Google Fonts links (unreliable in Iran).
- Persian digits (۱۲۳) and amounts (۲۴٬۵۰۰٬۰۰۰ تومان), Jalali dates (۱۴۰۵/۰۶/۳۱); wrap card numbers/codes in `dir="ltr"`.

## Backend (`apps/api`)

- Prisma 7 layout: config in `prisma.config.ts` (root), schema in `apps/api/prisma/schema.prisma` (datasource has **no `url`** — it lives in the config), client generated to `apps/api/src/generated/prisma` (gitignored; run `npm run prisma:generate` after schema changes).
- Runtime connection uses the `@prisma/adapter-pg` driver adapter inside `PrismaService` (`apps/api/src/app/prisma/`), a `@Global()` module. `DATABASE_URL` comes from `.env` (gitignored).
- Scripts: `npm run prisma:generate | prisma:migrate | prisma:studio`.

## Commands

```bash
npx nx serve app        # employee app  → http://localhost:4200
npx nx serve dashboard  # dashboard     → http://localhost:4300
npx nx serve api        # NestJS API    → http://localhost:3000/api
npx nx run-many -t build test lint
npx nx g @spartan-ng/cli:ui <name>   # add/regen a spartan primitive
```

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
