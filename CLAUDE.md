# Sanpay

Welfare/credit platform for the employees of **شرکت جهان‌فولاد سیرجان** (Jahan Foolad Sirjan), built by **شرکت طرح و توسعه دیار مانا**. Employees receive purchase credit for contracted stores plus welfare credits; stores get their own panel; employees log in from the app's home page. Functional scope: `~/Downloads/jahan-foolad.pdf` (Persian proposal — virtual credit card, QR one-time-code purchases, contracted stores, rations/ارزاق distribution, reporting; phase 2 adds travel services).

**Current workflow: full-stack.** Design is approved; pages are being wired to the real API. Employee auth is JWT-based and uses the **national code (کد ملی)** as the login identifier (`POST /api/auth/login`); the app dev-server proxies `/api` to `localhost:3000`. Seed data: `npm run prisma:seed` (demo employee `3060123456` / `12345678`, dashboard admin `admin` / `admin1234`). Remaining mock-only pages should be migrated to API data as they are touched.

## Projects

| Project     | Path             | What it is                                                                                                                     |
| ----------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `app`       | `apps/app`       | Employee-facing app. **Persian, RTL** (`lang="fa" dir="rtl"`). Serve: port **4200**                                            |
| `dashboard` | `apps/dashboard` | Admin/management dashboard. **Persian, RTL**, full page width (no `max-w` on content). Serve: port **4300**                    |
| `store`     | `apps/store`     | Contracted-store panel. **Persian, RTL.** Store login + live payment feed. Serve: port **4400**                                |
| `api`       | `apps/api`       | NestJS + Prisma 7 + PostgreSQL                                                                                                 |
| `ui`        | `shared/ui`      | Shared spartan/ui library — all 57 primitives as secondary entrypoints: `import { HlmButtonImports } from '@sanpay/ui/button'` |
| `models`    | `shared/models`  | Shared domain models (TypeScript interfaces) used by app + dashboard: `import { Wallet } from '@sanpay/models'`                |
| `dates`     | `shared/dates`   | Jalali date providers + ISO↔Jalali helpers: `import { providePersianDates, isoToJalali } from '@sanpay/dates'`                 |
| *applets*   | `libs/applets/*` | Self-contained feature units the employee app lazy-loads — see **Applets** below                                               |
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

### Store panel pages

Two pages under a shared shell (`pages/shell`) that owns the header + nav:

- **فروش‌ها** (`/payments`) — live receipt feed plus sales figures from `GET /api/store/stats`. That endpoint aggregates **server-side** with day boundaries in **Asia/Tehran**; the panel used to sum "today" from the 50-row `recent()` window, which silently under-reported exactly on the busiest days, and a UTC boundary would have pushed after-midnight sales into yesterday. A receipt arriving over SSE optimistically bumps the figures so the seller sees the sale they just made.
- **کد QR** (`/qr`) — the seller's own till QR. Rendered client-side from `SANPAY:S:<code>` with `qrcode` (dynamically imported to stay out of the sales-page bundle; error-correction **H**, because a label sits on a counter for months and picks up scuffs). Offers **download PNG** and **print** so it can be physically placed on the till, and prints the code as text as the manual-entry fallback. The print stylesheet hides everything except `.printable`.

## Design system (important — user-approved, do not regress)

- **"Ink & gold", light-first, dense.** Dark mode is opt-in via the `.dark` class only — never default to dark and never follow OS preference.
  - **Ink navy** (`--ink-900…--ink-300`) is the structural colour: body text, the hero/summary cards, dark chrome. It is *not* the brand — see per-app palettes below.
  - **Gold** (`--gold-600…--gold-100`) means **value** — the hero highlight and the default progress fill. Used sparingly so it keeps meaning something.
  - **Emerald/red/amber are semantic only**, never decoration: `--pos/-fg/-bg` (available), `--neg-fg/-bg` (spent, over limit), `--warn-fg/-bg` (scarcity).
  - Canvas is a cool neutral `#F4F6FA`; cards are **opaque white**.
