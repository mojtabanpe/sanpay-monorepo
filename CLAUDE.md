# sanpay

Welfare/credit platform for the employees of **شرکت جهان‌فولاد سیرجان** (Jahan Foolad Sirjan), built by **شرکت جهان صنعت پویا نگین مشیز**. Employees receive purchase credit for contracted stores plus welfare credits; stores get their own panel; employees log in from the app's home page. Functional scope: `~/Downloads/jahan-foolad.pdf` (Persian proposal — virtual credit card, QR one-time-code purchases, contracted stores, rations/ارزاق distribution, reporting; phase 2 adds travel services).

**Current workflow: full-stack.** Design is approved; pages are being wired to the real API. Employee auth is JWT-based and uses the **national code (کد ملی)** as the login identifier (`POST /api/auth/login`); the app dev-server proxies `/api` to `localhost:6500`. Seed data: `pnpm prisma:seed` (demo employee `3060123456` / `12345678`, dashboard admin `admin` / `admin1234`). Remaining mock-only pages should be migrated to API data as they are touched.

## Projects

| Project     | Path             | What it is                                                                                                                                                                  |
| ----------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app`       | `apps/app`       | Employee-facing app. **Persian, RTL** (`lang="fa" dir="rtl"`). Serve: port **6200**                                                                                         |
| `dashboard` | `apps/dashboard` | Admin/management dashboard. **Persian, RTL**, full page width (no `max-w` on content). Serve: port **6300**                                                                 |
| `store`     | `apps/store`     | Contracted-store panel. **Persian, RTL.** Store login + live payment feed. Serve: port **6400**                                                                             |
| `api`       | `apps/api`       | NestJS + Prisma 7 + PostgreSQL                                                                                                                                              |
| `ui`        | `shared/ui`      | Shared spartan/ui library — all 57 primitives as secondary entrypoints: `import { HlmButtonImports } from '@sanpay/ui/button'`                                              |
| `models`    | `shared/models`  | Shared domain models (TypeScript interfaces) used by app + dashboard: `import { Wallet } from '@sanpay/models'`                                                             |
| `dates`     | `shared/dates`   | Jalali date providers + ISO↔Jalali helpers: `import { providePersianDates, isoToJalali } from '@sanpay/dates'`                                                              |
| _applets_   | `libs/applets/*` | Self-contained feature units the employee app lazy-loads — see **Applets** below                                                                                            |
| `forms`     | `shared/forms`   | Shared form helpers — `sanpayAmount` money input (thousands separator, Persian/Arabic digits, caret-safe, `max` clamp): `import { SanpayAmountInput } from '@sanpay/forms'` |
| `receipt`   | `shared/receipt` | Shared receipt component used by both the employee app and the store panel: `import { ReceiptCard } from '@sanpay/receipt'`                                                 |

## UPG — every payment goes through it

**UPG (universal payment gateway)** is the single place money moves: store QR, store-initiated OTP, hotel, flight, and any future purchase. Design and phases: `docs/upg.md`. **Only `UpgService` changes wallet `spent` for purchases and refunds** — admin `adjustAllocation` is the sole exception.

- A purchase area never debits a wallet. It creates a `PaymentIntent` (`UpgService.createIntent`) with the welfare allocations it allows, and the app navigates to `/upg/:intentId` (`libs/applets/upg`). Navigate by route — the app and other applets must not statically import the lazy `@sanpay/applets/upg` (lint enforces it).
- **Credit + card split is tourism-only (hotel/flight).** Store purchases (`purpose: 'STORE'`) are credit-only: `PaymentsService.startPayment` and the OTP `request` reject an amount above `totalAvailable`, `UpgService.cardAllowed` makes `pay` refuse a card share and reports `cardAvailable: false`, and the app's pay page caps the amount — the employee pays any excess by card directly at the store. The SMS payment-link flow (`AWAITING_EMPLOYEE`) is no longer produced for new payments.
- The UPG page defaults to «اول اعتبار» (credit first, editable inputs); whatever remains is paid by card through a gateway. Credit-only completes immediately.
- **Hidden personal wallet** (`WalletKind.PERSONAL`, named «کارت بانکی»): a verified gateway payment is topped up into it (`TOPUP`) and spent in the **same DB transaction** as the credit lines. It is excluded from every listing/report via `WELFARE_DEFINITION` (`apps/api/src/app/upg/personal-wallet.ts`) — add that filter to any new wallet query. Its balance is only non-zero after a failed purchase or a refund, and then shows in UPG as «مانده از پرداخت‌های کارتی قبلی».
- Each area registers a `UpgFulfiller` (`fulfill` after capture, `abandon` on expiry/cancel, `result`, `backPath`). A thrown error in `fulfill` = UPG refunds everything to its source (card share → personal wallet). An _unknown_ outcome must not throw — keep the money and refund later with `UpgService.refund(intentId, amount, note, tx)`, which returns the personal share first.
- **Hotel order changed:** collect money → reserve at the provider → refund internally on failure. Reserving first would leave an unpaid confirmed booking at هتل‌یار whenever someone abandons the bank page. Unpaid bookings sit in `AWAITING_PAYMENT` and are deleted when the intent expires.
- Gateways implement `PaymentGateway` and live in `GatewayRegistry` (`UPG_GATEWAYS`, `UPG_STRATEGY`, `UPG_WEIGHTS`). Each `GatewayPayment` stores its gateway key, so verify/refund always hit the gateway that took the money. Callback = `POST /api/upg/callback/:gateway` (no JWT; the browser posts it), then 303 to `/upg/:id/result`. Callback data is never trusted — the result comes from `verify`, and a callback for an intent that no longer waits for that payment is _not_ verified, so the gateway reverts it itself.
- **The mock gateway approves anything** — it is disabled under `NODE_ENV=production` unless `UPG_ALLOW_MOCK=true`, and so is the Toman simulator.
- **Toman IPG** (`upg/gateways/toman/`, key `toman`): `TOMAN_IPG_MODE=live` uses `TomanIpgHttpClient`, anything else an in-memory simulator that serves its own bank page (`/api/upg/mock-toman/:uuid`) and posts back like Toman — same contract as `GDS_MODE`. Simulator state is per process and lost on restart. Env: `TOMAN_IPG_URL`, `TOMAN_IPG_AUTH_URL`, `TOMAN_IPG_USERNAME|PASSWORD|CLIENT_ID|CLIENT_SECRET` (empty = the corporate-banking `TOMAN_*` ones), `TOMAN_IPG_TERMINAL`. OAuth tokens come from the shared `TomanOAuth` helper (`apps/api/src/app/toman/`), **one token per scope** (`payment.create`, `payment.list`, `ipg.refund.create`, `ipg.refund.read`) so a missing scope only disables its feature. An ambiguous verify (`status_change_not_allowed`, PSP error, timeout) is resolved by `GET /payments/:uuid`; if that fails too the payment stays open for the cron. Check live read-only with `pnpm nx run api:check-toman-ipg` (creates one payment, never verifies); unit tests `api:test-toman-ipg`.
- **Reconciliation cron** (`UpgService.reconcileGateways`): `CREATED`/`REDIRECTED` payments older than 5 min are inquired every 3 min. Returned-but-unverified = a late callback (verified only if the intent still waits for it); verified = topped up into the personal wallet even if the intent is closed; Toman `-3` → `UNKNOWN`, **manual only — never auto-retried or reverted**. `expireStale` no longer expires open gateway payments — money may have been taken.
- **Refund to card** («بازگشت پول» card in the profile applet, `CardRefundService`, `GET/POST /api/upg/card-refunds`): shown only when the personal wallet has a balance or a refund is in flight, never called a wallet. The amount is split across the employee's VERIFIED payments oldest-first (each up to `amount − refundedAmount`, which also reserves in-flight refunds), debited at once (`WITHDRAWAL`, `cap −=`), and sent with our own `tracker_id`. `FAILED`/`DENIED` credit it back (`TOPUP` with `gatewayRefundId`); a payment whose refund `FAILED` is skipped from later splits. `SUBMITTING`/`PENDING`/`UNKNOWN` are polled by `pollRefunds`; a lost create is found by tracker or re-submitted with the same tracker. Min 1,000 toman unless the whole balance is smaller. `UPG_MOCK_REFUND_RESULT=success|failed|denied|unknown` drives the mocks.
- **Dashboard (phase 3, `/api/admin/upg/*`, `upg/admin/`):** «پرداخت‌های درگاه» list/detail (raw + error, intent and its attempts, refunds, wallet movements, audit notes), «بررسی دستی درگاه» queue (`UNKNOWN` payments; refunds `UNKNOWN`, `SUBMITTING` > 15 min, `PENDING` > 3 days; its size is a red nav counter from `GET review-queue/count`, refreshed on every navigation and after each decision), «درگاه‌ها» (Toman refund-wallet balance via `GET /wallet/refund`, scope `ipg.wallet.read`, low below `UPG_REFUND_WALLET_MIN` toman; read-only gateway config). Manual decisions are `WRITE_ROLES`-only, each behind `ConfirmService.askNote` (alert dialog with a required note) and write a `GatewayReview` **in the same DB transaction** as the status change. They reuse the money paths — never add new ones: payment verified → `UpgService.topUpVerified` (the single top-up used by callback, cron and dashboard; settles the intent if it still waits for that payment), refund failed → `CardRefundService.creditBack`. Inquire endpoints only read. The simulator's refund wallet is a fixed 100M rial (`UPG_MOCK_REFUND_WALLET_RIAL` to test the warning); launch config `api-upg-toman-mock` runs the API against it. Tests: `api:test-upg-admin`.
- Store-initiated OTP payments: if credit covers the amount it completes on OTP as before; otherwise the employee gets an SMS link to `/upg/:id` (template `SMSIR_PAYMENT_LINK_TEMPLATE_ID`) and the store panel waits on the live stream for the receipt with that `merchantIntentId`. Login keeps a `returnUrl` so the link works for a logged-out employee.

## Purchase flow (approved design — merchant-presented QR)

The employee scans a **static QR printed at the store's till**; there is no physical card and the cashier needs no scanner.

1. Each `Store` has a short `code` (e.g. `OLMP3652`). The QR encodes `SANPAY:S:<code>`; the bare code is also accepted so it can be typed by hand when the camera is unavailable.
2. Employee opens the QR tab (`/qr` → `apps/app/src/app/pages/pay/`), scans, and `GET /api/checkout/:storeCode` returns the store plus the credit usable there (for display).
3. The employee types the **total** amount, asking the cashier what it is; `POST /api/payments` creates a UPG intent and the app goes to `/upg/:intentId`, where the split between wallets and card happens.
4. When the money is captured, `StorePaymentFulfiller` writes one `Payment` (8-digit `receiptNo`, `intentId`) and links the intent's `PURCHASE` transactions to it.
5. The receipt (`<sanpay-receipt-card>`) is shown live on the UPG result page, and the same receipt appears **live** in the store panel via SSE — see below. A card share shows as a «کارت بانکی» line.

**Known trade-off:** the employee enters the amount and the cashier does not confirm in-system, so the receipt screen is the store's only assurance. That is why it carries store + amount + exact time + receipt number. A cashier-side confirmation step would close this gap if it ever matters.

QR scanning uses the native `BarcodeDetector` when available and falls back to `jsqr` on canvas frames (`apps/app/src/app/core/checkout/qr-scanner.ts`), so it works on iOS Safari too.

## Store panel live feed

- Store auth is separate from employee auth: `POST /api/store/auth/login` (username/password) issues a JWT carrying `role: 'store'`. `JwtAuthGuard` rejects store tokens and `StoreJwtGuard` rejects employee tokens — verified in both directions.
- `GET /api/store/payments/stream` is SSE (`@Sse`) with a 25 s ping. The client reads it with **`fetch` + `Authorization` header, not `EventSource`**, so the token never lands in a URL or proxy log.
- The client has a 60 s heartbeat watchdog: a dead backend behind the dev proxy leaves the request hanging without an error, so silence — not just a socket error — must trigger reconnect. On every reconnect the list is refetched to pick up payments missed while offline.
- The store never receives employee wallet balances: `ReceiptLine.remainingAfter` is stripped from both the SSE payload and `GET /api/store/payments`.

### Store panel pages

Two pages under a shared shell (`pages/shell`) that owns the header + nav:

- **فروش‌ها** (`/payments`) — «آخرین پرداخت‌ها» is a table of receipts the seller has **not yet confirmed** (no store name: it's the store's own panel). Each row has «تأیید» → `POST /api/store/payments/:id/confirm` sets `Payment.storeConfirmedAt` (server-side, idempotent), so a confirmed row never comes back after refresh or on another device. `GET /api/store/payments` returns only unconfirmed rows; stats and «گزارش پرداخت‌ها» still count every payment. Live receipts over SSE are prepended to the table. Plus sales figures from `GET /api/store/stats`. That endpoint aggregates **server-side** with day boundaries in **Asia/Tehran**; the panel used to sum "today" from the 50-row `recent()` window, which silently under-reported exactly on the busiest days, and a UTC boundary would have pushed after-midnight sales into yesterday. A receipt arriving over SSE optimistically bumps the figures so the seller sees the sale they just made.
- **کد QR** (`/qr`) — the seller's own till QR. Rendered client-side from `SANPAY:S:<code>` with `qrcode` (dynamically imported to stay out of the sales-page bundle; error-correction **H**, because a label sits on a counter for months and picks up scuffs). Offers **download PNG** and **print** so it can be physically placed on the till, and prints the code as text as the manual-entry fallback. The print stylesheet hides everything except `.printable`.

- **تغییر رمز** (`/account`) — first change (`Store.passwordChangedAt = null`, i.e. still the password the admin gave) uses the current password: `POST /api/store/auth/change-password`. After that every change needs an SMS code to the store's mobile: `POST /api/store/auth/change-password/otp` then `/verify` (`StorePasswordService`; 6 digits, 2 min, resend after 60 s, 5 attempts, HMAC-hashed in `StorePasswordOtp`, void if `Store.phone` changes). sms.ir template 403664 (parameter `CODE`; `SMSIR_STORE_PASSWORD_OTP_TEMPLATE_ID` overrides it). `Store.phone` is free text, so only a normalised Iranian mobile gets a code. Every change, including an admin reset from the dashboard, sets `sessionsValidAfter`, and `StoreJwtGuard` rejects older tokens; the change response carries a fresh token for the current device. An admin reset sets `passwordChangedAt` back to null, so the next change uses the current password again. Tests: `api:test-store-password`.

## Design system (important — user-approved, do not regress)

- **"SANPAY blue", taken from the logo** (blue `#0E4C94`, red gear `#DE2128`, grey gear `#666767`). Light-first, Apple-HIG-informed (redesigned with the `apple-design` skill). Dark mode is opt-in via the `.dark` class only — never default to dark and never follow OS preference.
  - **Logo blue** (`--brand`) is the one accent colour: primary actions, the selected tab, focus, links. Used judiciously, not on every control.
  - **Ink** (`--ink-900…--ink-300`) is the structural dark, re-hued to the logo blue: the hero/summary cards read as the logo's own S-frame.
  - **Gold** (`--gold-600…--gold-100`) still means **value** — the default progress fill and money highlights on ink.
  - **Logo red is not a UI accent.** In a money app red already means spent/error; it lives in the logo and as `--destructive` only. **Logo grey** is the neutral scale (`--muted-foreground` `#5E6470`).
  - **Emerald/red/amber are semantic only**, never decoration: `--pos/-fg/-bg` (available), `--neg-fg/-bg` (spent, over limit), `--warn-fg/-bg` (scarcity).
  - Canvas is the iOS-style grouped background `#F2F4F7`; cards are **opaque white** with `--radius-lg` (22px) corners, controls keep `--radius` (14px).
- ⚠ **Gold is not a text colour on light surfaces** — `--gold-500` on white is ~2.1:1. Use it for fills, bars and icons; for gold _text_ you must be on ink, where `--gold-300` reaches ~8:1. Blue + gold are near-complementary, so **never blur or blend gold over an ink card** — it goes olive (the store hero's gold glow did exactly that and was removed). Text on light uses `--foreground` / `--muted-foreground` / `--pos-fg` / `--neg-fg` / `--warn-fg`.
- **Never gradient between two near-complementary hues.** The old violet→emerald hero passed through a desaturated grey-teal at its midpoint — that muddy band was the single most "cheap-looking" thing in the app. Every gradient now stays inside one ramp (ink→ink, gold→gold).
- **Blur is for floating layers only** (the app bar, the floating capsule tab bar, dialogs, popovers, menus, sheets — HIG `materials.md`: the functional layer floats over content), not cards. Bars use `--bar-material`. No ambient background glow and no coloured shadow under primary buttons: a prominent button is a flat fill of the accent. A card sits in the scroll flow over a known background, so blur bought nothing while costing a filter per list row. Cards are opaque + `--hairline` border + `--elev-1`; the hairline is what actually gives an edge on light surfaces.

### Motion

Motion is for orientation and feedback, not decoration. Only `opacity` / `transform` / `scale` animate, and every animation has a `prefers-reduced-motion` off-switch next to it.

- **Tokens + shared classes** live in `glass.css`: `--ease-out`, `--ease-spring`, `--dur-fast|base|slow`; `.sanpay-rise` (rise-in, staggered by a `--i` custom property, capped at 8), `.sanpay-fade`, `.sanpay-fill` (progress bar grows from the right edge, since the app is RTL). For list rows use Angular's native `animate.enter="sanpay-rise" [style.--i]="$index"`, which needs no `@angular/animations`.
- **Page transitions:** `withViewTransitions()` in the employee app's router. The app bar and tab bar have their own `view-transition-name`, so they stay put instead of fading with the page.
- **Press feedback** uses the independent `scale` property, never `transform`, because spartan's own `active:translate-y-px` owns `transform`.
- **Employee-app-only motion** (tab pop, wallet carousel depth, QR scan line, payment-success check draw, the pulsing live dot) is in `apps/app/src/styles.css`, keyed off `data-slot`s.
- **The receipt screen is "live" on purpose.** It has a pulsing dot plus a «پرداخت N ثانیه پیش» counter that ticks from the phone's own clock, so the cashier can tell a real, just-issued receipt from a screenshot of an old one. This partly offsets the trade-off described under _Purchase flow_.
- **Don't use scroll-driven animations (`animation-timeline: view()`) in the RTL carousel.** Chromium computes view timelines wrongly in an RTL scroller: the fully visible card reported 10% progress, so the effect came out inverted. The carousel's depth effect is driven by `data-active` from `activeWalletIndex` instead.
- The count-up on wallet balances is `CountUp` (`apps/app/src/app/core/motion/count-up.ts`). Pass it an arrow-function formatter (`[countUpFormat]="toman"`), because a method reference would lose `this`.

### One brand for all three apps — "override the brand, never the scale"

`glass.css` owns the **scale** (ink ramp, elevation, radius, spacing, semantics, the category spectrum) **and** the brand. Since the logo change all three apps (`app`, `dashboard`, `store`) share the logo blue; they no longer override it (the old teal / indigo / green per-app brands are gone — a single logo means a single identity). The override mechanism is kept: an app may still set `--brand` / `--brand-fg` / `--brand-soft` in its own `styles.css` _after_ the import.

`--primary`, `--ring`, `--secondary`, `--accent` and every sidebar token are **derived** from `--brand` with `var()`, so one override repaints the app. Do not hardcode `--primary` in an app, and do not override the scale.

Brand contrast: 8.47:1 on white, 7.68:1 on the canvas, 7.31:1 on `--brand-soft`; dark `#8CB8F2` is 9.0:1 on the dark canvas (measured).

### The category spectrum (`--cat-*`)

With the blue brand, `sport` moved from sky-blue to teal and `grocery` from emerald to lime, so neither collides with the brand or with `--pos`.

Six wallet categories — `food, grocery, sport, health, travel, gift` (the exact `icon` values the API sends) — each get a `-fg` (AA-safe text/icon on light), `-bg` (tint for the icon chip) and a solid (progress fill). **This is the only place free colour is allowed, and the justification is functional, not decorative:** the home screen is a list of five or six wallets that were previously identical grey boxes, so finding «ورزش» meant reading every title.

Every `-fg` clears 4.5:1 on both its own tint and white (4.58–7.10, measured; lime grocery 4.59 on its tint). An unknown `icon` falls back to ink rather than a random hue, so a new category can't silently borrow another's colour. `hlm-progress` accepts a per-call `--progress-color`; unset, it stays gold.

- **Don't stack padding on `hlm-card`.** The card frame already applies `py-(--card-spacing)`; adding `py-*` to the content div doubles it (64px of padding around 129px of content, measured). Let the card own vertical padding.
- Single source of truth: `shared/ui/theme/glass.css` (imported by both apps) + `design-system/sanpay/MASTER.md`.
- Style spartan components via CSS variables and `[data-slot=…]` overrides in `glass.css`. **Never hand-edit generated files under `shared/ui/*`** — they must stay regeneratable via `nx g @spartan-ng/cli:ui <name>` (config in `components.json`).
- Backdrop blur only on elevated surfaces (cards, dialogs, menus, sheets…), not inputs/rows. Keep the `prefers-reduced-transparency` / `prefers-reduced-motion` fallbacks. Text contrast ≥ 4.5:1. SVG icons only, no emoji.
- Do NOT use `background-attachment: fixed` — it blanks/janks Chromium on scroll; if a page backdrop ever returns, put it on a fixed `body::before`.
- Use the `ui-ux-pro-max` skill (global, `~/.agents/skills/ui-ux-pro-max`) for style/palette/UX decisions, and the `spartan` skill + `spartan-ui` MCP server (`.mcp.json`) for component APIs.

### Spartan first — no native form controls

**Before adding any UI, check what spartan already ships for it.** Never use a native `<select>`, `<input type="date">`, `<input type="number">`, or a hand-rolled `<input class="border-input bg-background h-10 …">`. Every one of those existed in the app once and has been migrated:

| Need                                                                        | Use                                                                                                                                                            | Not                                                              |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Text/password/tel input                                                     | `hlmInput` inside `<hlm-field>` + `hlmFieldLabel`                                                                                                              | bare `<input>` + copy-pasted Tailwind                            |
| Input with a unit, icon or inline button                                    | `hlm-input-group` + `hlm-input-group-addon` / `-text` / `-button`                                                                                              | a sibling `<span>` next to the input                             |
| Choice from a list                                                          | `hlm-select` (+ `[itemToString]` so the trigger shows a label, not the raw value)                                                                              | native `<select>`                                                |
| 2–7 exclusive options                                                       | `hlm-toggle-group` + `hlmToggleGroupItem`                                                                                                                      | a row of `hlmBtn` with a `variant` ternary                       |
| Date                                                                        | `hlm-date-picker` + `hlm-date-picker-trigger`                                                                                                                  | `<input type="date">`                                            |
| Counter (e.g. تعداد شب)                                                     | `hlm-input-group` with −/+ `hlmInputGroupButton`s                                                                                                              | `<input type="number">`                                          |
| Error message                                                               | `hlmAlert variant="destructive"`                                                                                                                               | a bare `<p class="text-destructive">`                            |
| Confirmation / modal in the **employee app** (`apps/app`, `libs/applets/*`) | `hlm-sheet side="bottom"` — a bottom sheet, never a centred modal                                                                                              | `hlm-dialog`, `hlm-alert-dialog`, `window.confirm()`             |
| Confirmation in the **dashboard / store panel**                             | `hlm-alert-dialog`                                                                                                                                             | `window.confirm()` — **never** a native browser dialog, anywhere |
| Money amount                                                                | `<input hlmInput [(sanpayAmount)]="…">` (`@sanpay/forms`; model = bare Latin digits, input shows `50٬000`) — **not** on national code / phone / personnel code | `[value]` + `(input)` with hand-rolled digit parsing             |
| Confirm before an irreversible action                                       | `hlm-alert-dialog`                                                                                                                                             | `confirm()`                                                      |

Control sizing, focus rings, badge/progress/tabs/skeleton/toggle styling all live in `glass.css` — style there via `[data-slot=…]`, never per call site. Spartan ships form controls at `h-8` and buttons at `h-8`/`h-7`; `glass.css` raises them to a 44px touch target for this mobile-first app.

Prefer a component's own inputs over CSS when one exists — e.g. `hlm-toggle-group [spacing]="2"` gives separate pills, where the default `spacing=0` builds a joined segmented bar. Fighting that in CSS produces the wrong shape.

#### The `glass.css` overrides are deliberately UNLAYERED

**Do not wrap the component overrides in `@layer components` (or any layer).** Tailwind v4 imports `tailwindcss/utilities.css` _without_ a `layer()`, so every spartan utility is unlayered — and unlayered rules beat every layered rule regardless of specificity. A rule inside `@layer components` therefore loses to `data-[state=on]:bg-muted` no matter how specific you make the selector, and no `:root` prefix or extra attribute will save it. This is exactly how the selected toggle ended up as white text on a 5% grey fill (~1.1:1 contrast).

Being unlayered and imported _after_ utilities in each app's `styles.css`, the overrides win on source order. The trade-off is that a call-site utility can no longer override a property set in `glass.css`: put component-wide concerns in the theme file, and keep call sites to layout (width, alignment, spacing).

When verifying CSS changes, confirm the browser is not on a cached stylesheet (check the `<link>` hash) — and note the dev server may need a reload to pick up `shared/ui` edits.

#### Styling a spartan primitive: check what actually renders a box

Several hlm hosts are `display: contents` and paint nothing — `hlm-checkbox` is one. A `border`/`background` on `[data-slot='checkbox']` computes fine in devtools and is invisible on screen; the real box is the `button` inside (`[data-slot='checkbox'] button`). Before writing an override, inspect the rendered subtree and target the element that has the box, then scope to `:not([data-state='checked'])` so spartan keeps owning the checked look.

Same shape of trap in `hlm-calendar`: its inner wrapper is `inline-flex`, so `w-full` on the table can't widen anything until that wrapper is opened up. Widen _only_ that wrapper — forcing `display: flex`/`width` on the calendar host or the cells stretches row heights and turns the days into giant squares.

#### The date-picker popover width

`hlm-date-picker`'s popover is `w-fit` and comes out narrower than its own field. `brn-popover` has no trigger-width plumbing (unlike `brn-select`'s `updateTriggerWidth`), and the content lives in a CDK overlay, so CSS alone cannot know the width. `SanpayDatePickerWidth` (`@sanpay/dates`) publishes the trigger width to `--sanpay-date-picker-width` and `glass.css` applies it to `.cdk-overlay-pane:has([data-slot='calendar'])`. Add the directive to every new `<hlm-date-picker>`. It is a `min-width` clamped to 24rem — the ask is "not narrower than the input", and an unclamped 640px-wide field would otherwise produce an absurd calendar.

#### `NG0203` on a spartan primitive used only from a lazy route

`@spartan-ng/brain` entrypoints reached only from a lazily-loaded route get prebundled by vite in a _second_ optimizer pass, which drags in a second copy of `@angular/core`; a `providedIn: 'root'` service from brain (e.g. `BrnDialogService`) is then missing from the root injector the app is actually using, and you get `NG0203`. It survives a full `.angular/cache` wipe, so it is not staleness. The dashboard's `serve` target sets `"prebundle": { "exclude": ["@spartan-ng/brain"] }` to fix it. Production builds were never affected. Note the schema has `additionalProperties: false`, so no `"//"` comment key inside that object.

### Jalali dates

`@spartan-ng/brain` ships `BrnJalaliDateAdapter` + `JalaliDate` — **do not write a date adapter.** `providePersianDates()` (`shared/dates`, imported as `@sanpay/dates`) is installed in the `app.config.ts` of both the employee app and the dashboard and wires the adapter, Persian month/weekday labels, week-starts-Saturday, and Persian-digit formatting. Because it is a root provider, every applet's `hlm-calendar` / `hlm-date-picker` gets it without depending on the app.

The API and هتل‌یار speak Gregorian `YYYY-MM-DD`; `JalaliDate` exists only at the display boundary. Convert with `isoToJalali` / `jalaliToIso` from `@sanpay/dates` (the tourism applet still has its own copy in `libs/applets/tourism/src/lib/format.ts`).

**Solved by the font:** the day numbers _inside_ the calendar grid used to render Latin (`13`, not `۱۳`) — `hlm-calendar` interpolates `_dateAdapter.getDate(date)` directly and `BrnCalendarI18n` has no `formatDay` hook, so no code fix was possible without editing a generated file. Switching the app font to **Vazirmatn FD** fixed it everywhere at once (see Persian/RTL conventions below). Don't reintroduce a string-level digit converter for this.

## Module boundaries & lint tags

Every project is tagged so `@nx/enforce-module-boundaries` (depConstraints in the root `eslint.config.mjs`) can work — untagged projects fail lint outright.

| Project                                                                          | Tags                            |
| -------------------------------------------------------------------------------- | ------------------------------- |
| `apps/app`                                                                       | `type:app`, `scope:employee`    |
| `apps/store`                                                                     | `type:app`, `scope:store`       |
| `apps/dashboard`                                                                 | `type:app`, `scope:admin`       |
| `apps/api`                                                                       | `type:app`, `scope:api`         |
| `shared/models`, `shared/dates`, `shared/forms`, `shared/receipt`, `shared/ui/*` | `type:lib`, `scope:shared`      |
| `libs/applets/*`                                                                 | `type:applet`, `scope:employee` |

Apps depend on applets + libs (never on each other); applets depend on applets + libs; plain libs depend on libs only. Each app reaches its own scope plus `scope:shared`. **Any new project needs tags** — pick the app's scope, `type:applet` + the owning app's scope for an applet, or `type:lib` + `scope:shared` for shared code.

Two lint rules are turned off for the generated spartan libs in the hand-owned `shared/ui/eslint.overrides.mjs`, which each `shared/ui/*/eslint.config.mjs` spreads **last** (a root-level override can't win: the generated lib configs spread the root config first, and in flat config the last match wins):

- `@nx/dependency-checks` — the generator emits identical `peerDependencies` regardless of what a component imports, so fixing it would mean hand-editing generated `package.json` files.
- `@angular-eslint/component-selector`, scoped to `hlm-carousel-next.ts` / `hlm-carousel-previous.ts` — generated source uses attribute selectors on a host element (`button[hlmCarouselNext]`).

**After `nx g @spartan-ng/cli:ui <name>`** the regenerated component's `project.json` and `eslint.config.mjs` are overwritten, dropping its `tags` and its `...uiOverrides` spread. Re-add both, then re-run `pnpm nx run-many -t lint`.

## Applets (`libs/applets/*`)

Employee-app features live as **applets**, not as pages inside `apps/app`. An applet is an Angular library that owns its routes, pages and data-access service; the app mounts it lazily and knows nothing about its internals:

```ts
// apps/app/src/app/app.routes.ts
{ path: 'tourism', loadChildren: () => import('@sanpay/applets/tourism').then((m) => m.tourismRoutes) }
```

- Each applet exports its `Route[]` (plus any service the host needs) from `src/index.ts`; the path alias is `@sanpay/applets/<name>` in `tsconfig.base.json`.
- Tag every applet `type:applet` + the owning app's scope (`scope:employee`). Applets may use other applets and `type:lib` libs; the app may use applets and libs.
- Existing applets: `auth` (`AuthService` + `authGuard` + `authInterceptor` — moved out of `apps/app/src/app/core/auth` so applets can use it), `wallet` (`WalletService`, used by the home page), `stores` (فروشگاه‌ها tab), `profile` (پروفایل tab), `tourism` (hotel booking) and `upg` (the payment page every purchase goes through — see **UPG** above). New employee features should be added as applets, and remaining `apps/app/src/app/pages/*` should migrate there as they are touched.
- The **stores tab** (`GET /api/stores`) derives from the employee's wallets, not the store list: it starts from active, unexpired allocations with a positive balance — the same rule as `checkout` — so a store the employee has no credit for never appears. Its «پرداخت» button deep-links to `/qr?store=<code>`, which `PayPage` reads from the query param and skips scanning.
- The **profile tab** (`GET /api/profile/summary`, `GET /api/profile/payments`, `PATCH /api/auth/me`, `POST /api/auth/change-password`) covers identity, credit summary, purchase history, phone edit (the only self-editable field), password change and a static FAQ. The FAQ deliberately has no phone number — واحد رفاه's real contact details have not been given to us yet.
- Applet routes navigate with absolute paths (`/tourism/...`), so an applet is currently tied to the prefix the app mounts it at.

### Tourism applet + هتل‌یار (WorldGDS)

Employees book hotels with a **`TOURISM` wallet** — hotels are _not_ stores and never appear in the QR/store flow. A `TOURISM` `WalletDefinition` has no `WalletDefinitionStore` rows; `TourismService` rejects any other wallet kind.

- Upstream is the هتل‌یار / WorldGDS API (spec: `~/Downloads/GDS Document V6.3.pdf`, Postman collection in `~/Downloads/GDS-Demo.postman_collection.json`). Everything is POST with `sessionId` **in the body** and `APIKEY` in the header; **errors come back with HTTP 200** and `status: false`, so `status` must be checked, not the status code. Most numbers arrive as strings — normalized in `hotelyar.mapper.ts`. **Prices are rial** (search, book `hotelPrice`, webhook `totalHotelPrice`/`totalReturnToCustomer`) and are converted to toman with `rialToToman` (`providers/money.ts`) at that boundary, same as اقامت۲۴; the mock emits rial too.
- `GdsClient` (abstract, `apps/api/src/app/tourism/gds/gds.types.ts`) has two implementations: `GdsHttpClient` (real; caches the session — `expiredTime` from `login` when it is shorter than an hour, else an hour — and retries once on error 1104/1107) and `GdsMockClient`. **`GDS_MODE=live` selects the real client; anything else (including an unset variable) falls back to the mock**, so a half-filled `.env` never half-connects to هتل‌یار. Demo credentials for `https://apidemo.worldgds.com` are in place — copy `.env.example` to `.env`, fill `GDS_API_KEY` / `GDS_USERNAME` / `GDS_PASSWORD`, and verify with `pnpm gds:check` (login → getCity → getHotel → searchHotel, no booking). The demo host is reachable from Iran only. **`searchHotel` needs `hotelCapacityType` in the body even though the v6.3 spec and the Postman collection never mention it** — without it every search comes back `status: true` with an empty array, which looked for a long time like the demo account simply had no capacity. See the comment on `GdsHttpClient.searchHotel` for the measured semantics. Mock images are inline SVG data URIs on purpose: external CDNs are unreliable in Iran. Mock hotel `362` returns `Pending` (offline capacity) and its room `9802` is full, so both paths stay testable.
- **Second provider — اقامت۲۴ / GRS** (`providers/eghamat24/`, spec: GRS Agency API v1.18.4). Auth is a fixed `Client-Token` header (no login, no session); prices are **rial**, converted in `eghamat24.mapper.ts`; an inventory error still comes back as **HTTP 200** with only `errors[]` filled, so both must be checked. `GRS_MODE=live` picks `GrsHttpClient` (needs `GRS_URL` + `GRS_CLIENT_TOKEN` or `GRS_CLIENT_TOKEN_BASE64`), anything else falls back to `GrsMockClient` — same contract as `GDS_MODE`. Test hosts are **reachable from Iran only**. Verify with `pnpm nx run api:check-eghamat24` (read-only) and `api:test-eghamat24`. Environments, support contact and API notes: `docs/eghamat24.md`.
- **Booking order (with UPG):** validate → write `HotelBooking` as `AWAITING_PAYMENT` + UPG intent → UPG collects the money → `fulfillBooking` re-quotes and reserves at the provider → any failure throws and UPG refunds everything. See **UPG** above for why this flipped from the old «book, then debit».
- **Hotel list:** with a city picked, the list comes from the dated availability search (`POST /api/tourism/search` → هتل‌یار `searchHotel` / اقامت۲۴ `suggestion`), whose own responses carry the card fields (stars, address, photo) — only hotels with a free room, cheapest first, with «از … ریال». «همهٔ شهرها» shows the undated catalog; the API rejects a dated search with neither `cityId` nor `hotelId`. `pnpm gds:check` / `api:check-eghamat24` print those fields from the live search.
- `statusCode: '1'` → `CONFIRMED` (online capacity), `'0'` → `PENDING` (offline; هتل‌یار confirms later via webhook).
- **City picker is a bottom sheet** (`ui/city-picker.ts`), not `hlm-combobox`: the combobox popover auto-focuses its search input, so on iPhone the keyboard covered the 288px list and a drag scrolled the page behind it. Avoid `hlm-combobox` for long lists in the employee app. Search pickers pin their height with `min-h-[85dvh] max-h-[85dvh]` so the sheet doesn't jump while typing; `h-[…]` loses to spartan's `data-[side=bottom]:h-auto`. On screens ≥550px, bottom sheets are capped to the 550px app column and centred (`apps/app/src/styles.css`).
- **اقامت۲۴ sends later pages as numeric-keyed objects** (`{"100": …}`, PHP `json_encode` of a sliced array); `rows()` in `grs-http.client.ts` accepts both. Its `/v1/suggestion` items carry only id, name and rooms — star, type, address and photo come from the city's cached property catalog.
- **List filters** open in a bottom sheet (`ui/filter-sheet.ts`). **Hotel list: paginated and filtered server-side** — `POST /api/tourism/hotels/page` (20 cards per page, no room list; production هتل‌یار made the full result ~1 MB, 97% rooms). The full provider result is cached in memory for 5 min per (city, checkin, nights, capacity), so paging and filter changes never re-hit a provider; `quote` always re-prices. The filter logic is shared, in `@sanpay/models` (`hotel-filters.ts`), and facets (types, price bounds, max capacity) come from the whole result, not the page. Room-level filters (price, breakfast, capacity, discount) match **per room**, and «از …» is the cheapest _matching_ room. Hotel types are keyed with ZWNJ/space folded, because the two providers spell «بوم‌گردی» differently. The next page loads via `@defer (on viewport)` around `ui/load-more.ts`. **Flight results** are still filtered client-side (`pages/flight-filters.ts`).

### Webhook receiver (`POST /api/tourism/webhook`)

هتل‌یار posts every reservation change to an address we register with them (spec section 14). `TourismWebhookController` + `TourismWebhookService` handle it; it is the **only** tourism endpoint without employee JWT.

- **Auth** is a shared secret **in the URL we register with them** — `POST /api/tourism/webhook/<GDS_WEBHOOK_SECRET>` — because هتل‌یار only takes an address and offers no way to set a custom header. `?token=…`, `X-Webhook-Token` and `Authorization: Bearer …` are accepted as fallbacks on the secret-less path. Compared timing-safely in `GdsWebhookGuard`. The trade-off is that the secret lands in access logs: suppress path/query logging for this route in the reverse proxy, and rotating the secret means re-registering the URL. `GDS_WEBHOOK_SECRET` in `.env`; if it is unset the endpoint is closed — except under `GDS_MODE=mock`, where it stays open for local testing and logs a warning.
- Three actions: `reserve` → `CONFIRMED`; `reserve_reject` → `REJECTED` + full refund; `change` → cancellation (`report.changesLog[].detail.changes[].operation === 1`) means `CANCELED` + refund of `totalReturnToCustomer` only — the cancellation penalty stays in `payable` as our debt to هتل‌یار. A non-cancel `change` only updates `payable`; it never moves employee money without a human.
- **Idempotency**: every event is stored in `GdsWebhookEvent`, unique on `(action, reservationId, changeId)`. Only a _successfully processed_ event is skipped as a duplicate — a failed one is deliberately reprocessed, since هتل‌یار retries whatever does not get a 200. The refund itself is additionally guarded by `HotelBooking.refundedAmount` being non-null.
- Matching is by `gdsReserveId`, falling back to `report.externalId` (= our `referenceNo`) for bookings whose GDS id never got written. An event with no matching booking is archived with an error and still answered 200 — endless retries for a payload we cannot act on help no one; the raw body is there for manual review.
- A late `reserve` for an already `REJECTED`/`CANCELED` booking is ignored: final status and the refund must not roll back.
- **Not** implemented: no request-body signature (هتل‌یار sends none) and no re-poll of `report` to reconcile events lost while the API was down.
- Settlement runs at 02:00 Asia/Tehran through Toman Corporate Banking. Store payments are grouped per store; hotel bookings are grouped per provider (هتل‌یار / اقامت۲۴). See `docs/tomanpay/corporate-banking-integration.md`.

## Dashboard (`apps/dashboard`)

Persian/RTL admin panel for واحد رفاه, served at **6300** (dev-server proxies `/api` to `localhost:6500`, same as the app). **Full page width by design:** the shell is a fixed 64-wide sidebar plus a `flex-1` main with no `max-w` — wide tables are the point. Wide tables scroll inside `[data-slot=table-container]`, so the page body never scrolls horizontally (rules live in `apps/dashboard/src/styles.css`).

- Auth is a third, separate identity: `Admin` model, `POST /api/admin/auth/login` (username/password), token carries `role: 'admin'` + `scope` (the admin's role). `JwtAuthGuard` (employee) rejects it because it has no `nationalCode`, `StoreJwtGuard` because `role !== 'store'`. Seed admin: `admin` / `admin1234`.
- Roles: `SUPER_ADMIN` (also manages dashboard users), `ADMIN`, `VIEWER`. **A super admin is not a dashboard user:** `GET /api/admin/admins` hides it, and update / reset-password answer 404 for it, and no create/update can grant `SUPER_ADMIN` — it is made only with `pnpm admin:create-super` on the server and changes its own password via `change-password`. Production once lost every login when the super admin deactivated the other admin and then itself. (**read-only** — enforced server-side by `@Roles(...WRITE_ROLES)` on every writing route, and mirrored in the UI by `AdminAuthService.canWrite`). Never rely on the UI check alone.
- Pages: نمای کلی (stats + 14-day chart + top stores), کارمندان (+ per-employee file: allocations, cap/expiry edit, manual refund, password reset), کیف‌پول‌ها (definitions, store links, bulk allocation), فروشگاه‌ها (CRUD + QR code + panel password), پرداخت‌ها, پرداخت‌های درگاه + بررسی دستی درگاه + درگاه‌ها (UPG — see above), تسویه‌ها, رزرو هتل, رزرو پرواز, کاربران داشبورد, تنظیمات.
- **تسویه‌ها** is one table of transfers (one `SettlementItem` per row, with its batch `runKey`), from `GET /api/admin/settlements/items` — filtered (status, beneficiary type, text over name / follow-up code / tracker / runKey, `from`/`to` as `YYYY-MM-DD` whole **Asia/Tehran** days) and paginated server-side, with `sumAmount` over every filtered row. That route is declared before `GET :id` so «items» is not read as a batch id. «تلاش مجدد» shows only on a `FAILED` row without a retry yet (`retried`); «استعلام وضعیت» on a non-final row reconciles its batch.
- **File downloads (xlsx) must return `StreamableFile`** (`xlsxFile()` in `admin.controller.ts`), never a raw `Buffer`: Nest's Express adapter `res.json()`s any object, so a returned Buffer arrives as `{"type":"Buffer","data":[…]}` and Excel refuses the file (measured). Excel exports cover every filtered row (no pagination) and end with a «جمع کل» row.
- **Printing a report** = only its table, every filtered page, plus a grand total: the page fetches all pages (200 at a time) into a `.print-sheet` element and calls `printSheet()` (`core/print-sheet.ts`), which moves it under `<body>` for the print; `styles.css` hides every other body child. Don't use `visibility` + `position: absolute` for this — a long table then prints only one sheet of paper. `GET /api/admin/payments` returns `sumAmount` over all filtered pages.
- Money edits are guarded server-side: a cap can never drop below `spent`, and a manual adjustment writes a `Transaction` (`REFUND`/`ADJUSTMENT`) so the change is traceable rather than a silent `spent` edit.
- Bulk allocation updates an employee's existing active allocation instead of stacking a second one; an employee whose `spent` already exceeds the new cap is **skipped** and counted in the result, not clamped.
- **Allocation from the wallets page lives in a modal**, with a «گروهی / فردی» toggle. «فردی» picks one employee via `hlm-autocomplete` (server search scoped to the wallet's company) and sends `employeeIds: [id]` to the same endpoint, so it gets the same rules; a `skipped` result is shown as "cap below spent". `POST /api/admin/employees/:id/allocations` (employee page) follows the same update-not-stack rule. Group modes on `POST /api/admin/wallet-definitions/bulk-allocate`: without `entries`, one `cap`/`expiresAt` for every active employee; with `entries` (from an uploaded CSV/XLSX of _کد ملی، سقف، تاریخ انقضای جلالی_), only those employees, each with its own values. National codes with no matching employee come back in `result.notFound` rather than failing silently. Parsing is client-side in `apps/dashboard/src/app/core/allocation-file.ts` — Jalali→Gregorian happens there because the API only speaks `YYYY-MM-DD`; `read-excel-file/browser` is imported dynamically to keep it out of the initial bundle.
- Wallet `defaultCap` left empty means **unlimited** (`null`), so the update DTO must accept an explicit `null` to clear a previous cap — `undefined` means "don't touch".
- **One `TOURISM` wallet per company** (inactive ones count — reactivate rather than create a second). Enforced in `AdminWalletsService` (`assertNoOtherTourism`, 409) on create and on any update that makes a definition TOURISM or moves it to another company; the dashboard form disables the option and blocks save. The employee app relies on it: hotel/flight checkout has no wallet picker and debits `wallets[0]`. Service-level only — Prisma has no partial unique index, so two simultaneous creates could still race.
- The kind picker offers only `CREDIT` and `TOURISM`. `RATION` still exists in the schema and in old rows (and keeps its label), but is no longer offered for new wallets.

- **Deleting a wallet** («حذف» on کیف‌پول‌ها) is **SUPER_ADMIN only** (`@Roles('SUPER_ADMIN')` on `GET admin/wallet-definitions/:id/deletion-preview` and `DELETE admin/wallet-definitions/:id`; the button shows only for `isSuperAdmin`). A wallet with no history (no transactions, purchase codes, bookings, or payment intents naming its allocations) is erased. Otherwise it is **archived**: `deletedAt`/`deletedById`/`deletedNote`, `isActive=false`, every allocation deactivated, history and reports untouched. Archived wallets are hidden from the dashboard list and the employee app, can't be edited, reactivated or charged, and don't block a new tourism wallet. The confirm dialog shows the unspent credit employees lose and needs a note. Tests: `api:test-wallet-delete`.

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

- **File uploads (profile photos)** — `AvatarService` (`apps/api/src/app/avatars/`). The upload is never stored as received: `sharp` decodes it (so the type comes from the content, not the extension/Content-Type), applies EXIF orientation, crops to 512² and writes a fresh WebP, which carries no metadata (GPS from phone photos is dropped). JPEG/PNG/WebP only, 2 MB (multer limit + client check), `limitInputPixels` against decompression bombs. Files live in `UPLOADS_DIR/avatars` (prod: the `api_uploads` volume at `/app/data/uploads`) under a random 128-bit name stored in `Employee.avatarFile`, and are served **without auth** at `GET /api/avatars/<name>.webp` because `<img>` can't send the JWT — the unguessable name is the access control; a new upload gets a new name, so the response is `immutable`. Endpoints: `POST/DELETE /api/profile/avatar` (employee) and `POST/DELETE /api/admin/employees/:id/avatar` (`WRITE_ROLES`). Both nginx configs set `client_max_body_size 3m` (default is 1 MB). `sharp` is in `onlyBuiltDependencies`.

- Prisma 7 layout: config in `prisma.config.ts` (root), schema in `apps/api/prisma/schema.prisma` (datasource has **no `url`** — it lives in the config), client generated to `apps/api/src/generated/prisma` (gitignored; run `pnpm prisma:generate` after schema changes).
- Runtime connection uses the `@prisma/adapter-pg` driver adapter inside `PrismaService` (`apps/api/src/app/prisma/`), a `@Global()` module. `DATABASE_URL` comes from `.env` (gitignored).
- Scripts: `pnpm prisma:generate | prisma:migrate | prisma:studio`.

## Commands

**The package manager is pnpm** (pinned by `packageManager` in `package.json`; there is no `package-lock.json`). Install with `pnpm install`, run everything through `pnpm` / `pnpm nx` — never `npm install`, which would create a second lockfile and a hoisted `node_modules` that hides missing dependencies.

pnpm 10 refuses to run a dependency's install scripts unless it is listed under `onlyBuiltDependencies` in **`pnpm-workspace.yaml`**. Every entry there needs its postinstall to fetch or compile a native binary (nx, prisma, esbuild, swc, bcrypt, lmdb…), so a new dependency that ships one must be added to that list — pnpm prints an "Ignored build scripts" warning naming it, and `pnpm rebuild` runs the scripts for already-installed packages.

```bash
pnpm install             # install deps (--frozen-lockfile in CI)
pnpm nx serve app        # employee app  → http://localhost:6200
pnpm nx serve dashboard  # dashboard     → http://localhost:6300
pnpm nx serve store      # store panel   → http://localhost:6400  (demo: olympic / store1234)
pnpm nx serve api        # NestJS API    → http://localhost:6500/api
pnpm serve               # run all four apps in parallel, on the ports above
pnpm nx run-many -t build test lint
pnpm nx g @spartan-ng/cli:ui <name>   # add/regen a spartan primitive
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
