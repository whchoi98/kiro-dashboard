# API & Frontend Conventions

- All API routes accept `?days=N` query parameter for date range filtering (default: 30)
- API responses use camelCase keys matching TypeScript interfaces in `types/dashboard.ts`
- API error responses: `{ error: string }` with appropriate HTTP status code
- Check `res.ok` before calling `.json()` on client-side fetch — handle HTTP errors explicitly
- Sub-pages are `'use client'` components with `useState` for `days` and data, `useEffect` for fetching
- Overview page uses server→client hybrid: `page.tsx` fetches initial data, `OverviewClient` re-fetches on date change
- Use `useI18n()` hook for all user-facing text — translation keys in `lib/i18n.tsx`
- DateRangePicker presets: 1, 3, 7, 14, 30, 60, 90 days