- ⚠ **Gold is not a text colour on light surfaces** — `--gold-500` on white is ~2.1:1. Use it for fills, bars and icons; for gold *text* you must be on ink, where `--gold-300` reaches ~7:1. Text on light uses `--foreground` / `--muted-foreground` / `--pos-fg` / `--neg-fg` / `--warn-fg`.
- **Never gradient between two near-complementary hues.** The old violet→emerald hero passed through a desaturated grey-teal at its midpoint — that muddy band was the single most "cheap-looking" thing in the app. Every gradient now stays inside one ramp (ink→ink, gold→gold).
- **Blur is for floating layers only** (dialogs, popovers, menus, sheets), not cards. A card sits in the scroll flow over a known background, so blur bought nothing while costing a filter per list row. Cards are opaque + `--hairline` border + `--elev-1`; the hairline is what actually gives an edge on light surfaces.
### Per-app brand palettes — "override the brand, never the scale"

`glass.css` owns the **scale** (ink ramp, elevation, radius, spacing, semantics, the category spectrum) and ships a neutral ink fallback. Each app then declares its **brand** in its own `styles.css`, *after* the import:

| App | `--brand` | Why |
| --- | --- | --- |
| `app` (employee) | teal `#0F766E` | Opened daily for everyday shopping — should feel warm and alive, not administrative. Teal also stays clear of the category spectrum; a blue or green brand would collide with it. |
| `dashboard` | indigo `#3538CD` | A tool, not a consumer app: hours on screen, wall-to-wall tables. Also gets a slightly cooler `--background`, since the warm off-white looks papery under wide tables. |
| `store` | green `#047857` | The seller only ever watches money arrive, so the brand *is* the positive colour — deliberately deeper than `--pos` so buttons don't read as receipt amounts. |

Only `--brand` / `--brand-fg` / `--brand-soft` are set. `--primary`, `--ring`, `--secondary`, `--accent` and every sidebar token are **derived** from them with `var()`, so one override repaints the app. Do not hardcode `--primary` in an app, and do not override the scale — the three panels must read as siblings.

All three brands clear 4.5:1 against white (5.47 / 8.08 / 5.48, measured).

### The category spectrum (`--cat-*`)

Six wallet categories — `food, grocery, sport, health, travel, gift` (the exact `icon` values the API sends) — each get a `-fg` (AA-safe text/icon on light), `-bg` (tint for the icon chip) and a solid (progress fill). **This is the only place free colour is allowed, and the justification is functional, not decorative:** the home screen is a list of five or six wallets that were previously identical grey boxes, so finding «ورزش» meant reading every title.

Every `-fg` clears 4.5:1 on both its own tint and white (4.58–7.10, measured). An unknown `icon` falls back to ink rather than a random hue, so a new category can't silently borrow another's colour. `hlm-progress` accepts a per-call `--progress-color`; unset, it stays gold.

- **Don't stack padding on `hlm-card`.** The card frame already applies `py-(--card-spacing)`; adding `py-*` to the content div doubles it (64px of padding around 129px of content, measured). Let the card own vertical padding.
- Single source of truth: `shared/ui/theme/glass.css` (imported by both apps) + `design-system/sanpay/MASTER.md`.
- Style spartan components via CSS variables and `[data-slot=…]` overrides in `glass.css`. **Never hand-edit generated files under `shared/ui/*`** — they must stay regeneratable via `nx g @spartan-ng/cli:ui <name>` (config in `components.json`).
- Backdrop blur only on elevated surfaces (cards, dialogs, menus, sheets…), not inputs/rows. Keep the `prefers-reduced-transparency` / `prefers-reduced-motion` fallbacks. Text contrast ≥ 4.5:1. SVG icons only, no emoji.
- Do NOT use `background-attachment: fixed` — it blanks/janks Chromium on scroll; the fixed gradient lives on `body::before` in `glass.css`.
- Use the `ui-ux-pro-max` skill (global, `~/.agents/skills/ui-ux-pro-max`) for style/palette/UX decisions, and the `spartan` skill + `spartan-ui` MCP server (`.mcp.json`) for component APIs.

### Spartan first — no native form controls

**Before adding any UI, check what spartan already ships for it.** Never use a native `<select>`, `<input type="date">`, `<input type="number">`, or a hand-rolled `<input class="border-input bg-background h-10 …">`. Every one of those existed in the app once and has been migrated:

