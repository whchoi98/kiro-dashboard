# Architecture — kiro-dashboard

[![English](#english)](#english) [![한국어](#한국어)](#한국어)

---

## English

### System Overview

kiro-dashboard is a full-stack analytics platform that collects Kiro IDE user activity data stored in S3, processes it through AWS Glue/Athena, and presents it through a Next.js 14 dashboard with AI-powered insights via Amazon Bedrock. The application is containerized with Docker and deployed on ECS Fargate behind CloudFront.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Users (Browser)                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Amazon CloudFront (CDN)                          │
│               KiroDashboardCdn Stack                                │
│   ┌───────────────────────────────────────────────┐                │
│   │  Lambda@Edge (Viewer Request)                  │                │
│   │  - Validates Cognito JWT (id_token cookie)     │                │
│   │  - Redirects to Cognito Hosted UI if invalid   │                │
│   │  - Injects X-User-Email, X-User-Name headers  │                │
│   │  - Config from SSM Parameter Store (us-east-1) │                │
│   └───────────────────────────────────────────────┘                │
│   - Injects X-Custom-Secret header → ALB                           │
│   - Caches static assets, blocks direct ALB access                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP + X-Custom-Secret + User Headers
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Application Load Balancer (ALB)                       │
│               KiroDashboardEcs Stack                                │
│   - Listener Rule: forward only if X-Custom-Secret matches         │
│   - Default: 403 Forbidden (blocks direct access)                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│               ECS Fargate — Next.js 14 App                         │
│               KiroDashboardEcs Stack                                │
│   ┌─────────────────────────────────────────────────────┐          │
│   │  Next.js App Router                                  │          │
│   │  ┌──────────────┐  ┌──────────────┐                 │          │
│   │  │  Pages       │  │  API Routes  │                 │          │
│   │  │  /users      │  │  /api/metrics│                 │          │
│   │  │  /credits    │  │  /api/users  │                 │          │
│   │  │  /trends     │  │  /api/trends │                 │          │
│   │  │  /analyze    │  │  /api/analyze│                 │          │
│   │  │             │  │  /api/health │  ← ECS health  │          │
│   │  └──────────────┘  └──────┬───────┘                 │          │
│   │                           │                          │          │
│   │  lib/                     │                          │          │
│   │  ┌─────────────────────────────────────────────────┐│          │
│   │  │ athena.ts │ glue.ts │ identity.ts │ mask.ts     ││          │
│   │  └─────────────────────────────────────────────────┘│          │
│   └─────────────────────────────────────────────────────┘          │
└──────┬───────────┬───────────┬───────────┬──────────────────────────┘
       │           │           │           │
       ▼           ▼           ▼           ▼
┌──────────┐ ┌─────────┐ ┌─────────┐ ┌──────────────────┐
│  Athena  │ │  Glue   │ │   S3    │ │  IAM Identity    │
│ (query)  │ │(catalog)│ │(data +  │ │  Center (IdC)    │
│          │ │         │ │results) │ │  IdentityStore   │
└──────────┘ └─────────┘ └─────────┘ └──────────────────┘
       │           │                  ┌──────────────────┐
       └─────┬─────┘                  │  Cognito         │
             ▼                        │  User Pool       │
      ┌─────────────┐                │  (Hosted UI)     │
      │   Bedrock   │                └──────────────────┘
      │  (Claude)   │
      │  AI analyze │
      └─────────────┘
```

### CDK Stack Composition

| Stack | Name | Region | Key Resources |
|-------|------|--------|---------------|
| Network | `KiroDashboardNetwork` | ap-northeast-2 | VPC, public/private subnets, NAT |
| Security | `KiroDashboardSecurity` | ap-northeast-2 | ALB SG, ECS SG, Cognito User Pool, EdgeAuthClient |
| ECS | `KiroDashboardEcs` | ap-northeast-2 | ECR, ECS Cluster, Fargate Task, ALB |
| CDN | `KiroDashboardCdn` | ap-northeast-2 | CloudFront + Lambda@Edge + SSM config + Cognito callback |
| EdgeLambda | `KiroDashboardEdgeLambda` | us-east-1 | Lambda@Edge function (auto-generated by CDK) |

### Data Flow Summary

```
Kiro IDE telemetry → S3 (raw logs) → Glue Crawler → Glue Catalog (user_report)
→ Athena SQL → Next.js API Routes → React Dashboard → User
```

AI analysis path:
```
User question → /api/analyze → Bedrock (Claude) streaming → SSE to browser
```

### Key Design Decisions

1. **CloudFront + custom header secret** — The ALB is not publicly accessible. CloudFront injects a secret HTTP header; the ALB listener rule forwards only requests with the correct header. This prevents direct ALB access without WAF costs.

2. **ECS Fargate over Lambda** — Next.js App Router with server components and streaming responses requires a persistent container. Fargate avoids Lambda cold starts and the 15-minute timeout limit for Bedrock streaming.

3. **Athena for analytics** — User activity data is already in S3 as Kiro telemetry. Athena queries S3 directly via Glue catalog with no ETL pipeline needed, minimizing operational overhead.

4. **UserId normalization** — IAM Identity Center prefixes userIDs with `d-<store-id>.`. The `REGEXP_REPLACE` normalization in all SQL ensures consistent user identity across tables.

5. **Two date formats** — `user_report` uses `YYYY-MM-DD` (standard ISO); `by_user_analytic` uses `MM-DD-YYYY` (legacy). All queries must account for this difference.

6. **Dark-only UI** — The dashboard targets internal developer/ops audiences. A single dark theme reduces maintenance burden vs light/dark switching.

7. **Lambda@Edge + Cognito PKCE** — Authentication moved from NextAuth.js (in-app) to Lambda@Edge (CDN layer). All requests are authenticated before reaching the origin. Uses PKCE flow with a public Cognito client (no client secret) to avoid Lambda@Edge environment variable limitations. Config is stored in SSM Parameter Store (us-east-1) and cached on cold start.

8. **Data masking** — All user identifiers (displayName, email, username, organization) are server-side masked via `lib/mask.ts` before reaching the browser. Shows first 2 characters with `*` padding. Applied at the `resolveUserDetails()` layer so all API consumers get masked data automatically.

9. **S3 direct read for model usage** — The `user_report` CSV files contain dynamic `{Model_name}_Messages` columns (e.g., `auto_messages`, `claude_opus_4.6_messages`) that vary across files. Since the Glue table uses `OpenCSVSerDe` (positional mapping), these dynamic columns cannot be queried via Athena. The `/api/model-usage` endpoint reads S3 CSV files directly and parses headers to extract model data accurately.

### Operations

See `docs/runbooks/` for operational procedures.

---

## 한국어

### 시스템 개요

kiro-dashboard는 Kiro IDE 사용자 활동 데이터를 S3에 수집하고, AWS Glue/Athena로 처리하며, Next.js 14 대시보드로 시각화하고 Amazon Bedrock으로 AI 인사이트를 제공하는 풀스택 분석 플랫폼입니다. Docker 컨테이너로 패키징되어 ECS Fargate에 CloudFront 뒤에 배포됩니다.

### 아키텍처 다이어그램

위 [영문 섹션의 ASCII 다이어그램](#architecture-diagram)을 참고하세요.

### CDK 스택 구성

| 스택 | 이름 | 리전 | 주요 리소스 |
|------|------|------|------------|
| 네트워크 | `KiroDashboardNetwork` | ap-northeast-2 | VPC, 퍼블릭/프라이빗 서브넷, NAT |
| 보안 | `KiroDashboardSecurity` | ap-northeast-2 | ALB SG, ECS SG, Cognito User Pool, EdgeAuthClient |
| ECS | `KiroDashboardEcs` | ap-northeast-2 | ECR, ECS 클러스터, Fargate 태스크, ALB |
| CDN | `KiroDashboardCdn` | ap-northeast-2 | CloudFront + Lambda@Edge + SSM 설정 + Cognito 콜백 |
| EdgeLambda | `KiroDashboardEdgeLambda` | us-east-1 | Lambda@Edge 함수 (CDK 자동 생성) |

### 데이터 흐름 요약

```
Kiro IDE 텔레메트리 → S3 (원시 로그) → Glue 크롤러 → Glue 카탈로그 (user_report)
→ Athena SQL → Next.js API 라우트 → React 대시보드 → 사용자
```

AI 분석 경로:
```
사용자 질문 → /api/analyze → Bedrock (Claude) 스트리밍 → SSE → 브라우저
```

### 주요 설계 결정

1. **CloudFront + 커스텀 헤더 시크릿** — ALB는 공개적으로 접근 불가. CloudFront가 시크릿 HTTP 헤더를 주입하고 ALB 리스너 규칙이 올바른 헤더가 있는 요청만 전달합니다. WAF 비용 없이 직접 ALB 접근을 차단합니다.

2. **ECS Fargate (Lambda 대신)** — Next.js App Router의 서버 컴포넌트와 스트리밍 응답은 영구 컨테이너가 필요합니다. Fargate는 Lambda 콜드 스타트와 15분 타임아웃 제한을 피할 수 있습니다.

3. **분석용 Athena** — 사용자 활동 데이터는 이미 S3에 Kiro 텔레메트리로 존재합니다. Athena는 ETL 파이프라인 없이 Glue 카탈로그를 통해 S3를 직접 쿼리하여 운영 부담을 최소화합니다.

4. **UserId 정규화** — IAM Identity Center는 사용자 ID에 `d-<스토어-id>.` 접두사를 붙입니다. 모든 SQL의 `REGEXP_REPLACE` 정규화로 테이블 간 일관된 사용자 식별이 가능합니다.

5. **두 가지 날짜 형식** — `user_report`는 `YYYY-MM-DD`(표준 ISO), `by_user_analytic`는 `MM-DD-YYYY`(레거시) 형식을 사용합니다. 모든 쿼리에서 이 차이를 반드시 처리해야 합니다.

6. **다크 전용 UI** — 대시보드는 내부 개발자/운영팀을 대상으로 합니다. 단일 다크 테마로 라이트/다크 전환 대비 유지보수 부담을 줄입니다.

7. **Lambda@Edge + Cognito PKCE** — 인증을 NextAuth.js(앱 내)에서 Lambda@Edge(CDN 레이어)로 이전했습니다. 모든 요청은 오리진에 도달하기 전에 인증됩니다. Lambda@Edge 환경변수 제한을 피하기 위해 공개 Cognito 클라이언트(시크릿 없음)와 PKCE 플로우를 사용합니다. 설정은 SSM Parameter Store(us-east-1)에 저장되며 콜드 스타트 시 캐싱됩니다.

8. **데이터 마스킹** — 모든 사용자 식별자(displayName, email, username, organization)는 `lib/mask.ts`를 통해 브라우저에 전달되기 전 서버 측에서 마스킹됩니다. 첫 2글자만 표시하고 나머지는 `*`로 처리합니다. `resolveUserDetails()` 레이어에서 적용되어 모든 API 소비자가 자동으로 마스킹된 데이터를 받습니다.

9. **모델 사용 분석 S3 직접 읽기** — `user_report` CSV 파일에는 동적 `{Model_name}_Messages` 컬럼(예: `auto_messages`, `claude_opus_4.6_messages`)이 파일마다 다른 위치에 포함됩니다. Glue 테이블이 `OpenCSVSerDe`(위치 기반 매핑)를 사용하므로 Athena로는 정확한 쿼리가 불가능합니다. `/api/model-usage` 엔드포인트는 S3 CSV를 직접 읽고 헤더를 파싱하여 모델 데이터를 정확히 추출합니다.

### 운영

운영 절차는 `docs/runbooks/`를 참고하세요.
