# API & Frontend Conventions

- All API routes accept `?days=N` query parameter for date range filtering (default: 30)
- API responses use camelCase keys matching TypeScript interfaces in `types/dashboard.ts`
- API error responses: `{ error: string }` with appropriate HTTP status code
- A missing Glue table or an empty S3 prefix is **not** an error: return 200 with a well-shaped empty payload so pages render an empty table instead of a 500 (`tests/api/route-empty-responses.test.ts` enforces this)
- Routes that depend on dynamic CSV columns (`/api/model-usage`, `/api/user-model-usage`, `/api/adoption`, `/api/ingest-health`) read S3 directly via `lib/uar-s3.ts`; everything else goes through Athena
- Expose a `configured: false` flag rather than zeros when the required bucket/prefix env is unset — "not wired up" must be distinguishable from "no data"
- Check `res.ok` before calling `.json()` on client-side fetch — handle HTTP errors explicitly
- Sub-pages are `'use client'` components with `useState` for `days` and data, `useEffect` for fetching, and a cancellation flag in the effect cleanup
- Overview page uses server→client hybrid: `page.tsx` fetches initial data, `OverviewClient` re-fetches on date change
- Use `useI18n()` hook for all user-facing text — translation keys in `lib/i18n.tsx`
- DateRangePicker presets: 1, 3, 7, 14, 30, 60, 90 days