| Need | Use | Not |
| --- | --- | --- |
| Text/password/tel input | `hlmInput` inside `<hlm-field>` + `hlmFieldLabel` | bare `<input>` + copy-pasted Tailwind |
| Input with a unit, icon or inline button | `hlm-input-group` + `hlm-input-group-addon` / `-text` / `-button` | a sibling `<span>` next to the input |
| Choice from a list | `hlm-select` (+ `[itemToString]` so the trigger shows a label, not the raw value) | native `<select>` |
| 2–7 exclusive options | `hlm-toggle-group` + `hlmToggleGroupItem` | a row of `hlmBtn` with a `variant` ternary |
| Date | `hlm-date-picker` + `hlm-date-picker-trigger` | `<input type="date">` |
| Counter (e.g. تعداد شب) | `hlm-input-group` with −/+ `hlmInputGroupButton`s | `<input type="number">` |
| Error message | `hlmAlert variant="destructive"` | a bare `<p class="text-destructive">` |

Control sizing, focus rings, badge/progress/tabs/skeleton/toggle styling all live in `glass.css` — style there via `[data-slot=…]`, never per call site. Spartan ships form controls at `h-8` and buttons at `h-8`/`h-7`; `glass.css` raises them to a 44px touch target for this mobile-first app.

Prefer a component's own inputs over CSS when one exists — e.g. `hlm-toggle-group [spacing]="2"` gives separate pills, where the default `spacing=0` builds a joined segmented bar. Fighting that in CSS produces the wrong shape.

#### The `glass.css` overrides are deliberately UNLAYERED

**Do not wrap the component overrides in `@layer components` (or any layer).** Tailwind v4 imports `tailwindcss/utilities.css` *without* a `layer()`, so every spartan utility is unlayered — and unlayered rules beat every layered rule regardless of specificity. A rule inside `@layer components` therefore loses to `data-[state=on]:bg-muted` no matter how specific you make the selector, and no `:root` prefix or extra attribute will save it. This is exactly how the selected toggle ended up as white text on a 5% grey fill (~1.1:1 contrast).

Being unlayered and imported *after* utilities in each app's `styles.css`, the overrides win on source order. The trade-off is that a call-site utility can no longer override a property set in `glass.css`: put component-wide concerns in the theme file, and keep call sites to layout (width, alignment, spacing).

When verifying CSS changes, confirm the browser is not on a cached stylesheet (check the `<link>` hash) — and note the dev server may need a reload to pick up `shared/ui` edits.

#### Styling a spartan primitive: check what actually renders a box

Several hlm hosts are `display: contents` and paint nothing — `hlm-checkbox` is one. A `border`/`background` on `[data-slot='checkbox']` computes fine in devtools and is invisible on screen; the real box is the `button` inside (`[data-slot='checkbox'] button`). Before writing an override, inspect the rendered subtree and target the element that has the box, then scope to `:not([data-state='checked'])` so spartan keeps owning the checked look.

Same shape of trap in `hlm-calendar`: its inner wrapper is `inline-flex`, so `w-full` on the table can't widen anything until that wrapper is opened up. Widen *only* that wrapper — forcing `display: flex`/`width` on the calendar host or the cells stretches row heights and turns the days into giant squares.

#### The date-picker popover width

`hlm-date-picker`'s popover is `w-fit` and comes out narrower than its own field. `brn-popover` has no trigger-width plumbing (unlike `brn-select`'s `updateTriggerWidth`), and the content lives in a CDK overlay, so CSS alone cannot know the width. `SanpayDatePickerWidth` (`@sanpay/dates`) publishes the trigger width to `--sanpay-date-picker-width` and `glass.css` applies it to `.cdk-overlay-pane:has([data-slot='calendar'])`. Add the directive to every new `<hlm-date-picker>`. It is a `min-width` clamped to 24rem — the ask is "not narrower than the input", and an unclamped 640px-wide field would otherwise produce an absurd calendar.

#### `NG0203` on a spartan primitive used only from a lazy route

