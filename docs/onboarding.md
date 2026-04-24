# Developer Onboarding — kiro-dashboard

[![English](#english)](#english) [![한국어](#한국어)](#한국어)

---

## English

### Overview

kiro-dashboard is a Next.js 14 analytics dashboard for Kiro IDE usage data. It queries AWS Athena (backed by S3 + Glue), uses Amazon Bedrock for AI analysis, and is deployed on ECS Fargate behind CloudFront.

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20+ | https://nodejs.org |
| npm | 10+ | bundled with Node.js |
| Docker | 24+ | https://docs.docker.com/get-docker/ |
| AWS CLI | v2 | https://aws.amazon.com/cli/ |
| AWS CDK | 2.x | `npm install -g aws-cdk` |
| TypeScript | 5+ | included in devDependencies |

### Quick Start

```bash
# 1. Clone / navigate to project
cd /home/ec2-user/my-project/kiro-dashboard

# 2. Install dependencies
npm install

# 3. Set up local environment
cp .env.example .env.local
# Edit .env.local with your AWS credentials and config values

# 4. Start local development server
npm run dev
# Open http://localhost:3000
```

### Environment Variables

See `.env.example` for all required variables. Key ones:

| Variable | Description | Where to find |
|----------|-------------|---------------|
| `AWS_REGION` | Athena/Glue/Bedrock region | Use `us-east-1` |
| `ATHENA_DATABASE` | Glue database name | `titanlog` |
| `ATHENA_OUTPUT_BUCKET` | S3 path for query results | Team shared bucket |
| `GLUE_TABLE_NAME` | Primary Glue table | `user_report` |
| `IDENTITY_STORE_ID` | IAM Identity Center store ID | AWS console → IAM Identity Center |

### Project Structure Walkthrough

```
app/api/          API route handlers — connect to Athena/Bedrock/IdC/S3
app/components/   React UI components (charts, tables, layout)
app/*/page.tsx    Dashboard pages (users, credits, trends, etc.)
lib/              AWS SDK clients (athena.ts, glue.ts, identity.ts, mask.ts)
types/            TypeScript interfaces for all data shapes
infra/            AWS CDK stacks (network, security, ecs, cdn, edge-lambda)
```

Read each directory's `CLAUDE.md` for detailed conventions.

### Key Conventions to Know

1. **SQL columns are lowercase** — all Athena queries use lowercase column names
2. **UserId normalization** — always use `NORMALIZE_USERID` from `lib/athena.ts`, not raw `userid`
3. **Date formats differ** — `user_report` uses `YYYY-MM-DD`; `by_user_analytic` uses `MM-DD-YYYY`
4. **i18n required** — all user-facing strings go through `useLanguage()` from `lib/i18n.tsx`
5. **Dark theme only** — use `bg-black`, `bg-gray-900/50`, `text-white`; brand purple is `#9046FF`

### Running Tests

```bash
# TypeScript type check
npx tsc --noEmit

# ESLint
npm run lint

# Project structure tests
bash tests/run-all.sh

# Docker build test
docker build -t kiro-dashboard .
```

### Deploying

See `docs/architecture.md` for the full deployment architecture.
See `.claude/skills/release/SKILL.md` for the step-by-step deploy procedure.

Quick deploy (app code only):
```bash
npm run build
docker build -t kiro-dashboard .
# Push to ECR, then:
aws ecs update-service --cluster kiro-dashboard-cluster \
  --service kiro-dashboard-service --force-new-deployment --region ap-northeast-2
```

### Getting Help

- Architecture questions → `docs/architecture.md`
- API conventions → `app/api/CLAUDE.md`
- Component patterns → `app/components/CLAUDE.md`
- CDK / infra → `infra/CLAUDE.md`
- Operational issues → `docs/runbooks/`

---

## 한국어

### 개요

kiro-dashboard는 Kiro IDE 사용 데이터를 위한 Next.js 14 분석 대시보드입니다. AWS Athena(S3 + Glue 백엔드)로 데이터를 쿼리하고, Amazon Bedrock으로 AI 분석을 제공하며, CloudFront 뒤 ECS Fargate에 배포됩니다.

### 필수 도구

| 도구 | 버전 | 설치 방법 |
|------|------|-----------|
| Node.js | 20+ | https://nodejs.org |
| npm | 10+ | Node.js에 포함 |
| Docker | 24+ | https://docs.docker.com/get-docker/ |
| AWS CLI | v2 | https://aws.amazon.com/cli/ |
| AWS CDK | 2.x | `npm install -g aws-cdk` |
| TypeScript | 5+ | devDependencies에 포함 |

### 빠른 시작

```bash
# 1. 프로젝트 디렉토리로 이동
cd /home/ec2-user/my-project/kiro-dashboard

# 2. 의존성 설치
npm install

# 3. 로컬 환경 설정
cp .env.example .env.local
# .env.local 파일을 AWS 자격증명과 설정값으로 편집

# 4. 개발 서버 시작
npm run dev
# http://localhost:3000 접속
```

### 주요 컨벤션

1. **SQL 컬럼명은 소문자** — 모든 Athena 쿼리에서 소문자 컬럼명 사용
2. **UserId 정규화** — raw `userid` 대신 `lib/athena.ts`의 `NORMALIZE_USERID` 사용
3. **날짜 형식 차이** — `user_report`는 `YYYY-MM-DD`, `by_user_analytic`는 `MM-DD-YYYY`
4. **i18n 필수** — 모든 UI 텍스트는 `lib/i18n.tsx`의 `useLanguage()` 사용
5. **다크 테마 전용** — `bg-black`, `bg-gray-900/50`, `text-white` 사용; 브랜드 색상은 `#9046FF`

### 도움말

- 아키텍처 질문 → `docs/architecture.md`
- API 컨벤션 → `app/api/CLAUDE.md`
- 컴포넌트 패턴 → `app/components/CLAUDE.md`
- CDK/인프라 → `infra/CLAUDE.md`
- 운영 이슈 → `docs/runbooks/`
