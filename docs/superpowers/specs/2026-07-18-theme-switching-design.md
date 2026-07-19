# Dark/Light Theme Switching — Design (approved 2026-07-18)

## Decision

Approach A — palette variable override. Tailwind v4 compiles color utilities
to `var(--color-*)` references, so a `.light` class on `<html>` that remaps
the palette re-skins every component without touching their class lists.
Default theme: **dark** (user decision — preserves current Kiro branding).

## Components

| Unit | Responsibility |
|------|----------------|
| `lib/theme.tsx` | `ThemeProvider` + `useTheme()` — `'dark' \| 'light'`, persists to `localStorage['kiro-theme']`, toggles the `light` class on `<html>` |
| `app/layout.tsx` head script | Reads localStorage and applies `.light` before hydration (no FOUC); `suppressHydrationWarning` on `<html>` |
| `app/globals.css` `.light` block | Inverted Tailwind palette (50↔950, 100↔900, 200↔800, 300↔700, 400↔600 per hue) + dashboard tokens + scrollbar; body colors become var-based |
| Sidebar toggle | 다크/라이트 pill next to the KO/EN switcher (same pattern), i18n'd |
| `lib/chart-theme.ts` | Theme-aware color map for spots CSS vars cannot reach (Recharts axis/grid/tooltip props) — swept via workflow agents |

## Semantics note

Inside `.light`, utilities keep their dark-era names but resolve to inverted
values (`text-white` renders near-black, `bg-gray-900` renders white). New
code keeps writing dark-first classes and gets light mode for free. This
trade-off was chosen over a `dark:`-variant sweep (hundreds of edits, high
regression risk) and a semantic-token migration (same scale, more design).

Brand purple `#9046FF` and nav accent hexes are theme-invariant.

## Verification

Build + jest (structure test: `.light` block, head script, provider wiring),
Playwright both themes (toggle, persistence across reload, per-page
screenshots, no dark-on-dark/light-on-light text), adversarial review
workflow, docs + changelog Unreleased entry.
