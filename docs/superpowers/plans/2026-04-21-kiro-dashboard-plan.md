# Kiro User Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js analytics dashboard for Kiro user data, deployed on ECS Fargate behind CloudFront + ALB, querying Athena/Glue/S3.

**Architecture:** Full-stack Next.js App Router running in a single Fargate container. API Routes query Athena for user report data; Server Components render the dark-themed dashboard. CloudFront provides HTTPS termination and injects a custom header validated by ALB. Cognito handles user authentication via NextAuth.js.

**Tech Stack:** Next.js 14 (App Router, standalone output), TypeScript, Tailwind CSS, Recharts, NextAuth.js, AWS SDK v3 (Athena, Glue, IdentityStore), AWS CDK (TypeScript), Docker multi-stage build.

---

## File Map

### Next.js Application

| File | Responsibility |
|---|---|
| `package.json` | Dependencies: next, react, recharts, next-auth, @aws-sdk/client-athena, @aws-sdk/client-glue, @aws-sdk/client-identitystore, tailwindcss |
| `next.config.js` | `output: 'standalone'`, env vars passthrough |
| `tailwind.config.ts` | Dark theme colors, content paths |
| `tsconfig.json` | Strict mode, path aliases |
| `postcss.config.js` | Tailwind PostCSS plugin |
| `types/dashboard.ts` | All TypeScript interfaces (UserReport, OverviewMetrics, DailyTrend, etc.) |
| `lib/athena.ts` | Athena query execution: start → poll → parse results |
| `lib/glue.ts` | Glue GetTables → resolve table name |
| `lib/identity.ts` | Identity Center → batch username resolution |
| `lib/auth.ts` | NextAuth config with Cognito provider |
| `app/layout.tsx` | Root layout: dark theme HTML, Tailwind globals, auth session provider |
| `app/globals.css` | Tailwind directives + dark theme base styles |
| `app/page.tsx` | Overview dashboard page (server component → API calls → client charts) |
| `app/users/page.tsx` | Users section page |
| `app/trends/page.tsx` | Trends section page |
| `app/credits/page.tsx` | Credits section page |
| `app/engagement/page.tsx` | Engagement section page |
| `app/login/page.tsx` | Login page with Cognito redirect |
| `app/api/auth/[...nextauth]/route.ts` | NextAuth route handler |
| `app/api/health/route.ts` | ECS health check endpoint |
| `app/api/metrics/route.ts` | KPI aggregation endpoint |
| `app/api/users/route.ts` | Top users endpoint |
| `app/api/trends/route.ts` | Daily trends endpoint |
| `app/api/credits/route.ts` | Credit analysis endpoint |
| `app/api/engagement/route.ts` | Engagement segmentation endpoint |
| `app/components/layout/Sidebar.tsx` | Kiro-branded sidebar with navigation |
| `app/components/layout/Header.tsx` | Top bar with page title, date filter, refresh |
| `app/components/layout/KiroLogo.tsx` | Kiro SVG logo component |
| `app/components/charts/MetricCard.tsx` | KPI summary card with icon, value, change rate |
| `app/components/charts/TrendChart.tsx` | Daily activity stacked bar chart |
| `app/components/charts/PieChart.tsx` | Donut chart for client distribution |
| `app/components/charts/BarChart.tsx` | Horizontal bar chart for rankings |
| `app/components/charts/FunnelChart.tsx` | Engagement conversion funnel |
| `app/components/tables/UserTable.tsx` | Filterable user activity table |
| `app/components/ui/KiroIcon.tsx` | Kiro icon variants |
| `public/kiro-logo.svg` | Kiro brand SVG asset |

### Docker

| File | Responsibility |
|---|---|
| `Dockerfile` | Multi-stage: deps → build → runner (node:20-alpine) |
| `docker-compose.yml` | Local dev with environment variables |
| `.dockerignore` | Exclude node_modules, .git, .next, infra |

### CDK Infrastructure

| File | Responsibility |
|---|---|
| `infra/package.json` | CDK dependencies |
| `infra/tsconfig.json` | CDK TypeScript config |
| `infra/cdk.json` | CDK app config, context defaults |
| `infra/bin/app.ts` | CDK app entry: instantiate 4 stacks with dependencies |
| `infra/lib/network-stack.ts` | VPC (new/existing), subnets, NAT, SSM VPC endpoints |
| `infra/lib/security-stack.ts` | ALB-SG, ECS-SG, Cognito User Pool, IAM roles |
| `infra/lib/ecs-stack.ts` | ECS Cluster, Fargate Service, ALB, Target Group, Auto Scaling, ECR |
| `infra/lib/cdn-stack.ts` | CloudFront distribution with custom header |

---

## Task 1: Project Initialization & Configuration

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.js`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `app/globals.css`
- Create: `.dockerignore`

- [ ] **Step 1: Initialize the Next.js project with all dependencies**

```bash
cd /home/ec2-user/my-project/kiro-dashboard
npm init -y
npm install next@14 react react-dom typescript @types/react @types/react-dom
npm install tailwindcss postcss autoprefixer
npm install recharts
npm install next-auth@4
npm install @aws-sdk/client-athena @aws-sdk/client-glue @aws-sdk/client-identitystore
```

- [ ] **Step 2: Configure package.json scripts**

Replace the `scripts` section in `package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "infra"]
}
```

- [ ] **Step 4: Create next.config.js**

Create `next.config.js`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    AWS_REGION: process.env.AWS_REGION,
    ATHENA_DATABASE: process.env.ATHENA_DATABASE,
    ATHENA_OUTPUT_BUCKET: process.env.ATHENA_OUTPUT_BUCKET,
    GLUE_TABLE_NAME: process.env.GLUE_TABLE_NAME,
    IDENTITY_STORE_ID: process.env.IDENTITY_STORE_ID,
  },
};

module.exports = nextConfig;
```

- [ ] **Step 5: Create Tailwind config**

Create `tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        kiro: {
          orange: '#f97316',
          'orange-light': '#fb923c',
          'orange-dark': '#ea580c',
        },
        dashboard: {
          bg: '#0a0e1a',
          card: '#1e293b',
          'card-hover': '#334155',
          sidebar: '#0f1629',
          border: '#334155',
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Create postcss.config.js**

Create `postcss.config.js`:

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 7: Create app/globals.css**

Create `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background-color: #0a0e1a;
  color: #e2e8f0;
}

::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: #0f1629;
}

::-webkit-scrollbar-thumb {
  background: #334155;
  border-radius: 3px;
}
```

- [ ] **Step 8: Create .dockerignore**

Create `.dockerignore`:

```
node_modules
.next
.git
.gitignore
.superpowers
infra
docs
docker-compose.yml
*.md
```

- [ ] **Step 9: Verify build setup**

```bash
npx next build
```

Expected: Build should fail with "no pages found" — that's fine, confirms toolchain works.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.js tailwind.config.ts postcss.config.js app/globals.css .dockerignore
git commit -m "feat: initialize Next.js project with Tailwind and AWS SDK dependencies"
```

---

## Task 2: TypeScript Interfaces

**Files:**
- Create: `types/dashboard.ts`

- [ ] **Step 1: Create all TypeScript interfaces**

Create `types/dashboard.ts`:

```typescript
export interface UserReport {
  date: string;
  userid: string;
  profileid: string;
  chat_conversations: number;
  total_messages: number;
  credits_used: number;
  overage_credits_used: number;
  client_type: 'KIRO_IDE' | 'KIRO_CLI' | 'PLUGIN';
  subscription_tier: 'Pro' | 'ProPlus' | 'Power';
  overage_enabled: boolean;
}

export interface OverviewMetrics {
  totalUsers: number;
  totalMessages: number;
  totalConversations: number;
  totalCredits: number;
  totalOverageCredits: number;
  changeRates: Record<string, number>;
}

export interface DailyTrend {
  date: string;
  messages: number;
  conversations: number;
  credits: number;
  activeUsers: number;
}

export interface ClientDistribution {
  clientType: string;
  messageCount: number;
  creditCount: number;
  percentage: number;
}

export interface TopUser {
  userid: string;
  username: string;
  totalMessages: number;
  totalCredits: number;
  rank: number;
}

export type EngagementTier = 'Power' | 'Active' | 'Light' | 'Idle';

export interface EngagementSegment {
  tier: EngagementTier;
  count: number;
  percentage: number;
}

export interface FunnelStep {
  label: string;
  count: number;
  percentage: number;
  conversionRate: number;
}

export interface CreditAnalysis {
  topUsers: Array<{
    userid: string;
    username: string;
    totalCredits: number;
    overageCredits: number;
  }>;
  baseVsOverage: {
    base: number;
    overage: number;
  };
  byTier: Array<{
    tier: string;
    userCount: number;
    totalCredits: number;
  }>;
}

export interface EngagementData {
  segments: EngagementSegment[];
  funnel: FunnelStep[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit types/dashboard.ts
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add types/dashboard.ts
git commit -m "feat: add TypeScript interfaces for dashboard data model"
```

