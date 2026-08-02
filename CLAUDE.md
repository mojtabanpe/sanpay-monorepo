# Sanpay

Welfare/credit platform for the employees of **شرکت جهان‌فولاد سیرجان** (Jahan Foolad Sirjan), built by **شرکت طرح و توسعه دیار مانا**. Employees receive purchase credit for contracted stores plus welfare credits; stores get their own panel; employees log in from the app's home page. Functional scope: `~/Downloads/jahan-foolad.pdf` (Persian proposal — virtual credit card, QR one-time-code purchases, contracted stores, rations/ارزاق distribution, reporting; phase 2 adds travel services).

**Current workflow: full-stack.** Design is approved; pages are being wired to the real API. Employee auth is JWT-based and uses the **national code (کد ملی)** as the login identifier (`POST /api/auth/login`); the app dev-server proxies `/api` to `localhost:3000`. Seed data: `npm run prisma:seed` (demo employee `3060123456` / `12345678`). Remaining mock-only pages should be migrated to API data as they are touched.

## Projects

| Project     | Path             | What it is                                                                                                                     |
| ----------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `app`       | `apps/app`       | Employee-facing app. **Persian, RTL** (`lang="fa" dir="rtl"`). Serve: port **4200**                                            |
| `dashboard` | `apps/dashboard` | Admin/management dashboard (English/LTR so far). Serve: port **4300**                                                          |
| `store`     | `apps/store`     | Contracted-store panel. **Persian, RTL.** Store login + live payment feed. Serve: port **4400**                                |
| `api`       | `apps/api`       | NestJS + Prisma 7 + PostgreSQL                                                                                                 |
| `ui`        | `shared/ui`      | Shared spartan/ui library — all 57 primitives as secondary entrypoints: `import { HlmButtonImports } from '@sanpay/ui/button'` |
| `models`    | `shared/models`  | Shared domain models (TypeScript interfaces) used by app + dashboard: `import { Wallet } from '@sanpay/models'`                |
| `receipt`   | `shared/receipt` | Shared receipt component used by both the employee app and the store panel: `import { ReceiptCard } from '@sanpay/receipt'`    |

## Purchase flow (approved design — merchant-presented QR)

The employee scans a **static QR printed at the store's till**; there is no physical card and the cashier needs no scanner.

1. Each `Store` has a short `code` (e.g. `OLMP3652`). The QR encodes `SANPAY:S:<code>`; the bare code is also accepted so it can be typed by hand when the camera is unavailable.
2. Employee opens the QR tab (`/qr` → `apps/app/src/app/pages/pay/`), scans, and `GET /api/checkout/:storeCode` returns the store plus **only** the wallets usable there, each with its `max` (remaining credit).
3. The employee types the amount, asking the cashier what it is. The input is clamped to that wallet's `max` client-side and re-checked server-side. When several wallets apply to the store, the employee splits the amount across them; one wallet shows a single input with its max.
4. `POST /api/payments` writes one `Payment` (with an 8-digit `receiptNo`) plus one `Transaction` per wallet, in a single DB transaction, with an optimistic `spent` check so concurrent payments cannot overdraw.
5. The receipt (`<sanpay-receipt-card>`) is shown to the cashier, and the same receipt appears **live** in the store panel via SSE — see below.

**Known trade-off:** the employee enters the amount and the cashier does not confirm in-system, so the receipt screen is the store's only assurance. That is why it carries store + amount + exact time + receipt number. A cashier-side confirmation step would close this gap if it ever matters.

QR scanning uses the native `BarcodeDetector` when available and falls back to `jsqr` on canvas frames (`apps/app/src/app/core/checkout/qr-scanner.ts`), so it works on iOS Safari too.

## Store panel live feed

