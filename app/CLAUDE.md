# app/ — Next.js App Router

## Role

Next.js 14 App Router 기반의 모든 페이지, 레이아웃, 컴포넌트, API 라우트를 포함합니다.

## Directory Layout

```
app/
  layout.tsx            Root layout — dark theme, i18n provider, auth session
  (overview)/           Route group (adds NO url segment) holding `/` and its loading boundary.
    page.tsx            Dashboard overview — the ONLY dynamically-rendered page (`force-dynamic`);
                        fetches all 6 APIs in ONE Promise.all (it used to be three sequential waves,
                        which added two Athena round trips straight to the navigation stall).
    loading.tsx         Loading boundary for `/` ONLY. Scoped via the route group on purpose: every
                        other page is prerendered, so a root `app/loading.tsx` would nest over 13
                        children that resolve instantly and could flash a skeleton where none exists.
                        Also makes `/` prefetchable — without it the prefetch was an 80-byte stub.
                        Do NOT add loading.tsx to the prerendered pages; it is inert there.
  globals.css           Global Tailwind CSS styles
  api/                  API route handlers (see api/CLAUDE.md)
  components/           Shared React components (see components/CLAUDE.md)
  analyze/              AI chat analysis page (Bedrock streaming)
  users/                User activity listing & detail pages
  credits/              Credit usage analytics page
  trends/               Usage trend charts page
  engagement/           Engagement metric dashboard page
  productivity/         Productivity metrics dashboard page
  model-usage/          AI model usage analysis page (S3 direct read)
  exec/                 Executive one-page snapshot (composes existing APIs)
  subscription/         Subscription tier & overage governance page
  adoption/             New-user inflow & activation page (S3 direct read)
  dev-activity/         Legacy deep dev metrics page (TestGen/DocGen/Transform/InlineChat/CodeFix)
  rollout/              Client rollout & cross-client adoption page (Client_Type daily/cumulative, IDE↔CLI overlap)
  ingest-health/        Report delivery & freshness monitor (S3 inventory, delivery matrix, header drift, row parity)
  changelog/            Bilingual changelog rendered from CHANGELOG.md at build time (force-static).
                        CHANGELOG.md is a required BUILD-CONTEXT input — `.dockerignore` excludes `*.md`,
                        so the `!CHANGELOG.md` re-include must stay after it or the page ships empty.
                        The read is deliberately unguarded; see tests/structure/changelog-build-input.test.ts.
                        Markdown parsing lives in lib/changelog-md.ts (testable); ChangelogClient.tsx only renders.
                        Block rendering is shared with the sidebar release-notes dialog via
                        components/ui/ChangelogBlocks.tsx. Sections carry id="v{version}" + scroll-mt-20 so the
                        dialog's history chips can deep-link to /changelog#v1.6.1.
                        NOTE: /changelog reads the file at build time (force-static), but lib/release-notes.ts
                        must IMPORT it (webpack asset/source) — it is reached at runtime, where no md exists.
```

## Page Conventions

- All dashboard pages are Server Components by default
- Client interactivity is isolated in `*Client.tsx` files (e.g., `OverviewClient.tsx`)
- Pages use `useI18n()` from `lib/i18n.tsx` for Korean/English UI text
- Dark theme: root `bg-black`, cards `bg-gray-900/50`
- Kiro brand accent color: `#9046FF` (use `text-[#9046FF]` or `bg-[#9046FF]`)

## Layout

`app/layout.tsx` wraps all pages with:
- i18n `I18nProvider`
- `ThemeProvider` from `lib/theme.tsx` (dark/light) — with a no-FOUC bootstrap `<script>` in `<head>` that applies the stored `kiro-theme` before hydration; `<html suppressHydrationWarning>`
- `Sidebar` and `Header` from `components/layout/`
- `FloatingChat` from `components/chat/` — global chatbot widget (hidden on `/analyze`, which hosts the full-page chat)
- NanumSquare font via `next/font/local` (`app/fonts/*.woff2`, self-hosted, OFL) — exposed as `--font-nanum-square` and wired to the Tailwind sans stack in `globals.css` (`@theme inline`)
- Responsive shell: `<main>` uses `ml-0 md:ml-[220px]` + `pt-16 md:pt-6` (mobile top bar from Sidebar); desktop layout unchanged at md+
- PWA-lite home-screen support: `app/manifest.ts` (standalone, #000000 theme) + `apple-touch-icon.png`/`icon-192/512.png` in `public/` (rasterized from kiro-logo.svg, #9046FF flattened) + `appleWebApp` meta in layout — no service worker by design

## Auth

- Authentication is handled at the CDN layer by Lambda@Edge (not in the Next.js app)
- Lambda@Edge validates Cognito JWT tokens in cookies before requests reach the origin
- Authenticated user info is available via `X-User-Email` and `X-User-Name` request headers
- Logout is handled by navigating to `/auth/logout` (Lambda@Edge clears cookies and redirects to Cognito logout)

## Adding a New Dashboard Page

1. Create `app/<page-name>/page.tsx`
2. Add a `<page-name>Client.tsx` if client state is needed
3. Register the route in `app/components/layout/Sidebar.tsx`
4. Add i18n strings for the page title in `lib/i18n.tsx`
5. Add a corresponding API route in `app/api/<page-name>/route.ts`
