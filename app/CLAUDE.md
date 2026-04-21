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
  login/                Cognito OAuth login page
```

## Page Conventions

- All dashboard pages are Server Components by default
- Client interactivity is isolated in `*Client.tsx` files (e.g., `OverviewClient.tsx`)
- Pages use `useLanguage()` from `lib/i18n.tsx` for Korean/English UI text
- Dark theme: root `bg-black`, cards `bg-gray-900/50`
- Kiro brand accent color: `#9046FF` (use `text-[#9046FF]` or `bg-[#9046FF]`)

## Layout

`app/layout.tsx` wraps all pages with:
- NextAuth `SessionProvider`
- i18n `LanguageProvider`
- `Sidebar` and `Header` from `components/layout/`

## Auth

- Login page at `app/login/` handles Cognito redirect
- Protected routes check session via `getServerSession()` from NextAuth
- API routes that require auth use `getServerSession(authOptions)` from `lib/auth.ts`

## Adding a New Dashboard Page

1. Create `app/<page-name>/page.tsx`
2. Add a `<page-name>Client.tsx` if client state is needed
3. Register the route in `app/components/layout/Sidebar.tsx`
4. Add i18n strings for the page title in `lib/i18n.tsx`
5. Add a corresponding API route in `app/api/<page-name>/route.ts`
