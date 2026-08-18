# Developer Onboarding — kiro-dashboard

<a href="#english"><img src="https://img.shields.io/badge/lang-English-blue.svg" alt="English"></a>
<a href="#korean"><img src="https://img.shields.io/badge/lang-한국어-red.svg" alt="Korean"></a>

---

<a id="english"></a>

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
| TypeScript | 6+ | included in devDependencies |

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
app/manifest.ts   PWA manifest
lib/              AWS SDK clients + shared utils (athena, glue, identity, mask, uar-s3, i18n, theme, chart-theme, query-cache, athena-window, freshness, first-seen, idc-users, table-sort, version, … — see lib/CLAUDE.md for the full 25-module table)
types/            TypeScript interfaces for all data shapes
public/           Static assets (kiro-logo.svg, icon PNGs)
infra/            AWS CDK stacks (network, security, ecs, cdn, edge-lambda, opt-in catalog)
```

Read each directory's `CLAUDE.md` for detailed conventions.

### Key Conventions to Know

1. **SQL columns are lowercase** — all Athena queries use lowercase column names
2. **UserId normalization** — always use `NORMALIZE_USERID` from `lib/athena.ts`, not raw `userid`
3. **Date formats differ** — `user_report` uses `YYYY-MM-DD`; `by_user_analytic` uses `MM-DD-YYYY`
4. **i18n required** — all user-facing strings go through `useI18n()` from `lib/i18n.tsx`
5. **Components are written dark-first** — use `bg-black`, `bg-gray-900/50`, `text-white`; light mode comes free via the `html.light` palette override, so never add `dark:`/`light:` variants. Brand purple `#9046FF` uses arbitrary values, which never invert. See ADR-0005 (Accepted).

### Running Tests

`npx jest` is the test gate for this project (33+ suites — structure, lib, api, infra). `bash tests/run-all.sh` runs shell-based structure checks only (hooks, secret patterns, plugin structure); it does not replace `npx jest`. `npm run lint` does not work — there is no ESLint config committed, so `next lint` hangs on an interactive prompt. Use build + jest instead, as `docs/runbooks/production-deploy.md` documents:

```bash
# TypeScript / build check
npm run build

# Full test suite (structure, lib, api, infra — 33+ suites)
npx jest

# Shell-based structure checks only
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
# Push to ECR, then force a new deployment (the service name is
# CDK-generated — look it up rather than hardcoding):
SERVICE=$(aws ecs list-services --cluster kiro-dashboard-cluster \
  --region ap-northeast-2 --query 'serviceArns[0]' --output text)
aws ecs update-service --cluster kiro-dashboard-cluster \
  --service "$SERVICE" --force-new-deployment --region ap-northeast-2
```

### Getting Help

- Architecture questions → `docs/architecture.md`
- API conventions → `app/api/CLAUDE.md`
- Component patterns → `app/components/CLAUDE.md`
- CDK / infra → `infra/CLAUDE.md`
- Operational issues → `docs/runbooks/`

---

<a id="korean"></a>

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
| TypeScript | 6+ | devDependencies에 포함 |

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

### 환경 변수

필수 변수 전체 목록은 `.env.example`을 참고합니다. 주요 변수는 다음과 같습니다.

| 변수 | 설명 | 확인 방법 |
|------|------|-----------|
| `AWS_REGION` | Athena/Glue/Bedrock 리전 | `us-east-1` 사용 |
| `ATHENA_DATABASE` | Glue 데이터베이스 이름 | `titanlog` |
| `ATHENA_OUTPUT_BUCKET` | 쿼리 결과용 S3 경로 | 팀 공유 버킷 |
| `GLUE_TABLE_NAME` | 기본 Glue 테이블 | `user_report` |
| `IDENTITY_STORE_ID` | IAM Identity Center 스토어 ID | AWS 콘솔 → IAM Identity Center |

### 프로젝트 구조 살펴보기

