# app/components/ — React Components

## Role

재사용 가능한 React UI 컴포넌트. 레이아웃, 차트, 테이블, UI 유틸리티로 구분됩니다.

## Directory Layout

```
components/
  layout/
    Header.tsx          Top navigation bar — language switcher, user info
    Sidebar.tsx         Left nav sidebar — page links, logout button, theme (다크/라이트) + language switchers, app version footer; off-canvas drawer + fixed hamburger top bar below md.
                        Nav item appearance comes from lib/nav-state.ts, NOT from `pathname === href`:
                        usePathname() only updates when a transition COMMITS, so clicking the slow `/`
                        route moved nothing on screen (not even the highlight) and looked ignored. The
                        clicked href is stored in `pendingHref` and painted immediately; it clears on
                        commit and on a PENDING_NAV_TIMEOUT_MS fallback (a transition can end without
                        pathname ever changing). Items stay <Link> so Next's prefetch still warms routes.
                        The write is gated on isNavigatingClick(): Next runs onClick BEFORE deciding to
                        navigate and skips navigation for Cmd/Ctrl/Shift/Alt clicks, which left a phantom
                        item pulsing for the full 10s in the tab the user kept looking at. Pass the
                        modifier fields explicitly — `e.target` is the DOM node that was hit, NOT the
                        anchor's target attribute (that is `e.currentTarget.target`); handing the event
                        straight in suppresses EVERY click and silently restores the stall.
                        The version footer is a BUTTON opening ReleaseNotesDialog (was a Link to /changelog).
                        tests/structure/version-sync.test.ts requires it to render `v{APP_VERSION}` from
                        '@/lib/version' and to contain NO literal /v\d+\.\d+\.\d+/ anywhere in the file.
    KiroLogo.tsx        Kiro logo SVG component
  chat/
    FloatingChat.tsx    Global draggable chatbot widget (mounted in app/layout.tsx; hidden on /analyze); full-screen sheet + drag disabled below md
    ChatPanel.tsx       Chat container — variant 'page' | 'widget'; owns the scroll container + stick-to-bottom auto-follow (lib/chat-scroll.ts); quick-prompt suggestions in BOTH variants (page: wrapped pills, widget: horizontal chip row above composer)
    MessageList.tsx     Message bubbles, tool badges, typing dots, MD/PDF export buttons (page variant) — no scroll logic (lives in ChatPanel)
    ChatComposer.tsx    Textarea + send/stop buttons (Enter sends, Shift+Enter newline)
    ChatMarkdown.tsx    Dark-theme ReactMarkdown renderer shared by chat surfaces
  charts/
    BarChart.tsx        Recharts bar chart wrapper
    FunnelChart.tsx     Funnel visualization chart
    IdcUserStatus.tsx   IAM Identity Center user table + dormancy grading strip and directory→activity funnel (directory users, never "seats"); new-registrant badge + 4th "awaiting first report" StatCard fed by `newRegistrants`
    MetricCard.tsx      KPI card with trend indicator
    PieChart.tsx        Recharts pie/donut chart wrapper
    TrendChart.tsx      Recharts line/area trend chart
  tables/
    UserTable.tsx       Sortable user activity data table
  ui/
    DateRangePicker.tsx Date range selector component
    FreshnessBanner.tsx   Report-freshness banner (as-of date + next-report countdown + console docs link); props { dates }; used by /subscription and /adoption
    KiroIcon.tsx        Kiro icon SVG (small)
    KiroMascot.tsx      Kiro mascot SVG (large, decorative)
    UserDetailPanel.tsx Slide-in user detail side panel (Athena-backed /api/user-detail) + embeds UserModelUsage
    UserModelUsage.tsx  Per-user AI model mix card inside UserDetailPanel — stacked 100% bar, primary/distinct
                        cards, legend rows, client-type footnote. Fetches /api/user-model-usage SEPARATELY from
                        the panel's own call (that one is Athena, this one is S3-direct) so an S3 problem
                        degrades one card instead of emptying the panel. Renders THREE distinct empty states
                        (env not configured / reports carry no model columns / user genuinely had none) —
                        collapsing them into one "no data" would assert a measurement nobody made.
    ReleaseNotesDialog.tsx  Modal for the sidebar version badge — fetches /api/release-notes?locale=…
                        (effect keyed on [open, locale]), Escape to close, focuses the close button, locks
                        body scroll, role="dialog" aria-modal="true". Amber banner when the running version
                        has no changelog entry (shows the newest release instead of implying a match).
    PageSkeleton.tsx    THE ONE loading skeleton — do not copy skeleton markup into a page. Exports
                        `PageSkeleton` (used by app/(overview)/loading.tsx) and `SkeletonGate`
                        (used by all 12 client dashboard pages, which render it just below <Header>).
                        Block shapes/variants live in lib/skeleton-layout.ts so Jest can reach them
                        (testMatch is '**/*.test.ts' — logic in .tsx is unreachable). Shows only on the
                        FIRST load (`showSkeleton(loading, hasData)`); a `days` change keeps the previous
                        numbers on screen dimmed instead of blanking them. The dim is therefore
                        `pageBodyOpacityClass(loading, hasData)`, NOT `loading ? 'opacity-50' : …` — CSS
                        opacity composites down a subtree, so a dimmed wrapper multiplied by the
                        skeleton's own animate-pulse rendered it at 0.5–0.25 (~5/255 delta, 1.04:1) and
                        the "one shared skeleton" looked nothing like the /(overview) boundary copy,
                        which has no wrapper. Pinned by tests/structure/nav-feedback.test.ts.
    ChangelogBlocks.tsx Shared markdown block renderer — DOT_COLORS, groupDotColor, renderInline, BlockView,
                        GroupView. Imported by BOTH /changelog and ReleaseNotesDialog; extracted rather than
                        copied so the v1.6.1 bold/code-fence/table fixes cannot regress in one surface only.
                        renderInline splits on backticks FIRST, so `**` inside code stays literal.
  OverviewClient.tsx    Overview dashboard client component (top-level)
```

## Theming Rules

- Background: `bg-black` (page), `bg-gray-900/50` (cards)
- Accent color: `#9046FF` (Kiro brand purple) — use as `text-[#9046FF]` or `border-[#9046FF]`
- Text: `text-white` (primary), `text-gray-400` (secondary)
- All new components must default to dark theme — no `light:` variants
- Border: `border-gray-800` or `border-gray-700`

## Component Conventions

- Client components must have `'use client'` directive at the top
- All user-facing strings go through `useI18n()` from `lib/i18n.tsx`
- Chart components receive pre-processed data arrays (no direct Athena calls)
- `MetricCard` accepts: `title`, `value`, `changeRate`, `trend` props
- `DateRangePicker` emits ISO date strings (`YYYY-MM-DD`)

## Adding a New Component

1. Place in the appropriate subdirectory (`layout/`, `charts/`, `tables/`, `ui/`)
2. If it uses React hooks or browser APIs, add `'use client'`
3. Add Korean/English strings to `lib/i18n.tsx`
4. Export from the component file directly (no barrel `index.ts` needed)
5. Update this file's directory layout above