`@spartan-ng/brain` entrypoints reached only from a lazily-loaded route get prebundled by vite in a *second* optimizer pass, which drags in a second copy of `@angular/core`; a `providedIn: 'root'` service from brain (e.g. `BrnDialogService`) is then missing from the root injector the app is actually using, and you get `NG0203`. It survives a full `.angular/cache` wipe, so it is not staleness. The dashboard's `serve` target sets `"prebundle": { "exclude": ["@spartan-ng/brain"] }` to fix it. Production builds were never affected. Note the schema has `additionalProperties: false`, so no `"//"` comment key inside that object.

### Jalali dates

`@spartan-ng/brain` ships `BrnJalaliDateAdapter` + `JalaliDate` — **do not write a date adapter.** `providePersianDates()` (`shared/dates`, imported as `@sanpay/dates`) is installed in the `app.config.ts` of both the employee app and the dashboard and wires the adapter, Persian month/weekday labels, week-starts-Saturday, and Persian-digit formatting. Because it is a root provider, every applet's `hlm-calendar` / `hlm-date-picker` gets it without depending on the app.

The API and هتل‌یار speak Gregorian `YYYY-MM-DD`; `JalaliDate` exists only at the display boundary. Convert with `isoToJalali` / `jalaliToIso` from `@sanpay/dates` (the tourism applet still has its own copy in `libs/applets/tourism/src/lib/format.ts`).

**Solved by the font:** the day numbers *inside* the calendar grid used to render Latin (`13`, not `۱۳`) — `hlm-calendar` interpolates `_dateAdapter.getDate(date)` directly and `BrnCalendarI18n` has no `formatDay` hook, so no code fix was possible without editing a generated file. Switching the app font to **Vazirmatn FD** fixed it everywhere at once (see Persian/RTL conventions below). Don't reintroduce a string-level digit converter for this.

## Module boundaries & lint tags

Every project is tagged so `@nx/enforce-module-boundaries` (depConstraints in the root `eslint.config.mjs`) can work — untagged projects fail lint outright.

| Project                                          | Tags                         |
| ------------------------------------------------ | ---------------------------- |
| `apps/app`                                       | `type:app`, `scope:employee` |
| `apps/store`                                     | `type:app`, `scope:store`    |
| `apps/dashboard`                                 | `type:app`, `scope:admin`    |
| `apps/api`                                       | `type:app`, `scope:api`      |
| `shared/models`, `shared/dates`, `shared/receipt`, `shared/ui/*` | `type:lib`, `scope:shared`   |
| `libs/applets/*`                                 | `type:applet`, `scope:employee` |

Apps depend on applets + libs (never on each other); applets depend on applets + libs; plain libs depend on libs only. Each app reaches its own scope plus `scope:shared`. **Any new project needs tags** — pick the app's scope, `type:applet` + the owning app's scope for an applet, or `type:lib` + `scope:shared` for shared code.

