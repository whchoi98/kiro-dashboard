# Kiro User Analytics Dashboard — Design Spec

## Overview

Next.js 기반 Kiro 사용자 분석 대시보드. CloudFront → ALB → ECS Fargate 인프라로 mgmt-vpc에 배포. Athena/Glue/S3에서 사용자 활동 데이터를 조회하여 시각화한다.

**참조 레포:**
- [sample-kiro-user-analytics-dashboard](https://github.com/aws-samples/sample-kiro-user-analytics-dashboard) — 대시보드 기능/데이터 모델
- [ec2_vscode/infra-cdk](https://github.com/whchoi98/ec2_vscode/tree/main/infra-cdk) — CloudFront + ALB 보안 패턴

## Architecture

```
User (HTTPS) → CloudFront → ALB (HTTP:80, X-Custom-Secret) → ECS Fargate (Next.js:3000)
                                                                ├─ Pages: Dashboard UI
                                                                ├─ API Routes: /api/*
                                                                └─ AWS SDK: Athena, Glue, S3, Identity Center
```

### CDK Stacks (4개)

| Stack | Resources |
|---|---|
| **NetworkStack** | VPC (new 10.254.0.0/16 or existing lookup), Public/Private subnets x2 AZ, NAT Gateway x1, SSM VPC Endpoints |
| **SecurityStack** | ALB-SG (CloudFront prefix list only), ECS-SG (ALB → port 3000), Cognito User Pool + App Client, IAM Task Role (Athena/Glue/S3/IdentityStore read), IAM Execution Role (ECR pull, CloudWatch logs) |
| **EcsStack** | ECS Cluster, Fargate Service (min:1, max:4, CPU target 70%), ALB + Listener + Target Group (X-Custom-Secret header validation, default 403), ECR Repository, CloudWatch Log Group |
| **CdnStack** | CloudFront Distribution (HTTPS redirect, cache disabled, X-Custom-Secret header injection, ALL_VIEWER origin request policy) |

### VPC Flexibility

- 신규 생성: CDK 기본값, `10.254.0.0/16`, `Name: mgmt-vpc`
- 기존 사용: CDK context `useExistingVpc=true`, `vpcId=vpc-xxx`, `vpcCidr=10.x.x.x/16`

### Security Layers

1. **CloudFront → ALB**: `X-Custom-Secret` 커스텀 헤더 검증. ALB default action은 403 반환. 헤더 일치 시만 forward.
2. **ALB → ECS**: Security Group으로 ALB 트래픽만 허용 (port 3000)
3. **Cognito**: NextAuth.js Cognito Provider로 사용자 로그인 필수. 미인증 시 `/login` 리다이렉트.

## Project Structure

```
kiro-dashboard/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (dark theme, Kiro branding, auth provider)
│   ├── page.tsx                  # Dashboard main page (Overview)
│   ├── users/page.tsx            # Users section
│   ├── trends/page.tsx           # Trends section
│   ├── credits/page.tsx          # Credits section
│   ├── engagement/page.tsx       # Engagement section
│   ├── login/page.tsx            # Cognito login page
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts  # NextAuth.js + Cognito
│   │   ├── health/route.ts       # ECS health check endpoint
│   │   ├── metrics/route.ts      # Overview KPI aggregations
│   │   ├── users/route.ts        # User list & top users
│   │   ├── trends/route.ts       # Daily activity trends
│   │   ├── credits/route.ts      # Credit usage analysis
│   │   └── engagement/route.ts   # Engagement segmentation & funnel
│   └── components/
│       ├── layout/
│       │   ├── Sidebar.tsx       # Kiro-branded sidebar navigation
│       │   ├── Header.tsx        # Top bar with user info + refresh
│       │   └── KiroLogo.tsx      # Kiro SVG logo component
│       ├── charts/
│       │   ├── MetricCard.tsx    # KPI summary cards (5 types)
│       │   ├── TrendChart.tsx    # Daily activity stacked bar (Recharts)
│       │   ├── PieChart.tsx      # Client distribution donut chart
│       │   ├── BarChart.tsx      # Top users horizontal bar / credit bars
│       │   └── FunnelChart.tsx   # Engagement conversion funnel
│       ├── tables/
│       │   └── UserTable.tsx     # Filterable user activity table
│       └── ui/
│           └── KiroIcon.tsx      # Kiro icon variants (orange K logo)
├── lib/
│   ├── athena.ts                 # Athena query client (execute, poll, parse)
│   ├── glue.ts                   # Glue GetTables → table name resolver
│   ├── identity.ts               # Identity Center → username batch resolver
│   └── auth.ts                   # NextAuth config (Cognito provider)
├── types/
│   └── dashboard.ts              # All TypeScript interfaces
├── public/
│   └── kiro-logo.svg             # Kiro brand asset
├── Dockerfile                    # Multi-stage (deps → build → runner)
├── docker-compose.yml            # Local development
├── next.config.js                # standalone output
├── tailwind.config.ts            # Dark theme config
├── tsconfig.json
├── package.json
├── infra/
│   ├── bin/app.ts                # CDK app entry (4 stacks)
│   ├── lib/
│   │   ├── network-stack.ts      # VPC, subnets, NAT, VPC endpoints
│   │   ├── security-stack.ts     # SGs, Cognito, IAM roles
│   │   ├── ecs-stack.ts          # ECS cluster, Fargate, ALB, TG, auto scaling
│   │   └── cdn-stack.ts          # CloudFront distribution
│   ├── cdk.json
│   ├── package.json
│   └── tsconfig.json
```

## Data Model

### Source Record (Athena)

```typescript
interface UserReport {
  date: string;                    // YYYY-MM-DD
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
```

### Aggregated Types

```typescript
interface OverviewMetrics {
  totalUsers: number;
  totalMessages: number;
  totalConversations: number;
  totalCredits: number;
  totalOverageCredits: number;
  changeRates: Record<string, number>;  // vs previous period %
}

interface DailyTrend {
  date: string;
  messages: number;
  conversations: number;
  credits: number;
  activeUsers: number;
}

interface ClientDistribution {
  clientType: string;
  messageCount: number;
  creditCount: number;
  percentage: number;
}

interface TopUser {
  userid: string;
  username: string;      // resolved via Identity Center
  totalMessages: number;
  totalCredits: number;
  rank: number;
}

type EngagementTier = 'Power' | 'Active' | 'Light' | 'Idle';
// Power:  >=100 messages OR >=20 conversations
// Active: >=20 messages  OR >=5 conversations
// Light:  >=1 message
// Idle:   No activity

interface EngagementSegment {
  tier: EngagementTier;
  count: number;
  percentage: number;
}

interface FunnelStep {
  label: string;
  count: number;
  percentage: number;
  conversionRate: number;
}
```

## API Routes

| Endpoint | Method | Query Params | Response | Athena Query Pattern |
|---|---|---|---|---|
| `/api/health` | GET | — | `{ status: 'ok' }` | None |
| `/api/metrics` | GET | `?days=30` | `OverviewMetrics` | `SUM/COUNT DISTINCT` aggregation, current vs previous period |
| `/api/users` | GET | `?days=30&limit=10` | `TopUser[]` | `GROUP BY userid ORDER BY total_messages DESC` |
| `/api/trends` | GET | `?days=30` | `DailyTrend[]` | `GROUP BY date ORDER BY date` |
| `/api/credits` | GET | `?days=30` | `{ topUsers, baseVsOverage, byTier }` | Multiple: per-user, ratio, tier breakdown |
| `/api/engagement` | GET | `?days=30` | `{ segments, funnel }` | `CASE WHEN` tier classification + funnel steps |

All API routes require NextAuth session. Unauthenticated requests return 401.

### Caching Strategy

- **API responses**: `unstable_cache` with 5-minute TTL and tag-based revalidation
- **Username resolution**: 1-hour TTL (Identity Center data rarely changes)
- **Manual refresh**: Client calls `POST /api/revalidate` → `revalidateTag('dashboard')`

## Dashboard UI

### Visual Style

- **Theme**: Dark Analytics — background `#0a0e1a`, cards `#1e293b`, borders `#334155`
- **Accent colors**: Kiro Orange `#f97316` (primary), Indigo `#6366f1`, Cyan `#0ea5e9`, Violet `#a78bfa`, Pink `#ec4899`
- **Kiro icon**: Orange rounded-rect with white K lettermark. Used in: sidebar logo, KPI card icons, favicon, loading states
- **Charts**: Recharts library, dark theme presets, gradient fills
- **Typography**: system-ui font stack, Tailwind CSS utility classes

### Pages

**Overview (/)** — Main dashboard
- 5x KPI MetricCards (Users, Messages, Conversations, Credits, Overage)
- Daily Activity Trends stacked bar chart (2/3 width)
- Client Distribution donut chart (1/3 width)
- Top 10 Users horizontal bar chart (1/2 width)
- Engagement Funnel (1/2 width)

**Users (/users)**
- Top 10 leaderboard with medal badges
- User Activity Timeline (last activity recency, active days)
- Filterable detail table (multi-select category, recency bins)

**Trends (/trends)**
- 4-panel subplot: messages, conversations, credits, active users by day
- Client Type breakdown line charts with markers

**Credits (/credits)**
- Top 15 users by credit consumption bar chart
- Base vs Overage donut chart
- Monthly pivot table by user
- Subscription tier comparison bars

**Engagement (/engagement)**
- Segment pie chart (Power/Active/Light/Idle) with category definitions
- 5-stage conversion funnel with percentages
- Segment detail cards

### Sidebar Navigation

Fixed left sidebar (220px), dark background. Kiro logo + title at top. 5 nav items with icons. Authenticated user display at bottom.

## Containerization

### Dockerfile

```
Stage 1 (deps):    node:20-alpine, npm ci
Stage 2 (builder): next build (standalone output)
Stage 3 (runner):  node:20-alpine, copy standalone + static + public, node server.js
```

- Output mode: `next.config.js` → `output: 'standalone'`
- Final image: ~150MB
- Port: 3000

### ECS Fargate Task

| Setting | Value |
|---|---|
| CPU | 512 (0.5 vCPU) |
| Memory | 1024 MB |
| Min tasks | 1 |
| Max tasks | 4 |
| Auto Scaling target | CPU average 70% |
| Health check path | `/api/health` |
| Health check interval | 30s |
| Healthy threshold | 2 |
| Unhealthy threshold | 3 |

### Environment Variables

From CDK stack outputs (plain):
```
AWS_REGION, ATHENA_DATABASE, ATHENA_OUTPUT_BUCKET,
GLUE_TABLE_NAME, IDENTITY_STORE_ID, NEXTAUTH_URL
```

From Secrets Manager:
```
COGNITO_CLIENT_ID, COGNITO_CLIENT_SECRET, COGNITO_ISSUER, NEXTAUTH_SECRET
```

## Deployment Order

```
1. docker build -t kiro-dashboard . && docker push → ECR
2. cdk deploy NetworkStack
3. cdk deploy SecurityStack    (depends: NetworkStack)
4. cdk deploy EcsStack          (depends: NetworkStack, SecurityStack)
5. cdk deploy CdnStack          (depends: EcsStack)
```

Output: CloudFront URL (`https://dxxxxx.cloudfront.net`)
