# BrewBoat — UI Context

Design system reference for the `@ui-reviewer` agent. The agent reads this file as authoritative for every review.

BrewBoat is a crew-scheduling tool for a small brewery-boat operation: admins generate weekly shifts from Xola reservations, assign captains/mates/shore staff, then push assignments back to Xola. Phase 5 adds a mobile-first staff self-select view (crew on phones at the dock). Aesthetic priorities: clarity first, personality second. Function over form.

## Active Theme

Picked Phase 0.1 (PR #14) via tweakcn preset `b7CSfQ4Xo`.

- **Preset (shadcn `style`):** `base-mira`
- **Base color (shadcn `baseColor`):** `mist` — cool light-gray with a faint blue undertone
- **Primary:** `oklch(0.5 0.134 242)` — saturated sky-blue
- **Primitives library:** Base UI (`@base-ui/react`), not Radix (`--base base` selected at init)
- **Font:** Raleway (sans/body + heading), Geist Mono (mono), both via `next/font/google`
- **Border radius:** `--radius: 0.625rem` (shadcn `--radius-lg` = `var(--radius)`; Tailwind `rounded-lg` resolves here)
- **Default mode:** `system` (`next-themes` with `attribute="class"`, `enableSystem`, `defaultTheme="system"`); `d` key toggles
- **Dark mode:** active — both Light and Dark token sets defined in `app/globals.css`
- **Chart palette:** monochromatic gray fade (`chart-1` → `chart-5`, `oklch(0.872..0.275)` at hue ~213–219). Reserved for the schedule-board status colors; treat as a fallback palette for any data viz.

## Viewports

Take Playwright screenshots at **375px** (mobile), **768px** (tablet), and **1440px** (desktop). Verify dark mode on each surface where applicable.

---

## Design System Reference

### Color

Use shadcn CSS tokens backed by OKLCH values. Do **not** hardcode Tailwind color classes for surfaces or text.

| Token | Use |
|-------|-----|
| `bg-background` / `text-foreground` | Page base |
| `bg-card` / `text-card-foreground` | Card surfaces |
| `bg-primary` / `text-primary-foreground` | Primary actions, strong emphasis |
| `bg-secondary` / `text-secondary-foreground` | Secondary actions, chips |
| `text-muted-foreground` | Labels, metadata, supporting text |
| `bg-muted` | Muted backgrounds (empty states, disabled) |
| `bg-accent` / `text-accent-foreground` | Hover states, selected nav |
| `text-destructive` | Error states, irreversible actions |
| `border-border` | All borders |
| `ring` | Focus rings |

**Never:**
- Raw `text-black` or `text-white` (use foreground/background tokens)
- Hardcoded zinc, gray, slate, or neutral Tailwind classes for text or backgrounds
- Color as the sole state indicator (must pair with icon or text label)

**Exceptions:** Semantic amber for warnings is OK — it's a UX signal, not brand color.

### Typography

- **Font:** Raleway, loaded as `--font-sans` (via `next/font/google` in `app/layout.tsx`). Geist Mono for `--font-mono`.
- **Scale:** Max 3 font sizes per screen.
  - Page heading: `text-2xl font-semibold` (h1)
  - Section headings inside cards: `text-base font-semibold` (CardTitle)
  - Body / labels: `text-sm font-medium`
  - Meta / timestamps: `text-xs`
  - Nothing smaller than `text-xs` (12px).
- **Weight:** `font-semibold` for headings, `font-medium` for labels, default for body. Avoid `font-bold`.
- **Muted text:** `text-muted-foreground` token only.

### Spacing

- Tailwind 4px scale only. No arbitrary values (`p-[13px]`, `gap-[22px]`, etc.).
- Page padding lives in layout.tsx, not individual pages.
- Section spacing: `space-y-6` between major sections.

### Border Radius

One radius across the project: `rounded-lg` (resolves to `--radius: 0.625rem`). Don't mix radii on cards/containers/inputs.

**Never:** `rounded-none`, `rounded-full` on non-pill/avatar elements, oversized overrides.

### Shadows

- Cards: shadcn Card default (shadow-sm or none, per theme).
- Modals/overlays: `shadow-lg`.
- Nothing else. No `shadow-md`, `drop-shadow`, or arbitrary shadows.

### Components

- **Card** (CardHeader, CardTitle, CardDescription, CardContent, CardFooter): primary content container.
- **Badge** variants — semantics must match:
  - `default`: confirmed, active, enrolled
  - `secondary`: pending, neutral, informational
  - `outline`: available spots, minor labels
  - `destructive`: cancelled, error, irreversible
- **Button** variants:
  - `default`: primary action (one per screen)
  - `secondary`: secondary action
  - `outline`: tertiary / back navigation
  - `ghost`: nav items, icon-only buttons
  - `destructive`: irreversible actions
- **Tables:** plain HTML `<table>` with `w-full text-sm`. `border-b` between rows, `last:border-0`. `text-muted-foreground` headers with `font-medium`. No striped rows.
- **Empty states:** `<EmptyState message="..." />` component — not raw `<p>` in the main content column.

### Layout & Navigation

- Two-column layout: fixed-width sidebar + `flex-1 min-w-0 bg-background` main.
- Sidebar uses `bg-sidebar` token — not `bg-white` (wrong in dark mode).
- **Active nav links:** `bg-accent text-accent-foreground`. Inactive: `text-muted-foreground hover:text-foreground`.

### Dark Mode

Dark mode is enabled (`enableSystem`, `defaultTheme="system"`). Both token sets live in `app/globals.css`. Verify:
- Sidebar uses `bg-sidebar` token (dark-aware), not `bg-white`.
- Cards use `bg-card` (dark-aware), not `bg-white`.
- No hardcoded white backgrounds on any surface.
- Text contrast meets WCAG AA against dark backgrounds.
- Borders are subtle but visible (`border-border` token).

### Mobile (375px)

- All views must work at 375px.
- No horizontal scroll.
- Touch targets: minimum 44px height for interactive elements.
- Cards stack single-column on mobile (`grid-cols-1`), go multi-column at `sm:` or `lg:`.

### Visual Hierarchy

- One `<h1>` per page (`text-2xl font-semibold`).
- One primary CTA per screen. Multiple actions → one `default`, rest `secondary` or `outline`.

### Accessibility (Baseline)

- All interactive elements must have visible focus rings (shadcn manages this — don't override with bare `outline-none`).
- Color must not be the sole state indicator.
- Form fields must have visible `<label>` elements, not just placeholder text.
- Decorative icons: `aria-hidden="true"`.
- Images: meaningful `alt` text.

---

## What to Check

For each page or component under review:

1. **Color / tokens** — shadcn tokens in use; no hardcoded Tailwind color classes
2. **Dark mode** — sidebar/card backgrounds use dark-aware tokens; no `bg-white` surfaces
3. **Typography** — Raleway applied via `--font-sans`; ≤3 sizes per screen; min 12px; correct weights
4. **Spacing** — 4px scale; no arbitrary values; page padding in layout not page
5. **Border radius** — `rounded-lg` only; no `rounded-none`; no oversized overrides
6. **Shadows** — Card default; shadow-lg for modals; nothing else
7. **Component usage** — shadcn components used correctly; Badge/Button variants match semantics; one primary CTA
8. **Tables** — `w-full text-sm`, muted headers, row borders, no striping
9. **Empty states** — EmptyState component, not raw paragraph text
10. **Layout** — sidebar uses `bg-sidebar`; padding not doubled; main fills `flex-1`
11. **Mobile 375px** — no horizontal scroll; cards stack; touch targets ≥44px
12. **Accessibility** — focus states intact; color + icon for state; visible labels; `aria-hidden` on decorative icons
