# Code Style

- TypeScript strict mode, no `any` types
- Use `'use client'` directive only when component needs React hooks or browser APIs
- Tailwind CSS for all styling — no inline styles except dynamic values (chart colors, bar widths)
- Dark theme: black background (`#000000`), gray-900 cards, gray-800 borders
- Kiro purple accent: `#9046FF`
- Import paths use `@/` alias (maps to project root)
- Components in `app/components/` organized by: `charts/`, `layout/`, `ui/`, `tables/`
