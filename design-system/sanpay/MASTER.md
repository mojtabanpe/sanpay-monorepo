# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** sanpay
**Generated:** 2026-07-18 17:24:50
**Category:** SaaS (General)

---

## Global Rules

### Color Palette — "SANPAY blue" (from the logo, 2026-09)

Authoritative values live in `shared/ui/theme/glass.css`; this table mirrors them.
Source logo: blue `#0E4C94`, red gear `#DE2128`, grey gear `#666767`.

| Role | Light | Dark | CSS variable | Contrast |
|------|-------|------|--------------|----------|
| Brand / primary (logo blue) | `#0E4C94` | `#8CB8F2` | `--brand` → `--primary` | 8.47:1 on white · 9.0:1 on dark canvas |
| On brand | `#FFFFFF` | `#0B1422` | `--brand-fg` | 8.47:1 · 9.0:1 |
| Brand tint | `#E8EFF8` | brand @16% | `--brand-soft` | brand on it 7.31:1 |
| Canvas (grouped bg) | `#F2F4F7` | `#0B1422` | `--background` | brand on it 7.68:1 |
| Card | `#FFFFFF` | `#151E2E` | `--card` | — |
| Text | `#0D1626` | `#EEF2F8` | `--foreground` | — |
| Secondary text (logo grey) | `#5E6470` | `#A1A8B3` | `--muted-foreground` | 5.39:1 on canvas · 7.7:1 |
| Destructive (logo red) | `#DE2128` | `#F97066` | `--destructive` | 4.82:1 on white |
| Value (gold) | `#D4A017` | same | `--gold-*` | fills only on light; text only on ink |
| Structural dark (ink, logo-blue hue) | `#071A33`→`#0E3F7A` | same | `--ink-900…600` | hero cards |

**Rules**
- One accent colour: logo blue, shared by all three apps (app, dashboard, store). Used for primary actions, the selected tab, focus and links — not spread over every control (HIG `branding.md`).
- Logo red is **not** a UI accent: in a money app red already means "spent / error" (HIG `color.md`: don't use one colour for two meanings). It appears only in the logo and as `--destructive`.
- Category spectrum changed with the blue brand: `sport` sky-blue → teal (`#0F766E`), `grocery` emerald → lime (`#4D7C0F`), so neither collides with the brand or with `--pos`.
- Material (blur) only on the floating functional layer: app bar, floating tab bar, sheets, menus. Cards are opaque.
- No ambient background glow; no coloured shadow under primary buttons.

### Typography

- **Heading Font:** Calistoga
- **Body Font:** Inter
- **Mood:** saas, boutique, electric, warm, editorial, bold, premium, fintech, business, dual font, human warmth
- **Google Fonts:** [Calistoga + Inter](https://fonts.googleapis.com/css2?family=Calistoga:ital@0;1&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Calistoga:ital@0;1&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
```

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #8B5CF6;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #F59E0B;
  border: 2px solid #F59E0B;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #0F172A;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #F59E0B;
  outline: none;
  box-shadow: 0 0 0 3px #F59E0B20;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Glassmorphism

**Keywords:** Frosted glass, transparent, blurred background, layered, vibrant background, light source, depth, multi-layer

**Best For:** Modern SaaS, financial dashboards, high-end corporate, lifestyle apps, modal overlays, navigation

**Key Effects:** Backdrop blur (10-20px), subtle border (1px solid rgba white 0.2), light reflection, Z-depth

### Page Pattern

**Pattern Name:** Real-Time / Operations Landing

- **Conversion Strategy:** For ops/security/iot products. Demo or sandbox link. Trust signals.
- **CTA Placement:** Primary CTA in nav + After metrics
- **Section Order:** 1. Hero (product + live preview or status), 2. Key metrics/indicators, 3. How it works, 4. CTA (Start trial / Contact)

---

## Anti-Patterns (Do NOT Use)

- ❌ Excessive animation
- ❌ Dark mode by default

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