```
app/api/          API 라우트 핸들러 — Athena/Bedrock/IdC/S3 연동
app/components/   React UI 컴포넌트 (차트, 테이블, 레이아웃)
app/*/page.tsx    대시보드 페이지 (users, credits, trends 등)
app/manifest.ts   PWA manifest
lib/              AWS SDK 클라이언트 + 공유 유틸 (athena, glue, identity, mask, uar-s3, i18n, theme, chart-theme, query-cache, athena-window, freshness, first-seen, idc-users, table-sort, version 등 — 전체 25개 모듈 표는 lib/CLAUDE.md 참고)
types/            모든 데이터 형태에 대한 TypeScript 인터페이스
public/           정적 자산 (kiro-logo.svg, 아이콘 PNG)
infra/            AWS CDK 스택 (network, security, ecs, cdn, edge-lambda, opt-in catalog)
```

세부 컨벤션은 각 디렉토리의 `CLAUDE.md`를 참고합니다.

### 주요 컨벤션

1. **SQL 컬럼명은 소문자** — 모든 Athena 쿼리에서 소문자 컬럼명 사용
2. **UserId 정규화** — raw `userid` 대신 `lib/athena.ts`의 `NORMALIZE_USERID` 사용
3. **날짜 형식 차이** — `user_report`는 `YYYY-MM-DD`, `by_user_analytic`는 `MM-DD-YYYY`
4. **i18n 필수** — 모든 UI 텍스트는 `lib/i18n.tsx`의 `useI18n()` 사용
5. **컴포넌트는 다크 우선(dark-first)으로 작성합니다** — `bg-black`, `bg-gray-900/50`, `text-white`를 사용합니다. `html.light` 팔레트 오버라이드를 통해 라이트 모드가 자동으로 적용되므로 `dark:`/`light:` 변형(variant)을 추가하지 않습니다. 브랜드 색상 `#9046FF`는 arbitrary value를 사용하므로 반전되지 않습니다. ADR-0005(Accepted) 참고.

### 테스트 실행

이 프로젝트의 테스트 게이트는 `npx jest`입니다 (33개 이상의 스위트 — structure, lib, api, infra). `bash tests/run-all.sh`는 셸 기반 구조 검사만 실행합니다 (hooks, secret patterns, plugin structure); `npx jest`를 대체하지 않습니다. `npm run lint`는 동작하지 않습니다 — 커밋된 ESLint 설정이 없어 `next lint`가 대화형 프롬프트에서 멈춥니다. `docs/runbooks/production-deploy.md`에 문서화된 대로 build + jest를 사용합니다.

```bash
# TypeScript / 빌드 검사
npm run build

# 전체 테스트 스위트 (structure, lib, api, infra — 33개 이상)
npx jest

# 셸 기반 구조 검사만 실행
bash tests/run-all.sh

# Docker 빌드 테스트
docker build -t kiro-dashboard .
```

### 배포

전체 배포 아키텍처는 `docs/architecture.md`를 참고합니다.
단계별 배포 절차는 `.claude/skills/release/SKILL.md`를 참고합니다.

빠른 배포 (애플리케이션 코드만):
```bash
npm run build
docker build -t kiro-dashboard .
# ECR에 푸시한 다음 새 배포를 강제 실행합니다 (서비스 이름은
# CDK가 생성하므로 하드코딩 대신 조회합니다):
SERVICE=$(aws ecs list-services --cluster kiro-dashboard-cluster \
  --region ap-northeast-2 --query 'serviceArns[0]' --output text)
aws ecs update-service --cluster kiro-dashboard-cluster \
  --service "$SERVICE" --force-new-deployment --region ap-northeast-2
```

### 도움말

- 아키텍처 질문 → `docs/architecture.md`
- API 컨벤션 → `app/api/CLAUDE.md`
- 컴포넌트 패턴 → `app/components/CLAUDE.md`
- CDK/인프라 → `infra/CLAUDE.md`
- 운영 이슈 → `docs/runbooks/`