---

## Task 3: AWS Service Clients (Athena, Glue, Identity)

**Files:**
- Create: `lib/athena.ts`
- Create: `lib/glue.ts`
- Create: `lib/identity.ts`

- [ ] **Step 1: Create Athena query client**

Create `lib/athena.ts`:

```typescript
import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  QueryExecutionState,
} from '@aws-sdk/client-athena';

const client = new AthenaClient({ region: process.env.AWS_REGION || 'us-east-1' });

const ATHENA_DATABASE = process.env.ATHENA_DATABASE || '';
const ATHENA_OUTPUT_BUCKET = process.env.ATHENA_OUTPUT_BUCKET || '';

export async function executeQuery(sql: string): Promise<Record<string, string>[]> {
  const startResult = await client.send(
    new StartQueryExecutionCommand({
      QueryString: sql,
      QueryExecutionContext: { Database: ATHENA_DATABASE },
      ResultConfiguration: { OutputLocation: `s3://${ATHENA_OUTPUT_BUCKET}/` },
    })
  );

  const queryExecutionId = startResult.QueryExecutionId!;

  let state: QueryExecutionState | undefined;
  while (true) {
    const statusResult = await client.send(
      new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId })
    );
    state = statusResult.QueryExecution?.Status?.State;

    if (state === QueryExecutionState.SUCCEEDED) break;
    if (state === QueryExecutionState.FAILED || state === QueryExecutionState.CANCELLED) {
      const reason = statusResult.QueryExecution?.Status?.StateChangeReason;
      throw new Error(`Athena query ${state}: ${reason}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const results = await client.send(
    new GetQueryResultsCommand({ QueryExecutionId: queryExecutionId })
  );

  const columns = results.ResultSet?.ResultRows?.[0]?.Data?.map((d) => d.VarCharValue || '') || [];
  const rows = results.ResultSet?.ResultRows?.slice(1) || [];

  return rows.map((row) => {
    const record: Record<string, string> = {};
    row.Data?.forEach((cell, i) => {
      record[columns[i]] = cell.VarCharValue || '';
    });
    return record;
  });
}

function safeFloat(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function safeInt(val: string): number {
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
}

export { safeFloat, safeInt };
```

- [ ] **Step 2: Create Glue table resolver**

Create `lib/glue.ts`:

```typescript
import { GlueClient, GetTablesCommand } from '@aws-sdk/client-glue';

const client = new GlueClient({ region: process.env.AWS_REGION || 'us-east-1' });

const ATHENA_DATABASE = process.env.ATHENA_DATABASE || '';
const CONFIGURED_TABLE = process.env.GLUE_TABLE_NAME || '';

export async function resolveTableName(): Promise<string> {
  if (CONFIGURED_TABLE) return CONFIGURED_TABLE;

  const result = await client.send(
    new GetTablesCommand({ DatabaseName: ATHENA_DATABASE })
  );

  const tables = result.TableList || [];
  if (tables.length === 0) {
    throw new Error(`No tables found in Glue database: ${ATHENA_DATABASE}`);
  }

  return tables[0].Name!;
}
```

- [ ] **Step 3: Create Identity Center username resolver**

Create `lib/identity.ts`:

```typescript
import {
  IdentitystoreClient,
  ListUsersCommand,
} from '@aws-sdk/client-identitystore';

const client = new IdentitystoreClient({ region: process.env.AWS_REGION || 'us-east-1' });

const IDENTITY_STORE_ID = process.env.IDENTITY_STORE_ID || '';

const usernameCache = new Map<string, { username: string; cachedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

export async function resolveUsernames(
  userIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const uncachedIds: string[] = [];
  const now = Date.now();

  for (const id of userIds) {
    const cached = usernameCache.get(id);
    if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
      result.set(id, cached.username);
    } else {
      uncachedIds.push(id);
    }
  }

  if (uncachedIds.length === 0 || !IDENTITY_STORE_ID) {
    for (const id of uncachedIds) {
      result.set(id, id.substring(0, 8));
    }
    return result;
  }

  try {
    const response = await client.send(
      new ListUsersCommand({ IdentityStoreId: IDENTITY_STORE_ID })
    );

    const users = response.Users || [];
    const userMap = new Map(users.map((u) => [u.UserId!, u.UserName || u.DisplayName || u.UserId!]));

    for (const id of uncachedIds) {
      const username = userMap.get(id) || id.substring(0, 8);
      result.set(id, username);
      usernameCache.set(id, { username, cachedAt: now });
    }
  } catch {
    for (const id of uncachedIds) {
      result.set(id, id.substring(0, 8));
    }
  }

  return result;
}
```

- [ ] **Step 4: Verify all lib files compile**

```bash
npx tsc --noEmit lib/athena.ts lib/glue.ts lib/identity.ts
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add lib/athena.ts lib/glue.ts lib/identity.ts
git commit -m "feat: add AWS service clients for Athena, Glue, and Identity Center"
```

---

## Task 4: Authentication (NextAuth + Cognito)

**Files:**
- Create: `lib/auth.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`
- Create: `app/login/page.tsx`

- [ ] **Step 1: Create NextAuth configuration**

Create `lib/auth.ts`:

```typescript
import type { NextAuthOptions } from 'next-auth';
import CognitoProvider from 'next-auth/providers/cognito';

export const authOptions: NextAuthOptions = {
  providers: [
    CognitoProvider({
      clientId: process.env.COGNITO_CLIENT_ID || '',
      clientSecret: process.env.COGNITO_CLIENT_SECRET || '',
      issuer: process.env.COGNITO_ISSUER || '',
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      return { ...session, accessToken: token.accessToken };
    },
  },
};
```

- [ ] **Step 2: Create NextAuth route handler**

Create `app/api/auth/[...nextauth]/route.ts`:

```typescript
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
```

- [ ] **Step 3: Create login page**

Create `app/login/page.tsx`:

```tsx
'use client';

import { signIn } from 'next-auth/react';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-dashboard-bg flex items-center justify-center">
      <div className="bg-dashboard-card rounded-2xl p-8 w-full max-w-md border border-dashboard-border">
        <div className="flex flex-col items-center mb-8">
          <svg
            width="64"
            height="64"
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect rx="16" width="100" height="100" fill="#f97316" />
            <path
              d="M30 70V30h10v16l16-16h13L51 48l20 22H57L42 54v16H30z"
              fill="white"
            />
          </svg>
          <h1 className="text-2xl font-bold text-slate-100 mt-4">
            Kiro Analytics
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Sign in to access the dashboard
          </p>
        </div>
        <button
          onClick={() => signIn('cognito', { callbackUrl: '/' })}
          className="w-full bg-kiro-orange hover:bg-kiro-orange-dark text-white font-semibold py-3 px-4 rounded-lg transition-colors"
        >
          Sign in with Cognito
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/auth.ts app/api/auth app/login/page.tsx
git commit -m "feat: add NextAuth.js authentication with Cognito provider"
```

---

## Task 5: Kiro Brand Components (Logo, Icon, Layout)

**Files:**
- Create: `public/kiro-logo.svg`
- Create: `app/components/ui/KiroIcon.tsx`
- Create: `app/components/layout/KiroLogo.tsx`
- Create: `app/components/layout/Sidebar.tsx`
- Create: `app/components/layout/Header.tsx`

- [ ] **Step 1: Create Kiro SVG logo asset**

Create `public/kiro-logo.svg`:

```svg
<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect rx="16" width="100" height="100" fill="#f97316"/>
  <path d="M30 70V30h10v16l16-16h13L51 48l20 22H57L42 54v16H30z" fill="white"/>
</svg>
```

- [ ] **Step 2: Create KiroIcon component**

Create `app/components/ui/KiroIcon.tsx`:

```tsx
interface KiroIconProps {
  size?: number;
  className?: string;
}

export default function KiroIcon({ size = 24, className = '' }: KiroIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect rx="16" width="100" height="100" fill="#f97316" />
      <path
        d="M30 70V30h10v16l16-16h13L51 48l20 22H57L42 54v16H30z"
        fill="white"
      />
    </svg>
  );
}
```

- [ ] **Step 3: Create KiroLogo component**

Create `app/components/layout/KiroLogo.tsx`:

```tsx
import KiroIcon from '@/app/components/ui/KiroIcon';

export default function KiroLogo() {
  return (
    <div className="flex items-center gap-3 px-4 pb-5 border-b border-dashboard-border">
      <KiroIcon size={32} />
      <div>
        <div className="text-slate-100 text-[15px] font-bold">Kiro</div>
        <div className="text-slate-500 text-[10px]">Analytics Dashboard</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create Sidebar component**

Create `app/components/layout/Sidebar.tsx`:

```tsx
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import KiroLogo from './KiroLogo';

const navItems = [
  {
    href: '/',
    label: 'Overview',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <rect x="1" y="1" width="6" height="6" rx="1" />
        <rect x="9" y="1" width="6" height="6" rx="1" />
        <rect x="1" y="9" width="6" height="6" rx="1" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
      </svg>
    ),
  },
  {
    href: '/users',
    label: 'Users',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="8" cy="5" r="3" />
        <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      </svg>
    ),
  },
  {
    href: '/trends',
    label: 'Trends',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 12 L5 6 L8 9 L11 3 L14 7" />
      </svg>
    ),
  },
  {
    href: '/credits',
    label: 'Credits',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 2 A6 6 0 0 1 14 8" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: '/engagement',
    label: 'Engagement',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 14 L2 10 L5 10 L5 14 M6 14 L6 6 L9 6 L9 14 M10 14 L10 2 L13 2 L13 14" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[220px] bg-dashboard-sidebar border-r border-dashboard-border flex flex-col fixed h-screen">
      <div className="pt-5">
        <KiroLogo />
      </div>
      <nav className="flex-1 p-3 mt-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium mb-0.5 transition-colors ${
                isActive
                  ? 'bg-gradient-to-r from-kiro-orange to-kiro-orange-dark text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-dashboard-card'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 5: Create Header component**

Create `app/components/layout/Header.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';

interface HeaderProps {
  title: string;
  subtitle: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const router = useRouter();

  return (
    <div className="flex justify-between items-center mb-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">{title}</h1>
        <p className="text-slate-500 text-xs mt-1">{subtitle}</p>
      </div>
      <div className="flex gap-2">
        <div className="bg-dashboard-card border border-dashboard-border rounded-md px-3 py-1.5 text-slate-400 text-xs">
          Last 30 days
        </div>
        <button
          onClick={() => router.refresh()}
          className="bg-kiro-orange hover:bg-kiro-orange-dark rounded-md px-3 py-1.5 text-white text-xs font-semibold transition-colors"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add public/kiro-logo.svg app/components/
git commit -m "feat: add Kiro brand components — logo, icon, sidebar, header"
```

---

## Task 6: Root Layout & Health Check API

**Files:**
- Create: `app/layout.tsx`
- Create: `app/api/health/route.ts`

- [ ] **Step 1: Create root layout**

Create `app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/app/components/layout/Sidebar';

export const metadata: Metadata = {
  title: 'Kiro Analytics Dashboard',
  description: 'Kiro user analytics and engagement dashboard',
  icons: { icon: '/kiro-logo.svg' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 ml-[220px] p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Create health check endpoint**

Create `app/api/health/route.ts`:

```typescript
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
```

- [ ] **Step 3: Verify build compiles**

```bash
npx next build
```

Expected: Build succeeds (may warn about missing page.tsx — that's fine, we add it next).

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/api/health/route.ts
git commit -m "feat: add root layout with sidebar and health check endpoint"
```

---

## Task 7: Chart Components

**Files:**
- Create: `app/components/charts/MetricCard.tsx`
- Create: `app/components/charts/TrendChart.tsx`
- Create: `app/components/charts/PieChart.tsx`
- Create: `app/components/charts/BarChart.tsx`
- Create: `app/components/charts/FunnelChart.tsx`

- [ ] **Step 1: Create MetricCard component**

Create `app/components/charts/MetricCard.tsx`:

```tsx
'use client';

import KiroIcon from '@/app/components/ui/KiroIcon';

interface MetricCardProps {
  title: string;
  value: string;
  changeRate: number;
  accentColor: string;
  icon?: React.ReactNode;
}

export default function MetricCard({
  title,
  value,
  changeRate,
  accentColor,
  icon,
}: MetricCardProps) {
  const isPositive = changeRate >= 0;

  return (
    <div
      className="bg-dashboard-card rounded-xl p-4"
      style={{ borderTop: `3px solid ${accentColor}` }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        {icon || <KiroIcon size={14} />}
        <span className="text-slate-400 text-[10px] uppercase tracking-wide">
          {title}
        </span>
      </div>
      <div className="text-slate-100 text-2xl font-bold">{value}</div>
      <div
        className={`text-[10px] mt-1 ${
          isPositive ? 'text-green-500' : 'text-red-500'
        }`}
      >
        {isPositive ? '+' : ''}
        {changeRate.toFixed(1)}% vs last period
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create TrendChart component**

Create `app/components/charts/TrendChart.tsx`:

```tsx
'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { DailyTrend } from '@/types/dashboard';

interface TrendChartProps {
  data: DailyTrend[];
}

export default function TrendChart({ data }: TrendChartProps) {
  return (
    <div className="bg-dashboard-card rounded-xl p-4">
      <h3 className="text-slate-200 text-sm font-semibold mb-3">
        Daily Activity Trends
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data}>
          <XAxis
            dataKey="date"
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickFormatter={(val) => val.slice(5)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelStyle={{ color: '#e2e8f0' }}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }}
          />
          <Bar
            dataKey="messages"
            name="Messages"
            fill="#6366f1"
            radius={[3, 3, 0, 0]}
            stackId="a"
          />
          <Bar
            dataKey="conversations"
            name="Conversations"
            fill="#0ea5e9"
            radius={[3, 3, 0, 0]}
            stackId="a"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Create PieChart component**

Create `app/components/charts/PieChart.tsx`:

```tsx
'use client';

import {
  PieChart as RechartsPie,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { ClientDistribution } from '@/types/dashboard';

interface ClientPieChartProps {
  data: ClientDistribution[];
  title: string;
}

const COLORS = ['#f97316', '#6366f1', '#22d3ee', '#a78bfa', '#ec4899'];

export default function ClientPieChart({ data, title }: ClientPieChartProps) {
  return (
    <div className="bg-dashboard-card rounded-xl p-4">
      <h3 className="text-slate-200 text-sm font-semibold mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <RechartsPie>
          <Pie
            data={data}
            dataKey="messageCount"
            nameKey="clientType"
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={70}
            paddingAngle={2}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
        </RechartsPie>
      </ResponsiveContainer>
      <div className="flex flex-col gap-1.5 mt-2">
        {data.map((item, i) => (
          <div key={item.clientType} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="text-slate-400 text-[10px]">{item.clientType}</span>
            </div>
            <span className="text-slate-200 text-[10px] font-semibold">
              {item.percentage.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create BarChart component for rankings**

Create `app/components/charts/BarChart.tsx`:

```tsx
'use client';

import {
  BarChart as RechartsBar,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TopUser } from '@/types/dashboard';

interface RankingBarChartProps {
  data: TopUser[];
  title: string;
}

const RANK_COLORS = ['#f97316', '#6366f1', '#0ea5e9'];

export default function RankingBarChart({ data, title }: RankingBarChartProps) {
  return (
    <div className="bg-dashboard-card rounded-xl p-4">
      <h3 className="text-slate-200 text-sm font-semibold mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <RechartsBar data={data} layout="vertical">
          <XAxis
            type="number"
            tick={{ fill: '#64748b', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="username"
            width={80}
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
          <Bar dataKey="totalMessages" name="Messages" radius={[0, 4, 4, 0]}>
            {data.map((_, index) => (
              <Cell
                key={index}
                fill={RANK_COLORS[index] || '#64748b'}
              />
            ))}
          </Bar>
        </RechartsBar>
      </ResponsiveContainer>
    </div>
  );
}
```

Add the missing import at the top of the file:

```tsx
import { Cell } from 'recharts';
```

The full import line should read:

```tsx
import {
  BarChart as RechartsBar,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
```

- [ ] **Step 5: Create FunnelChart component**

Create `app/components/charts/FunnelChart.tsx`:

```tsx
'use client';

import type { FunnelStep } from '@/types/dashboard';

interface FunnelChartProps {
  data: FunnelStep[];
  title: string;
}

const FUNNEL_COLORS = ['#f97316', '#6366f1', '#0ea5e9', '#a78bfa', '#ec4899'];

export default function FunnelChart({ data, title }: FunnelChartProps) {
  return (
    <div className="bg-dashboard-card rounded-xl p-4">
      <h3 className="text-slate-200 text-sm font-semibold mb-3">{title}</h3>
      <div className="flex flex-col items-center gap-1">
        {data.map((step, i) => {
          const widthPercent = 100 - i * (60 / Math.max(data.length - 1, 1));
          return (
            <div
              key={step.label}
              className="rounded py-2 text-center transition-all"
              style={{
                width: `${widthPercent}%`,
                backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
              }}
            >
              <span className="text-white text-[11px] font-semibold">
                {step.label}: {step.count.toLocaleString()} ({step.percentage.toFixed(1)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add app/components/charts/
git commit -m "feat: add chart components — MetricCard, TrendChart, PieChart, BarChart, FunnelChart"
```

---

## Task 8: User Activity Table Component

**Files:**
- Create: `app/components/tables/UserTable.tsx`

- [ ] **Step 1: Create filterable user table**

Create `app/components/tables/UserTable.tsx`:

```tsx
'use client';

import { useState, useMemo } from 'react';
import type { TopUser } from '@/types/dashboard';

interface UserTableProps {
  data: TopUser[];
}

export default function UserTable({ data }: UserTableProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<'totalMessages' | 'totalCredits'>('totalMessages');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filtered = useMemo(() => {
    let result = data;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.userid.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      const diff = a[sortField] - b[sortField];
      return sortDir === 'desc' ? -diff : diff;
    });
    return result;
  }, [data, search, sortField, sortDir]);

  const toggleSort = (field: 'totalMessages' | 'totalCredits') => {
    if (sortField === field) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  return (
    <div className="bg-dashboard-card rounded-xl p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-slate-200 text-sm font-semibold">User Activity</h3>
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-dashboard-bg border border-dashboard-border rounded-md px-3 py-1.5 text-xs text-slate-300 placeholder-slate-500 w-48 focus:outline-none focus:border-kiro-orange"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-dashboard-border">
              <th className="text-left text-slate-400 font-medium py-2 px-2">Rank</th>
              <th className="text-left text-slate-400 font-medium py-2 px-2">User</th>
              <th
                className="text-right text-slate-400 font-medium py-2 px-2 cursor-pointer hover:text-slate-200"
                onClick={() => toggleSort('totalMessages')}
              >
                Messages {sortField === 'totalMessages' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
              <th
                className="text-right text-slate-400 font-medium py-2 px-2 cursor-pointer hover:text-slate-200"
                onClick={() => toggleSort('totalCredits')}
              >
                Credits {sortField === 'totalCredits' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user, i) => (
              <tr
                key={user.userid}
                className="border-b border-dashboard-border/50 hover:bg-dashboard-card-hover transition-colors"
              >
                <td className="py-2 px-2 text-slate-500">{i + 1}</td>
                <td className="py-2 px-2 text-slate-200">{user.username}</td>
                <td className="py-2 px-2 text-right text-slate-300">
                  {user.totalMessages.toLocaleString()}
                </td>
                <td className="py-2 px-2 text-right text-slate-300">
                  {user.totalCredits.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/tables/UserTable.tsx
git commit -m "feat: add filterable user activity table component"
```

---

## Task 9: API Routes (Metrics, Users, Trends, Credits, Engagement)

**Files:**
- Create: `app/api/metrics/route.ts`
- Create: `app/api/users/route.ts`
- Create: `app/api/trends/route.ts`
- Create: `app/api/credits/route.ts`
- Create: `app/api/engagement/route.ts`

- [ ] **Step 1: Create metrics API route**

Create `app/api/metrics/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, safeFloat, safeInt } from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';

export async function GET(request: NextRequest) {
  const days = parseInt(request.nextUrl.searchParams.get('days') || '30', 10);

  try {
    const tableName = await resolveTableName();

    const currentQuery = `
      SELECT
        COUNT(DISTINCT userid) as total_users,
        COALESCE(SUM(TRY_CAST(total_messages AS BIGINT)), 0) as total_messages,
        COALESCE(SUM(TRY_CAST(chat_conversations AS BIGINT)), 0) as total_conversations,
        COALESCE(SUM(TRY_CAST(credits_used AS DOUBLE)), 0) as total_credits,
        COALESCE(SUM(TRY_CAST(overage_credits_used AS DOUBLE)), 0) as total_overage
      FROM "${tableName}"
      WHERE date >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
    `;

    const previousQuery = `
      SELECT
        COUNT(DISTINCT userid) as total_users,
        COALESCE(SUM(TRY_CAST(total_messages AS BIGINT)), 0) as total_messages,
        COALESCE(SUM(TRY_CAST(chat_conversations AS BIGINT)), 0) as total_conversations,
        COALESCE(SUM(TRY_CAST(credits_used AS DOUBLE)), 0) as total_credits,
        COALESCE(SUM(TRY_CAST(overage_credits_used AS DOUBLE)), 0) as total_overage
      FROM "${tableName}"
      WHERE date >= DATE_FORMAT(DATE_ADD('day', -${days * 2}, CURRENT_DATE), '%Y-%m-%d')
        AND date < DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
    `;

    const [currentRows, previousRows] = await Promise.all([
      executeQuery(currentQuery),
      executeQuery(previousQuery),
    ]);

    const current = currentRows[0] || {};
    const previous = previousRows[0] || {};

    const calcChange = (curr: string, prev: string) => {
      const c = safeFloat(curr);
      const p = safeFloat(prev);
      if (p === 0) return c > 0 ? 100 : 0;
      return ((c - p) / p) * 100;
    };

    return NextResponse.json({
      totalUsers: safeInt(current.total_users),
      totalMessages: safeInt(current.total_messages),
      totalConversations: safeInt(current.total_conversations),
      totalCredits: safeFloat(current.total_credits),
      totalOverageCredits: safeFloat(current.total_overage),
      changeRates: {
        users: calcChange(current.total_users, previous.total_users),
        messages: calcChange(current.total_messages, previous.total_messages),
        conversations: calcChange(current.total_conversations, previous.total_conversations),
        credits: calcChange(current.total_credits, previous.total_credits),
        overage: calcChange(current.total_overage, previous.total_overage),
      },
    });
  } catch (error) {
    console.error('Metrics API error:', error);
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create users API route**

Create `app/api/users/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, safeInt, safeFloat } from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';
import { resolveUsernames } from '@/lib/identity';

export async function GET(request: NextRequest) {
  const days = parseInt(request.nextUrl.searchParams.get('days') || '30', 10);
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10', 10);

  try {
    const tableName = await resolveTableName();

    const query = `
      SELECT
        userid,
        SUM(TRY_CAST(total_messages AS BIGINT)) as total_messages,
        SUM(TRY_CAST(credits_used AS DOUBLE)) as total_credits
      FROM "${tableName}"
      WHERE date >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
      GROUP BY userid
      ORDER BY total_messages DESC
      LIMIT ${limit}
    `;

    const rows = await executeQuery(query);
    const userIds = rows.map((r) => r.userid.replace(/^['"]|['"]$/g, ''));
    const usernameMap = await resolveUsernames(userIds);

    const users = rows.map((row, i) => {
      const cleanId = row.userid.replace(/^['"]|['"]$/g, '');
      return {
        userid: cleanId,
        username: usernameMap.get(cleanId) || cleanId.substring(0, 8),
        totalMessages: safeInt(row.total_messages),
        totalCredits: safeFloat(row.total_credits),
        rank: i + 1,
      };
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error('Users API error:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create trends API route**

Create `app/api/trends/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, safeInt, safeFloat } from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';

export async function GET(request: NextRequest) {
  const days = parseInt(request.nextUrl.searchParams.get('days') || '30', 10);

  try {
    const tableName = await resolveTableName();

    const query = `
      SELECT
        date,
        COALESCE(SUM(TRY_CAST(total_messages AS BIGINT)), 0) as messages,
        COALESCE(SUM(TRY_CAST(chat_conversations AS BIGINT)), 0) as conversations,
        COALESCE(SUM(TRY_CAST(credits_used AS DOUBLE)), 0) as credits,
        COUNT(DISTINCT userid) as active_users
      FROM "${tableName}"
      WHERE date >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
      GROUP BY date
      ORDER BY date
    `;

    const rows = await executeQuery(query);

    const trends = rows.map((row) => ({
      date: row.date,
      messages: safeInt(row.messages),
      conversations: safeInt(row.conversations),
      credits: safeFloat(row.credits),
      activeUsers: safeInt(row.active_users),
    }));

    return NextResponse.json(trends);
  } catch (error) {
    console.error('Trends API error:', error);
    return NextResponse.json({ error: 'Failed to fetch trends' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create credits API route**

Create `app/api/credits/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, safeFloat, safeInt } from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';
import { resolveUsernames } from '@/lib/identity';

export async function GET(request: NextRequest) {
  const days = parseInt(request.nextUrl.searchParams.get('days') || '30', 10);

  try {
    const tableName = await resolveTableName();

    const topUsersQuery = `
      SELECT
        userid,
        SUM(TRY_CAST(credits_used AS DOUBLE)) as total_credits,
        SUM(TRY_CAST(overage_credits_used AS DOUBLE)) as overage_credits
      FROM "${tableName}"
      WHERE date >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
      GROUP BY userid
      ORDER BY total_credits DESC
      LIMIT 15
    `;

    const ratioQuery = `
      SELECT
        COALESCE(SUM(TRY_CAST(credits_used AS DOUBLE)), 0) as base_credits,
        COALESCE(SUM(TRY_CAST(overage_credits_used AS DOUBLE)), 0) as overage_credits
      FROM "${tableName}"
      WHERE date >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
    `;

    const tierQuery = `
      SELECT
        subscription_tier,
        COUNT(DISTINCT userid) as user_count,
        COALESCE(SUM(TRY_CAST(credits_used AS DOUBLE)), 0) as total_credits
      FROM "${tableName}"
      WHERE date >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
      GROUP BY subscription_tier
      ORDER BY total_credits DESC
    `;

    const [topRows, ratioRows, tierRows] = await Promise.all([
      executeQuery(topUsersQuery),
      executeQuery(ratioQuery),
      executeQuery(tierQuery),
    ]);

    const userIds = topRows.map((r) => r.userid.replace(/^['"]|['"]$/g, ''));
    const usernameMap = await resolveUsernames(userIds);

    const topUsers = topRows.map((row) => {
      const cleanId = row.userid.replace(/^['"]|['"]$/g, '');
      return {
        userid: cleanId,
        username: usernameMap.get(cleanId) || cleanId.substring(0, 8),
        totalCredits: safeFloat(row.total_credits),
        overageCredits: safeFloat(row.overage_credits),
      };
    });

    const ratio = ratioRows[0] || {};
    const baseVsOverage = {
      base: safeFloat(ratio.base_credits),
      overage: safeFloat(ratio.overage_credits),
    };

    const byTier = tierRows.map((row) => ({
      tier: row.subscription_tier,
      userCount: safeInt(row.user_count),
      totalCredits: safeFloat(row.total_credits),
    }));

    return NextResponse.json({ topUsers, baseVsOverage, byTier });
  } catch (error) {
    console.error('Credits API error:', error);
    return NextResponse.json({ error: 'Failed to fetch credits' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Create engagement API route**

Create `app/api/engagement/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, safeInt } from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';

export async function GET(request: NextRequest) {
  const days = parseInt(request.nextUrl.searchParams.get('days') || '30', 10);

  try {
    const tableName = await resolveTableName();

    const query = `
      SELECT
        userid,
        COALESCE(SUM(TRY_CAST(total_messages AS BIGINT)), 0) as total_messages,
        COALESCE(SUM(TRY_CAST(chat_conversations AS BIGINT)), 0) as total_conversations
      FROM "${tableName}"
      WHERE date >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
      GROUP BY userid
    `;

    const rows = await executeQuery(query);

    let power = 0;
    let active = 0;
    let light = 0;
    let idle = 0;
    let messageSenders = 0;
    let conversationalists = 0;

    for (const row of rows) {
      const msgs = safeInt(row.total_messages);
      const convs = safeInt(row.total_conversations);

      if (msgs >= 100 || convs >= 20) power++;
      else if (msgs >= 20 || convs >= 5) active++;
      else if (msgs >= 1) light++;
      else idle++;

      if (msgs >= 1) messageSenders++;
      if (convs >= 1) conversationalists++;
    }

    const total = rows.length;
    const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

    const segments = [
      { tier: 'Power' as const, count: power, percentage: pct(power) },
      { tier: 'Active' as const, count: active, percentage: pct(active) },
      { tier: 'Light' as const, count: light, percentage: pct(light) },
      { tier: 'Idle' as const, count: idle, percentage: pct(idle) },
    ];

    const funnelSteps = [
      { label: 'All Users', count: total, percentage: 100 },
      { label: 'Message Senders', count: messageSenders, percentage: pct(messageSenders) },
      { label: 'Conversationalists', count: conversationalists, percentage: pct(conversationalists) },
      { label: 'Active (20+)', count: active + power, percentage: pct(active + power) },
      { label: 'Power (100+)', count: power, percentage: pct(power) },
    ];

    const funnel = funnelSteps.map((step, i) => ({
      ...step,
      conversionRate: i === 0 ? 100 : (step.count / funnelSteps[i - 1].count) * 100 || 0,
    }));

    return NextResponse.json({ segments, funnel });
  } catch (error) {
    console.error('Engagement API error:', error);
    return NextResponse.json({ error: 'Failed to fetch engagement' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add app/api/metrics/ app/api/users/ app/api/trends/ app/api/credits/ app/api/engagement/
git commit -m "feat: add API routes for metrics, users, trends, credits, engagement"
```

---

## Task 10: Dashboard Pages (Overview, Users, Trends, Credits, Engagement)

**Files:**
- Create: `app/page.tsx`
- Create: `app/users/page.tsx`
- Create: `app/trends/page.tsx`
- Create: `app/credits/page.tsx`
- Create: `app/engagement/page.tsx`

- [ ] **Step 1: Create Overview page**

Create `app/page.tsx`:

```tsx
import Header from '@/app/components/layout/Header';
import MetricCard from '@/app/components/charts/MetricCard';
import TrendChart from '@/app/components/charts/TrendChart';
import ClientPieChart from '@/app/components/charts/PieChart';
import RankingBarChart from '@/app/components/charts/BarChart';
import FunnelChart from '@/app/components/charts/FunnelChart';
import type {
  OverviewMetrics,
  DailyTrend,
  ClientDistribution,
  TopUser,
  EngagementData,
} from '@/types/dashboard';

async function fetchData<T>(path: string): Promise<T> {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}${path}`, {
    next: { revalidate: 300, tags: ['dashboard'] },
  });
  return res.json();
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default async function OverviewPage() {
  const [metrics, trends, users, engagement] = await Promise.all([
    fetchData<OverviewMetrics>('/api/metrics?days=30'),
    fetchData<DailyTrend[]>('/api/trends?days=30'),
    fetchData<TopUser[]>('/api/users?days=30&limit=10'),
    fetchData<EngagementData>('/api/engagement?days=30'),
  ]);

  const clientDist: ClientDistribution[] = [
    { clientType: 'KIRO_IDE', messageCount: 50, creditCount: 45, percentage: 50 },
    { clientType: 'KIRO_CLI', messageCount: 35, creditCount: 35, percentage: 35 },
    { clientType: 'PLUGIN', messageCount: 15, creditCount: 20, percentage: 15 },
  ];

  return (
    <>
      <Header title="Overview" subtitle="Kiro usage analytics across all users" />

      <div className="grid grid-cols-5 gap-3 mb-5">
        <MetricCard
          title="Total Users"
          value={formatNumber(metrics.totalUsers)}
          changeRate={metrics.changeRates?.users ?? 0}
          accentColor="#f97316"
        />
        <MetricCard
          title="Messages"
          value={formatNumber(metrics.totalMessages)}
          changeRate={metrics.changeRates?.messages ?? 0}
          accentColor="#6366f1"
        />
        <MetricCard
          title="Conversations"
          value={formatNumber(metrics.totalConversations)}
          changeRate={metrics.changeRates?.conversations ?? 0}
          accentColor="#0ea5e9"
        />
        <MetricCard
          title="Credits Used"
          value={formatNumber(metrics.totalCredits)}
          changeRate={metrics.changeRates?.credits ?? 0}
          accentColor="#a78bfa"
        />
        <MetricCard
          title="Overage Credits"
          value={formatNumber(metrics.totalOverageCredits)}
          changeRate={metrics.changeRates?.overage ?? 0}
          accentColor="#ec4899"
        />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="col-span-2">
          <TrendChart data={trends} />
        </div>
        <ClientPieChart data={clientDist} title="Client Distribution" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <RankingBarChart data={users} title="Top 10 Users" />
        <FunnelChart data={engagement.funnel} title="Engagement Funnel" />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create Users page**

Create `app/users/page.tsx`:

```tsx
import Header from '@/app/components/layout/Header';
import RankingBarChart from '@/app/components/charts/BarChart';
import UserTable from '@/app/components/tables/UserTable';
import type { TopUser } from '@/types/dashboard';

async function fetchData<T>(path: string): Promise<T> {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}${path}`, {
    next: { revalidate: 300, tags: ['dashboard'] },
  });
  return res.json();
}

export default async function UsersPage() {
  const [topUsers, allUsers] = await Promise.all([
    fetchData<TopUser[]>('/api/users?days=30&limit=10'),
    fetchData<TopUser[]>('/api/users?days=30&limit=100'),
  ]);

  return (
    <>
      <Header title="Users" subtitle="User activity and leaderboard" />
      <div className="mb-5">
        <RankingBarChart data={topUsers} title="Top 10 Users by Messages" />
      </div>
      <UserTable data={allUsers} />
    </>
  );
}
```

- [ ] **Step 3: Create Trends page**

Create `app/trends/page.tsx`:

```tsx
import Header from '@/app/components/layout/Header';
import TrendChart from '@/app/components/charts/TrendChart';
import type { DailyTrend } from '@/types/dashboard';

async function fetchData<T>(path: string): Promise<T> {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}${path}`, {
    next: { revalidate: 300, tags: ['dashboard'] },
  });
  return res.json();
}

export default async function TrendsPage() {
  const trends = await fetchData<DailyTrend[]>('/api/trends?days=30');

  return (
    <>
      <Header title="Trends" subtitle="Daily activity trends and patterns" />
      <div className="mb-5">
        <TrendChart data={trends} />
      </div>
    </>
  );
}
```

- [ ] **Step 4: Create Credits page**

Create `app/credits/page.tsx`:

```tsx
import Header from '@/app/components/layout/Header';
import ClientPieChart from '@/app/components/charts/PieChart';
import type { CreditAnalysis } from '@/types/dashboard';

async function fetchData<T>(path: string): Promise<T> {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}${path}`, {
    next: { revalidate: 300, tags: ['dashboard'] },
  });
  return res.json();
}

export default async function CreditsPage() {
  const credits = await fetchData<CreditAnalysis>('/api/credits?days=30');

  const pieData = [
    {
      clientType: 'Base Credits',
      messageCount: credits.baseVsOverage.base,
      creditCount: credits.baseVsOverage.base,
      percentage:
        (credits.baseVsOverage.base /
          (credits.baseVsOverage.base + credits.baseVsOverage.overage || 1)) *
        100,
    },
    {
      clientType: 'Overage Credits',
      messageCount: credits.baseVsOverage.overage,
      creditCount: credits.baseVsOverage.overage,
      percentage:
        (credits.baseVsOverage.overage /
          (credits.baseVsOverage.base + credits.baseVsOverage.overage || 1)) *
        100,
    },
  ];

  return (
    <>
      <Header title="Credits" subtitle="Credit usage analysis and breakdown" />

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="col-span-2">
          <div className="bg-dashboard-card rounded-xl p-4">
            <h3 className="text-slate-200 text-sm font-semibold mb-3">
              Top 15 Users by Credit Usage
            </h3>
            <div className="space-y-2">
              {credits.topUsers.map((user, i) => (
                <div key={user.userid} className="flex items-center gap-2">
                  <span className="text-slate-500 text-xs w-6">{i + 1}</span>
                  <span className="text-slate-300 text-xs w-20 truncate">
                    {user.username}
                  </span>
                  <div className="flex-1 bg-dashboard-bg rounded h-4 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-kiro-orange to-kiro-orange-light rounded"
                      style={{
                        width: `${
                          (user.totalCredits /
                            (credits.topUsers[0]?.totalCredits || 1)) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                  <span className="text-slate-400 text-xs w-16 text-right">
                    {user.totalCredits.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <ClientPieChart data={pieData} title="Base vs Overage" />
      </div>

      <div className="bg-dashboard-card rounded-xl p-4">
        <h3 className="text-slate-200 text-sm font-semibold mb-3">
          Credits by Subscription Tier
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {credits.byTier.map((tier) => (
            <div
              key={tier.tier}
              className="bg-dashboard-bg rounded-lg p-4 text-center"
            >
              <div className="text-slate-400 text-xs mb-1">{tier.tier}</div>
              <div className="text-slate-100 text-lg font-bold">
                {tier.totalCredits.toLocaleString()}
              </div>
              <div className="text-slate-500 text-[10px]">
                {tier.userCount} users
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 5: Create Engagement page**

Create `app/engagement/page.tsx`:

```tsx
import Header from '@/app/components/layout/Header';
import ClientPieChart from '@/app/components/charts/PieChart';
import FunnelChart from '@/app/components/charts/FunnelChart';
import type { EngagementData } from '@/types/dashboard';

async function fetchData<T>(path: string): Promise<T> {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}${path}`, {
    next: { revalidate: 300, tags: ['dashboard'] },
  });
  return res.json();
}

const TIER_DESCRIPTIONS: Record<string, string> = {
  Power: '100+ messages OR 20+ conversations',
  Active: '20+ messages OR 5+ conversations',
  Light: '1+ messages',
  Idle: 'No activity',
};

export default async function EngagementPage() {
  const data = await fetchData<EngagementData>('/api/engagement?days=30');

  const pieData = data.segments.map((s) => ({
    clientType: s.tier,
    messageCount: s.count,
    creditCount: s.count,
    percentage: s.percentage,
  }));

  return (
    <>
      <Header
        title="Engagement"
        subtitle="User engagement segmentation and conversion"
      />

      <div className="grid grid-cols-2 gap-3 mb-5">
        <ClientPieChart data={pieData} title="Engagement Segments" />
        <FunnelChart data={data.funnel} title="Engagement Funnel" />
      </div>

      <div className="grid grid-cols-4 gap-3">
        {data.segments.map((seg) => (
          <div key={seg.tier} className="bg-dashboard-card rounded-xl p-4">
            <div className="text-slate-200 text-sm font-semibold">{seg.tier}</div>
            <div className="text-2xl font-bold text-slate-100 mt-2">
              {seg.count.toLocaleString()}
            </div>
            <div className="text-kiro-orange text-xs mt-1">
              {seg.percentage.toFixed(1)}%
            </div>
            <div className="text-slate-500 text-[10px] mt-2">
              {TIER_DESCRIPTIONS[seg.tier]}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 6: Verify build**

```bash
npx next build
```

Expected: Build succeeds with all pages rendered.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx app/users/ app/trends/ app/credits/ app/engagement/
git commit -m "feat: add all dashboard pages — overview, users, trends, credits, engagement"
```

---

## Task 11: Docker Configuration

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create multi-stage Dockerfile**

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 2: Create docker-compose.yml**

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  dashboard:
    build: .
    ports:
      - '3000:3000'
    environment:
      - AWS_REGION=us-east-1
      - ATHENA_DATABASE=kiro_reports
      - ATHENA_OUTPUT_BUCKET=kiro-athena-results
      - GLUE_TABLE_NAME=
      - IDENTITY_STORE_ID=
      - COGNITO_CLIENT_ID=
      - COGNITO_CLIENT_SECRET=
      - COGNITO_ISSUER=
      - NEXTAUTH_URL=http://localhost:3000
      - NEXTAUTH_SECRET=dev-secret-change-in-production
```

- [ ] **Step 3: Verify Docker build**

```bash
docker build -t kiro-dashboard .
```

Expected: Build succeeds, image ~150MB.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "feat: add Docker multi-stage build and docker-compose for local dev"
```

---

## Task 12: CDK Infrastructure — NetworkStack

**Files:**
- Create: `infra/package.json`
- Create: `infra/tsconfig.json`
- Create: `infra/cdk.json`
- Create: `infra/bin/app.ts`
- Create: `infra/lib/network-stack.ts`

- [ ] **Step 1: Initialize CDK project**

```bash
mkdir -p infra/bin infra/lib
```

Create `infra/package.json`:

```json
{
  "name": "kiro-dashboard-infra",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "cdk": "cdk"
  },
  "dependencies": {
    "aws-cdk-lib": "^2.170.0",
    "constructs": "^10.4.2"
  },
  "devDependencies": {
    "typescript": "~5.6.0",
    "aws-cdk": "^2.170.0"
  }
}
```

Create `infra/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["es2020"],
    "declaration": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "outDir": "cdk.out",
    "rootDir": ".",
    "skipLibCheck": true
  },
  "include": ["bin/**/*.ts", "lib/**/*.ts"]
}
```

Create `infra/cdk.json`:

```json
{
  "app": "npx ts-node bin/app.ts",
  "context": {
    "useExistingVpc": "false",
    "vpcId": "",
    "vpcCidr": "10.254.0.0/16"
  }
}
```

- [ ] **Step 2: Install CDK dependencies**

```bash
cd /home/ec2-user/my-project/kiro-dashboard/infra && npm install
```

- [ ] **Step 3: Create NetworkStack**

Create `infra/lib/network-stack.ts`:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const useExisting = this.node.tryGetContext('useExistingVpc') === 'true';

    if (useExisting) {
      const vpcId = this.node.tryGetContext('vpcId');
      this.vpc = ec2.Vpc.fromLookup(this, 'VPC', { vpcId });
    } else {
      const newVpc = new ec2.Vpc(this, 'VPC', {
        ipAddresses: ec2.IpAddresses.cidr('10.254.0.0/16'),
        maxAzs: 2,
        natGateways: 1,
        subnetConfiguration: [
          {
            cidrMask: 24,
            name: 'Public',
            subnetType: ec2.SubnetType.PUBLIC,
          },
          {
            cidrMask: 24,
            name: 'Private',
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          },
        ],
      });
      cdk.Tags.of(newVpc).add('Name', 'mgmt-vpc');

      const ssmSg = new ec2.SecurityGroup(this, 'SSMSecurityGroup', {
        vpc: newVpc,
        description: 'SSM VPC Endpoints - HTTPS from VPC CIDR',
        allowAllOutbound: true,
      });
      ssmSg.addIngressRule(
        ec2.Peer.ipv4('10.254.0.0/16'),
        ec2.Port.tcp(443),
        'HTTPS from VPC CIDR'
      );

      new ec2.InterfaceVpcEndpoint(this, 'SSMEndpoint', {
        vpc: newVpc,
        service: ec2.InterfaceVpcEndpointAwsService.SSM,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [ssmSg],
        privateDnsEnabled: true,
      });

      new ec2.InterfaceVpcEndpoint(this, 'SSMMessagesEndpoint', {
        vpc: newVpc,
        service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [ssmSg],
        privateDnsEnabled: true,
      });

      new ec2.InterfaceVpcEndpoint(this, 'EC2MessagesEndpoint', {
        vpc: newVpc,
        service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [ssmSg],
        privateDnsEnabled: true,
      });

      this.vpc = newVpc;
    }

    new cdk.CfnOutput(this, 'VPCId', {
      value: this.vpc.vpcId,
      exportName: `${this.stackName}-VPC-ID`,
    });
  }
}
```

- [ ] **Step 4: Commit**

```bash
cd /home/ec2-user/my-project/kiro-dashboard
git add infra/package.json infra/package-lock.json infra/tsconfig.json infra/cdk.json infra/lib/network-stack.ts
git commit -m "feat: add CDK NetworkStack — VPC with new/existing support, SSM endpoints"
```

---

## Task 13: CDK Infrastructure — SecurityStack

**Files:**
- Create: `infra/lib/security-stack.ts`

- [ ] **Step 1: Create SecurityStack**

Create `infra/lib/security-stack.ts`:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface SecurityStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class SecurityStack extends cdk.Stack {
  public readonly albSg: ec2.SecurityGroup;
  public readonly ecsSg: ec2.SecurityGroup;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly taskRole: iam.Role;
  public readonly executionRole: iam.Role;

  constructor(scope: Construct, id: string, props: SecurityStackProps) {
    super(scope, id, props);

    const cloudFrontPrefixListId = new cdk.CfnParameter(
      this,
      'CloudFrontPrefixListId',
      {
        type: 'String',
        description: 'CloudFront origin-facing managed prefix list ID',
      }
    );

    this.albSg = new ec2.SecurityGroup(this, 'ALBSecurityGroup', {
      vpc: props.vpc,
      securityGroupName: `${this.stackName}-ALB-SG`,
      description: 'ALB SG - CloudFront origin-facing only',
      allowAllOutbound: true,
    });

    new ec2.CfnSecurityGroupIngress(this, 'ALBIngressFromCloudFront', {
      groupId: this.albSg.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 80,
      toPort: 80,
      sourcePrefixListId: cloudFrontPrefixListId.valueAsString,
      description: 'HTTP from CloudFront origin-facing only',
    });

    this.ecsSg = new ec2.SecurityGroup(this, 'ECSSecurityGroup', {
      vpc: props.vpc,
      securityGroupName: `${this.stackName}-ECS-SG`,
      description: 'ECS SG - ALB traffic only',
      allowAllOutbound: true,
    });
    this.ecsSg.addIngressRule(this.albSg, ec2.Port.tcp(3000), 'Next.js from ALB');

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'kiro-dashboard-users',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.userPoolClient = this.userPool.addClient('DashboardClient', {
      userPoolClientName: 'kiro-dashboard-client',
      generateSecret: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: ['http://localhost:3000/api/auth/callback/cognito'],
        logoutUrls: ['http://localhost:3000'],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
    });

    const domain = this.userPool.addDomain('CognitoDomain', {
      cognitoDomain: {
        domainPrefix: `kiro-dashboard-${this.account}`,
      },
    });

    this.taskRole = new iam.Role(this, 'TaskRole', {
      roleName: `${this.stackName}-Task-Role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonAthenaFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSGlueConsoleFullAccess'),
      ],
      inlinePolicies: {
        IdentityStoreRead: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['identitystore:ListUsers', 'identitystore:DescribeUser'],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    this.executionRole = new iam.Role(this, 'ExecutionRole', {
      roleName: `${this.stackName}-Execution-Role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        ),
      ],
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: `${this.stackName}-UserPool-ID`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      exportName: `${this.stackName}-UserPoolClient-ID`,
    });

    new cdk.CfnOutput(this, 'CognitoIssuer', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`,
      exportName: `${this.stackName}-Cognito-Issuer`,
    });

    new cdk.CfnOutput(this, 'CognitoDomain', {
      value: domain.baseUrl(),
      exportName: `${this.stackName}-Cognito-Domain`,
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add infra/lib/security-stack.ts
git commit -m "feat: add CDK SecurityStack — SGs, Cognito, IAM roles"
```

---

## Task 14: CDK Infrastructure — EcsStack

**Files:**
- Create: `infra/lib/ecs-stack.ts`

- [ ] **Step 1: Create EcsStack**

Create `infra/lib/ecs-stack.ts`:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

interface EcsStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  albSg: ec2.SecurityGroup;
  ecsSg: ec2.SecurityGroup;
  taskRole: iam.Role;
  executionRole: iam.Role;
}

export class EcsStack extends cdk.Stack {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly service: ecs.FargateService;
  public readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    this.repository = new ecr.Repository(this, 'Repository', {
      repositoryName: 'kiro-dashboard',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: 'kiro-dashboard-cluster',
      vpc: props.vpc,
    });

    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/ecs/kiro-dashboard',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: 512,
      memoryLimitMiB: 1024,
      taskRole: props.taskRole,
      executionRole: props.executionRole,
    });

    taskDef.addContainer('NextJsContainer', {
      image: ecs.ContainerImage.fromEcrRepository(this.repository, 'latest'),
      portMappings: [{ containerPort: 3000 }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'kiro-dashboard',
        logGroup,
      }),
      environment: {
        AWS_REGION: this.region,
        ATHENA_DATABASE: 'kiro_reports',
        ATHENA_OUTPUT_BUCKET: 'kiro-athena-results',
        GLUE_TABLE_NAME: '',
        IDENTITY_STORE_ID: '',
        NEXTAUTH_URL: '',
      },
      healthCheck: {
        command: ['CMD-SHELL', 'wget -q --spider http://localhost:3000/api/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    const customSecret = `${this.stackName}-secret-${this.account}`;

    this.alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      loadBalancerName: 'kiro-dashboard-alb',
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.albSg,
      idleTimeout: cdk.Duration.seconds(120),
    });

    const listener = this.alb.addListener('Listener80', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.fixedResponse(403, {
        contentType: 'text/plain',
        messageBody: 'Access Denied',
      }),
    });

    this.service = new ecs.FargateService(this, 'Service', {
      serviceName: 'kiro-dashboard-service',
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      securityGroups: [props.ecsSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      targetGroupName: 'kiro-dashboard-tg',
      vpc: props.vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/api/health',
        port: '3000',
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    targetGroup.addTarget(this.service);

    listener.addAction('ForwardWithSecret', {
      priority: 1,
      conditions: [
        elbv2.ListenerCondition.httpHeader('X-Custom-Secret', [customSecret]),
      ],
      action: elbv2.ListenerAction.forward([targetGroup]),
    });

    const scaling = this.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 4,
    });
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    new cdk.CfnOutput(this, 'ALBEndpoint', {
      value: `http://${this.alb.loadBalancerDnsName}`,
      exportName: `${this.stackName}-ALB-DNS`,
    });

    new cdk.CfnOutput(this, 'ECRRepositoryUri', {
      value: this.repository.repositoryUri,
      exportName: `${this.stackName}-ECR-URI`,
    });

    new cdk.CfnOutput(this, 'CustomHeaderSecret', {
      value: customSecret,
      exportName: `${this.stackName}-Custom-Secret`,
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add infra/lib/ecs-stack.ts
git commit -m "feat: add CDK EcsStack — Fargate service, ALB, auto scaling, ECR"
```

---

## Task 15: CDK Infrastructure — CdnStack & App Entry

**Files:**
- Create: `infra/lib/cdn-stack.ts`
- Create: `infra/bin/app.ts`

- [ ] **Step 1: Create CdnStack**

Create `infra/lib/cdn-stack.ts`:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

interface CdnStackProps extends cdk.StackProps {
  alb: elbv2.ApplicationLoadBalancer;
  customSecret: string;
}

export class CdnStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: CdnStackProps) {
    super(scope, id, props);

    const albOrigin = new origins.HttpOrigin(props.alb.loadBalancerDnsName, {
      httpPort: 80,
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
      readTimeout: cdk.Duration.seconds(60),
      customHeaders: {
        'X-Custom-Secret': props.customSecret,
      },
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Kiro Analytics Dashboard',
      defaultBehavior: {
        origin: albOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
    });

    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'Dashboard URL',
      exportName: `${this.stackName}-CloudFront-URL`,
    });
  }
}
```

- [ ] **Step 2: Create CDK app entry point**

Create `infra/bin/app.ts`:

```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { SecurityStack } from '../lib/security-stack';
import { EcsStack } from '../lib/ecs-stack';
import { CdnStack } from '../lib/cdn-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-2',
};

const networkStack = new NetworkStack(app, 'KiroDashboardNetwork', {
  env,
  description: 'Kiro Dashboard - VPC and networking',
});

const securityStack = new SecurityStack(app, 'KiroDashboardSecurity', {
  env,
  description: 'Kiro Dashboard - Security groups, Cognito, IAM',
  vpc: networkStack.vpc,
});

const ecsStack = new EcsStack(app, 'KiroDashboardEcs', {
  env,
  description: 'Kiro Dashboard - ECS Fargate, ALB, Auto Scaling',
  vpc: networkStack.vpc,
  albSg: securityStack.albSg,
  ecsSg: securityStack.ecsSg,
  taskRole: securityStack.taskRole,
  executionRole: securityStack.executionRole,
});

const customSecret = `KiroDashboardEcs-secret-${env.account}`;

new CdnStack(app, 'KiroDashboardCdn', {
  env,
  description: 'Kiro Dashboard - CloudFront distribution',
  alb: ecsStack.alb,
  customSecret,
});

app.synth();
```

- [ ] **Step 3: Verify CDK synth**

```bash
cd /home/ec2-user/my-project/kiro-dashboard/infra && npx cdk synth --all 2>&1 | head -20
```

Expected: Outputs CloudFormation YAML for all 4 stacks (or context lookup errors if no AWS credentials — that's acceptable).

- [ ] **Step 4: Commit**

```bash
cd /home/ec2-user/my-project/kiro-dashboard
git add infra/lib/cdn-stack.ts infra/bin/app.ts
git commit -m "feat: add CDK CdnStack and app entry — CloudFront distribution, 4-stack composition"
```

---

## Task 16: Build Verification & Final Commit

- [ ] **Step 1: Verify Next.js build**

```bash
cd /home/ec2-user/my-project/kiro-dashboard && npx next build
```

Expected: Build succeeds with all 7 routes.

- [ ] **Step 2: Verify Docker build**

```bash
docker build -t kiro-dashboard .
```

Expected: Build succeeds.

- [ ] **Step 3: Run health check locally**

```bash
docker run -d --name kiro-test -p 3000:3000 \
  -e NEXTAUTH_URL=http://localhost:3000 \
  -e NEXTAUTH_SECRET=test-secret \
  kiro-dashboard

sleep 5
curl -s http://localhost:3000/api/health
docker stop kiro-test && docker rm kiro-test
```

Expected: `{"status":"ok"}`

- [ ] **Step 4: Verify CDK TypeScript compiles**

```bash
cd /home/ec2-user/my-project/kiro-dashboard/infra && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Final commit if any unstaged changes remain**

```bash
cd /home/ec2-user/my-project/kiro-dashboard
git add -A
git status
```

If there are changes:

```bash
git commit -m "chore: final build verification cleanup"
```
