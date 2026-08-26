# Code Style

- TypeScript strict mode, no `any` types; explicit return types on route handlers and exported functions
- Use `'use client'` only when a component needs React hooks or browser APIs
- Tailwind CSS for all styling — no inline styles except genuinely dynamic values (chart colors, bar widths)
- Dark theme is the baseline: black background (`#000000`), `bg-gray-900/50` cards, `border-gray-800`. The light theme is a Tailwind palette override applied by a `.light` class from `lib/theme.tsx`, so components do not need `light:` variants
- Kiro purple accent: `#9046FF`. Recharts colors come from `lib/chart-theme.ts` and `lib/model-colors.ts`, not inline hex
- All user-facing text goes through `useI18n()` from `lib/i18n.tsx`, with keys added to **both** `ko` and `en`
- Import paths use the `@/` alias (maps to the project root)
- Components live in `app/components/` under `charts/`, `layout/`, `ui/`, `tables/`, `chat/`
- Shared types belong in `types/dashboard.ts`; shared logic in `lib/`, not duplicated per route
- Conventional Commits for commit messages (`feat:`, `fix:`, `docs:`, `chore:`)
