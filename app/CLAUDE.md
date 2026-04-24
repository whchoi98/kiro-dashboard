# app/ — Next.js App Router

## Role

Next.js 14 App Router 기반의 모든 페이지, 레이아웃, 컴포넌트, API 라우트를 포함합니다.

## Directory Layout

```
app/
  layout.tsx            Root layout — dark theme, i18n provider, auth session
  page.tsx              Dashboard overview (redirect or overview metrics)
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
- `Sidebar` and `Header` from `components/layout/`

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
