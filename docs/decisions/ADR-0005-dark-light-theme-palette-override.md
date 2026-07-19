# ADR-0005: Dark/Light Theme via Tailwind v4 Palette Override

**Date**: 2026-07-18
**Status**: Accepted
**Deciders**: whchoi98
**Supersedes**: the "Dark-only UI" design decision in `docs/architecture.md` (Key Design Decision #6)

---

## Context

The dashboard shipped dark-only (v1.0-v1.2) on the assumption that a single theme kept maintenance low (recorded as architecture Key Design Decision #6). Users asked for a light theme. The codebase already had hundreds of hardcoded dark-first Tailwind classes across 30+ page/component files (`text-white`, `bg-gray-900/50`, `border-gray-800`, …). A conventional `dark:`/`light:` variant sweep would touch every one of those class lists — a large, regression-prone change that also burdens all future code with maintaining two class sets.

Tailwind CSS v4 compiles color utilities to `var(--color-*)` references, which opens a cheaper path: remap the palette variables under a scoping class instead of rewriting component classes.

## Decision

Implement theming as a **palette variable override** (approach A):

- `lib/theme.tsx` — `ThemeProvider` + `useTheme()`; toggles a `light` class on `<html>`, persists to `localStorage['kiro-theme']`, default **dark**. A no-FOUC inline script in `app/layout.tsx` applies the stored theme before hydration (`<html suppressHydrationWarning>`).
- `app/globals.css` — a `.light { … }` block remaps every used Tailwind color variable with stops inverted per hue (50↔950 … 400↔600), plus `--color-gray-900:#fff` (white cards), soft-light `--color-black`, dark `--color-white`. Body/scrollbar colors are var-based so they re-theme too.
- Components keep writing **dark-first classes** — inside `.light`, `text-white` resolves to near-black, `bg-gray-900` to white. No `dark:`/`light:` variants.
- Brand purple `#9046FF` is theme-invariant; a bridge rule keeps true-white text on purple surfaces.
- Recharts props (ticks/tooltip/cursor) can't resolve CSS variables, so `lib/chart-theme.ts` (`useChartTheme()`) supplies those colors per theme; series/accent fills stay invariant.
- Sidebar exposes a 다크/라이트 pill toggle beside the KO/EN switcher.

## Consequences

### Positive

- Zero changes to component class lists; new code stays dark-first and gets light mode for free.
- Minimal regression surface vs a variant sweep; verified with a structure test (`tests/structure/theme.test.ts`) and behavioral checks (default dark, toggle, persistence, ≥4.5:1 text contrast, white-on-purple invariance, per-page + mobile).

### Negative

- Semantic inversion: `text-white` no longer *means* white inside `.light`. Documented in `CLAUDE.md`; a footgun for anyone expecting variant-based theming.
- Things CSS variables cannot reach must be handled explicitly: arbitrary-value classes (`bg-[#hex]`, `shadow-black/60`), inline `style` colors, modal scrims (`bg-black/50` inverts to a near-white veil — use `bg-[rgba(0,0,0,.5)]`), and Recharts props. These bit us in review and are enumerated in `CLAUDE.md`.

### Neutral

- PDF export (`lib/export-report.ts`) forces the dark palette in its html2canvas `onclone` so exports are theme-independent.

## Alternatives Considered

| Alternative | Why rejected |
|-------------|-------------|
| `dark:`/`light:` variant sweep | Hundreds of edits across 30+ files, high regression risk, ongoing two-class-set burden |
| Semantic design-token migration | Same edit scale as the sweep plus a token-system design effort |
| Stay dark-only | Rejected by the user request for a light theme |