- Store auth is separate from employee auth: `POST /api/store/auth/login` (username/password) issues a JWT carrying `role: 'store'`. `JwtAuthGuard` rejects store tokens and `StoreJwtGuard` rejects employee tokens — verified in both directions.
- `GET /api/store/payments/stream` is SSE (`@Sse`) with a 25 s ping. The client reads it with **`fetch` + `Authorization` header, not `EventSource`**, so the token never lands in a URL or proxy log.
- The client has a 60 s heartbeat watchdog: a dead backend behind the dev proxy leaves the request hanging without an error, so silence — not just a socket error — must trigger reconnect. On every reconnect the list is refetched to pick up payments missed while offline.
- The store never receives employee wallet balances: `ReceiptLine.remainingAfter` is stripped from both the SSE payload and `GET /api/store/payments`.

## Design system (important — user-approved, do not regress)

- **Glassmorphism, light-first.** Dark mode is opt-in via the `.dark` class only — never default to dark and never follow OS preference. Palette: violet `#7C3AED` primary, emerald `#059669` accent, lavender `#FAF5FF` background.
- Single source of truth: `shared/ui/theme/glass.css` (imported by both apps) + `design-system/sanpay/MASTER.md`.
- Style spartan components via CSS variables and `[data-slot=…]` overrides in `glass.css`. **Never hand-edit generated files under `shared/ui/*`** — they must stay regeneratable via `nx g @spartan-ng/cli:ui <name>` (config in `components.json`).
- Backdrop blur only on elevated surfaces (cards, dialogs, menus, sheets…), not inputs/rows. Keep the `prefers-reduced-transparency` / `prefers-reduced-motion` fallbacks. Text contrast ≥ 4.5:1. SVG icons only, no emoji.
- Do NOT use `background-attachment: fixed` — it blanks/janks Chromium on scroll; the fixed gradient lives on `body::before` in `glass.css`.
- Use the `ui-ux-pro-max` skill (global, `~/.agents/skills/ui-ux-pro-max`) for style/palette/UX decisions, and the `spartan` skill + `spartan-ui` MCP server (`.mcp.json`) for component APIs.

## Module boundaries & lint tags

Every project is tagged so `@nx/enforce-module-boundaries` (depConstraints in the root `eslint.config.mjs`) can work — untagged projects fail lint outright.

| Project                                          | Tags                         |
| ------------------------------------------------ | ---------------------------- |
| `apps/app`                                       | `type:app`, `scope:employee` |
| `apps/store`                                     | `type:app`, `scope:store`    |
| `apps/dashboard`                                 | `type:app`, `scope:admin`    |
| `apps/api`                                       | `type:app`, `scope:api`      |
| `shared/models`, `shared/receipt`, `shared/ui/*` | `type:lib`, `scope:shared`   |

Apps may depend on libs only (never on each other); libs may depend on libs only. Each app reaches its own scope plus `scope:shared`. **Any new project needs tags** — pick the app's scope, or `type:lib` + `scope:shared` for shared code.

Two lint rules are turned off for the generated spartan libs in the hand-owned `shared/ui/eslint.overrides.mjs`, which each `shared/ui/*/eslint.config.mjs` spreads **last** (a root-level override can't win: the generated lib configs spread the root config first, and in flat config the last match wins):

- `@nx/dependency-checks` — the generator emits identical `peerDependencies` regardless of what a component imports, so fixing it would mean hand-editing generated `package.json` files.
- `@angular-eslint/component-selector`, scoped to `hlm-carousel-next.ts` / `hlm-carousel-previous.ts` — generated source uses attribute selectors on a host element (`button[hlmCarouselNext]`).

**After `nx g @spartan-ng/cli:ui <name>`** the regenerated component's `project.json` and `eslint.config.mjs` are overwritten, dropping its `tags` and its `...uiOverrides` spread. Re-add both, then re-run `npx nx run-many -t lint`.

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
npx nx serve store      # store panel   → http://localhost:4400  (demo: olympic / store1234)
npx nx serve api        # NestJS API    → http://localhost:3000/api
npx nx run-many -t build test lint
npx nx g @spartan-ng/cli:ui <name>   # add/regen a spartan primitive
```

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

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

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