Two lint rules are turned off for the generated spartan libs in the hand-owned `shared/ui/eslint.overrides.mjs`, which each `shared/ui/*/eslint.config.mjs` spreads **last** (a root-level override can't win: the generated lib configs spread the root config first, and in flat config the last match wins):

- `@nx/dependency-checks` — the generator emits identical `peerDependencies` regardless of what a component imports, so fixing it would mean hand-editing generated `package.json` files.
- `@angular-eslint/component-selector`, scoped to `hlm-carousel-next.ts` / `hlm-carousel-previous.ts` — generated source uses attribute selectors on a host element (`button[hlmCarouselNext]`).

**After `nx g @spartan-ng/cli:ui <name>`** the regenerated component's `project.json` and `eslint.config.mjs` are overwritten, dropping its `tags` and its `...uiOverrides` spread. Re-add both, then re-run `npx nx run-many -t lint`.

## Applets (`libs/applets/*`)

Employee-app features live as **applets**, not as pages inside `apps/app`. An applet is an Angular library that owns its routes, pages and data-access service; the app mounts it lazily and knows nothing about its internals:

```ts
// apps/app/src/app/app.routes.ts
{ path: 'tourism', loadChildren: () => import('@sanpay/applets/tourism').then((m) => m.tourismRoutes) }
```

- Each applet exports its `Route[]` (plus any service the host needs) from `src/index.ts`; the path alias is `@sanpay/applets/<name>` in `tsconfig.base.json`.
- Tag every applet `type:applet` + the owning app's scope (`scope:employee`). Applets may use other applets and `type:lib` libs; the app may use applets and libs.
- Existing applets: `auth` (`AuthService` + `authGuard` + `authInterceptor` — moved out of `apps/app/src/app/core/auth` so applets can use it), `wallet` (`WalletService`, used by the home page), `stores` (فروشگاه‌ها tab), `profile` (پروفایل tab) and `tourism` (hotel booking). New employee features should be added as applets, and remaining `apps/app/src/app/pages/*` should migrate there as they are touched.
- The **stores tab** (`GET /api/stores`) derives from the employee's wallets, not the store list: it starts from active, unexpired allocations with a positive balance — the same rule as `checkout` — so a store the employee has no credit for never appears. Its «پرداخت» button deep-links to `/qr?store=<code>`, which `PayPage` reads from the query param and skips scanning.
- The **profile tab** (`GET /api/profile/summary`, `GET /api/profile/payments`, `PATCH /api/auth/me`, `POST /api/auth/change-password`) covers identity, credit summary, purchase history, phone edit (the only self-editable field), password change and a static FAQ. The FAQ deliberately has no phone number — واحد رفاه's real contact details have not been given to us yet.
- Applet routes navigate with absolute paths (`/tourism/...`), so an applet is currently tied to the prefix the app mounts it at.

### Tourism applet + هتل‌یار (WorldGDS)

Employees book hotels with a **`TOURISM` wallet** — hotels are *not* stores and never appear in the QR/store flow. A `TOURISM` `WalletDefinition` has no `WalletDefinitionStore` rows; `TourismService` rejects any other wallet kind.

- Upstream is the هتل‌یار / WorldGDS API (spec: `~/Downloads/GDS Document V6.3.pdf`, Postman collection in `~/Downloads/GDS-Demo.postman_collection.json`). Everything is POST with `sessionId` **in the body** and `APIKEY` in the header; **errors come back with HTTP 200** and `status: false`, so `status` must be checked, not the status code. Most numbers arrive as strings — normalized in `tourism.mapper.ts`.
- `GdsClient` (abstract, `apps/api/src/app/tourism/gds/gds.types.ts`) has two implementations: `GdsHttpClient` (real; caches the session — `expiredTime` from `login` when it is shorter than an hour, else an hour — and retries once on error 1104/1107) and `GdsMockClient`. **`GDS_MODE=live` selects the real client; anything else (including an unset variable) falls back to the mock**, so a half-filled `.env` never half-connects to هتل‌یار. Demo credentials for `https://apidemo.worldgds.com` are in place — copy `.env.example` to `.env`, fill `GDS_API_KEY` / `GDS_USERNAME` / `GDS_PASSWORD`, and verify with `npm run gds:check` (login → getCity → getHotel → searchHotel, no booking). The demo host is reachable from Iran only. **`searchHotel` needs `hotelCapacityType` in the body even though the v6.3 spec and the Postman collection never mention it** — without it every search comes back `status: true` with an empty array, which looked for a long time like the demo account simply had no capacity. See the comment on `GdsHttpClient.searchHotel` for the measured semantics. Mock images are inline SVG data URIs on purpose: external CDNs are unreliable in Iran. Mock hotel `362` returns `Pending` (offline capacity) and its room `9802` is full, so both paths stay testable.
- **Booking order matters:** validate → book at هتل‌یار → *then* debit the wallet. Debiting first would burn credit on any network error. The `HotelBooking` row is written **before** the GDS call with `transactionId: null`, so a booking that succeeded upstream but failed locally is findable rather than silent.
- `statusCode: '1'` → `CONFIRMED` (online capacity), `'0'` → `PENDING` (offline; هتل‌یار confirms later via webhook).

### Webhook receiver (`POST /api/tourism/webhook`)

هتل‌یار posts every reservation change to an address we register with them (spec section 14). `TourismWebhookController` + `TourismWebhookService` handle it; it is the **only** tourism endpoint without employee JWT.

- **Auth** is a shared secret **in the URL we register with them** — `POST /api/tourism/webhook/<GDS_WEBHOOK_SECRET>` — because هتل‌یار only takes an address and offers no way to set a custom header. `?token=…`, `X-Webhook-Token` and `Authorization: Bearer …` are accepted as fallbacks on the secret-less path. Compared timing-safely in `GdsWebhookGuard`. The trade-off is that the secret lands in access logs: suppress path/query logging for this route in the reverse proxy, and rotating the secret means re-registering the URL. `GDS_WEBHOOK_SECRET` in `.env`; if it is unset the endpoint is closed — except under `GDS_MODE=mock`, where it stays open for local testing and logs a warning.
- Three actions: `reserve` → `CONFIRMED`; `reserve_reject` → `REJECTED` + full refund; `change` → cancellation (`report.changesLog[].detail.changes[].operation === 1`) means `CANCELED` + refund of `totalReturnToCustomer` only — the cancellation penalty stays in `payable` as our debt to هتل‌یار. A non-cancel `change` only updates `payable`; it never moves employee money without a human.
- **Idempotency**: every event is stored in `GdsWebhookEvent`, unique on `(action, reservationId, changeId)`. Only a *successfully processed* event is skipped as a duplicate — a failed one is deliberately reprocessed, since هتل‌یار retries whatever does not get a 200. The refund itself is additionally guarded by `HotelBooking.refundedAmount` being non-null.
- Matching is by `gdsReserveId`, falling back to `report.externalId` (= our `referenceNo`) for bookings whose GDS id never got written. An event with no matching booking is archived with an error and still answered 200 — endless retries for a payload we cannot act on help no one; the raw body is there for manual review.
- A late `reserve` for an already `REJECTED`/`CANCELED` booking is ignored: final status and the refund must not roll back.
- **Not** implemented: no request-body signature (هتل‌یار sends none) and no re-poll of `report` to reconcile events lost while the API was down.
- Settlement with هتل‌یار (~2 AM, via a پرداخت‌یار) is **not implemented**. The data is in place: `HotelBooking.payable` (sum of `hotelPrice` = our debt, not what the employee paid), `settledAt`, `settlementBatchId`.

## Dashboard (`apps/dashboard`)

Persian/RTL admin panel for واحد رفاه, served at **4300** (dev-server proxies `/api` to `localhost:3000`, same as the app). **Full page width by design:** the shell is a fixed 64-wide sidebar plus a `flex-1` main with no `max-w` — wide tables are the point. Wide tables scroll inside `[data-slot=table-container]`, so the page body never scrolls horizontally (rules live in `apps/dashboard/src/styles.css`).

- Auth is a third, separate identity: `Admin` model, `POST /api/admin/auth/login` (username/password), token carries `role: 'admin'` + `scope` (the admin's role). `JwtAuthGuard` (employee) rejects it because it has no `nationalCode`, `StoreJwtGuard` because `role !== 'store'`. Seed admin: `admin` / `admin1234`.
- Roles: `SUPER_ADMIN` (also manages dashboard users), `ADMIN`, `VIEWER` (**read-only** — enforced server-side by `@Roles(...WRITE_ROLES)` on every writing route, and mirrored in the UI by `AdminAuthService.canWrite`). Never rely on the UI check alone.
- Pages: نمای کلی (stats + 14-day chart + top stores), کارمندان (+ per-employee file: allocations, cap/expiry edit, manual refund, password reset), کیف‌پول‌ها (definitions, store links, bulk allocation), فروشگاه‌ها (CRUD + QR code + panel password), پرداخت‌ها, رزرو هتل, کاربران داشبورد, تنظیمات.
- Money edits are guarded server-side: a cap can never drop below `spent`, and a manual adjustment writes a `Transaction` (`REFUND`/`ADJUSTMENT`) so the change is traceable rather than a silent `spent` edit.
- Bulk allocation updates an employee's existing active allocation instead of stacking a second one; an employee whose `spent` already exceeds the new cap is **skipped** and counted in the result, not clamped.
- **Allocation from the wallets page is bulk-only and lives in a modal.** Two modes on `POST /api/admin/wallet-definitions/bulk-allocate`: without `entries`, one `cap`/`expiresAt` for every active employee; with `entries` (from an uploaded CSV/XLSX of *کد ملی، سقف، تاریخ انقضای جلالی*), only those employees, each with its own values. National codes with no matching employee come back in `result.notFound` rather than failing silently. Parsing is client-side in `apps/dashboard/src/app/core/allocation-file.ts` — Jalali→Gregorian happens there because the API only speaks `YYYY-MM-DD`; `read-excel-file/browser` is imported dynamically to keep it out of the initial bundle.
- Wallet `defaultCap` left empty means **unlimited** (`null`), so the update DTO must accept an explicit `null` to clear a previous cap — `undefined` means "don't touch".
- The kind picker offers only `CREDIT` and `TOURISM`. `RATION` still exists in the schema and in old rows (and keeps its label), but is no longer offered for new wallets.

## Angular conventions

**Angular is v22.** Two defaults are easy to get wrong because older docs and habits say otherwise:

- **Do NOT write `standalone: true`** — it is the default since v20.
- **Do NOT write `changeDetection: ChangeDetectionStrategy.OnPush`** — it is the default since v22. Adding it explicitly is noise, not safety.

Tooling: the `angular-developer` and `angular-new-app` skills (`.agents/skills/`) plus the `angular-cli` MCP server in `.mcp.json`. Use them for component/service APIs and generators the same way `spartan` + `spartan-ui` cover the UI primitives.

### Components

- `input()` / `output()` functions, never the decorators. `model()` for two-way `[(prop)]` instead of an `input()`+`output()` pair.
- Host bindings go in the `host` object of the decorator — **not** `@HostBinding` / `@HostListener`.
- `inject()` over constructor injection. `@Service` over `@Injectable({providedIn: 'root'})` for new singletons.
- Keep components small and single-purpose; prefer inline templates for small ones. External templates/styles use paths relative to the component `.ts`.

### State

Signals for local state, `computed()` for derived state, `linkedSignal()` when derived state must stay in sync across several reactive sources. Never `mutate` a signal — `set` or `update`. Keep transformations pure.

### Templates

- Native control flow (`@if` / `@for` / `@switch`), never the structural directives.
- **`class` and `style` bindings — never `ngClass` / `ngStyle`.**
- **Prefer `@defer` over hand-rolled `IntersectionObserver`.** `@defer (on viewport)` + `@placeholder` covers "load when it scrolls into view" natively; a custom observer directive is extra code with its own lifecycle bugs. This is why `scroll-end.ts` was deleted from the tourism applet.
- `NgOptimizedImage` for static images — note it does **not** work with inline base64/data URIs, which is why the mock client's SVG placeholders can't use it.
- Don't assume globals like `new Date()` are available in templates.

### Forms

Prefer **Signal Forms** (`@angular/forms/signals`, stable in v22) for new forms. Otherwise reactive forms — never template-driven.

### Accessibility

Must pass AXE and meet WCAG AA: focus management, ≥4.5:1 contrast, correct ARIA. This reinforces the contrast rule in the design system section.

## Persian/RTL conventions (`apps/app`)

- **Vazirmatn FD** («Farsi Digits»), self-hosted from `shared/ui/theme/font.css` + `shared/ui/theme/fonts/*.woff2`, imported by all three apps — never add Google Fonts links (unreliable in Iran). The woff2 files are vendored out of the `vazirmatn` npm package (`misc/Farsi-Digits/fonts/webfonts`); that package is ~13 MB and is **not** kept as a dependency, so update by re-copying from a fresh version.
- **Every Latin digit renders as a Persian digit, font-side.** In FD the U+0030–0039 slots are drawn as ۰-۹, so numbers come out Persian even where our code can't reach — inside `hlm-calendar`'s day grid, generated spartan components, third-party text. This retired the old "calendar days render Latin" gap. DOM/`input.value` stay Latin, so parsing, validation and copy/paste are unaffected; keep using `fa()`/`toman()` for grouping and units, not for digit conversion.
- Persian digits (۱۲۳) and amounts (۲۴٬۵۰۰٬۰۰۰ تومان), Jalali dates (۱۴۰۵/۰۶/۳۱); wrap card numbers/codes in `dir="ltr"`.
- **Never use `•` as a separator next to a Persian digit** — «• ۲ شب» reads as «۲۰ شب». Use `—` or `،`.

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
