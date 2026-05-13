# kiro-dashboard

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.1.0-purple.svg)]()
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)]()
[![AWS CDK](https://img.shields.io/badge/AWS_CDK-TypeScript-orange.svg)]()
[![English](https://img.shields.io/badge/lang-English-blue.svg)](#english)
[![한국어](https://img.shields.io/badge/lang-한국어-red.svg)](#한국어)

**EN** Kiro IDE user analytics dashboard with AI-powered analysis on AWS
**KR** AWS 기반 AI 분석 기능을 갖춘 Kiro IDE 사용자 분석 대시보드

---

# English

## Overview

kiro-dashboard is a full-stack analytics platform that visualizes Kiro IDE usage data. It queries user activity reports stored in S3 via Athena, renders interactive charts with Recharts, and provides natural language analysis powered by Amazon Bedrock Claude Sonnet 4.6. The dashboard is deployed on ECS Fargate behind CloudFront and ALB with Cognito authentication.

### Dashboard Overview

![Dashboard Overview](screenshot/dashboard01.png)

### User Activity and Leaderboard

![Users](screenshot/user.png)

### User Detail Drill-down

![User Detail](screenshot/user-detail.png)

### Daily Trends

![Trends](screenshot/trends.png)

### IDE Productivity Metrics

![IDE Productivity](screenshot/ide_productivity.png)

### Engagement Segmentation

![Engagement](screenshot/engagement.png)

### AI-Powered Natural Language Analysis

![AI Analysis](screenshot/AI_analytics.png)

## Features

- **Real-time Usage Analytics** — Track users, messages, conversations, credits, and overage across configurable time periods (1 minute to 90 days)
- **IDE Productivity Metrics** — Analyze inline completion rates, AI code lines, chat interactions, dev agent usage, and code review findings from the 46-column legacy report
- **Identity Center Integration** — Map all IdC users to display names, emails, and organizations with active/inactive status tracking
- **AI-Powered Analysis** — Ask natural language questions about Kiro data; Claude Sonnet 4.6 autonomously generates Athena SQL, executes queries, and produces Korean markdown reports
- **User Detail Drill-down** — Click any user row to see daily activity breakdown, client type usage, and conversation history in a slide-in panel
- **Animated Kiro Mascot** — Page-themed Kiro ghost character with eye-blinking, bouncing, and contextual accessories (dashboard grid, trend arrows, code terminal, chat bubbles)
- **Bilingual Interface** — Full Korean/English toggle with sidebar language switcher
- **Lambda@Edge Authentication** — CDN-level Cognito PKCE authentication via Lambda@Edge; no auth logic in the app
- **Data Masking** — Server-side masking of all user identifiers (names, emails, organizations) showing only first 2 characters
- **Model Usage Analysis** — Per-model message distribution (Auto, Claude Opus, Claude Sonnet), daily trends, Auto vs manual selection ratio, and user model preference table via S3 direct CSV parsing

## Prerequisites

- Node.js >= 18
- Docker (for container builds)
- AWS CLI v2 (configured with appropriate credentials)
- AWS CDK CLI (`npm install -g aws-cdk`)
- AWS Account with access to: ECS, ECR, CloudFront, ALB, Athena, Glue, S3, Cognito, IAM Identity Center, Bedrock
- **Kiro IDE "User Activity Report" enabled** for your account — the dashboard queries the CSV files that this report drops into S3. Enable it in the Kiro console (see [Viewing per-user activity](https://kiro.dev/docs/enterprise/monitor-and-track/user-activity/)). Without it the Glue table exists but is empty and every page renders as an empty table.

## Installation

```bash
# Clone the repository
git clone https://github.com/whchoi98/kiro-dashboard.git
cd kiro-dashboard

# Install frontend dependencies
npm install

# Install CDK dependencies
cd infra && npm install && cd ..

# Copy environment file and configure
cp .env.example .env.local
# Edit .env.local with your AWS configuration
```

## Usage

```bash
# Start local development server
npm run dev
# Open http://localhost:3000

# Build for production
npm run build

# Deploy to AWS (first time)
# 1) Copy the deploy-time env template and fill in your values
cp .env.deploy.example .env.deploy
# edit .env.deploy — set CDK_DEFAULT_ACCOUNT, ATHENA_DATA_BUCKET_NAME,
# S3_REPORT_PREFIX, IDENTITY_STORE_ID, ATHENA_RESULTS_BUCKET_NAME, ...
# (every override is documented in .env.deploy.example itself and the
# "Configuration" section below)

# 2) Load it into your shell, then deploy
set -a; source .env.deploy; set +a
cd infra
npx cdk bootstrap
npx cdk deploy --all
# Setting ATHENA_DATA_BUCKET_NAME also triggers the opt-in
# `KiroDashboardCatalog` stack which registers the `titanlog.user_report`
# Glue table over your S3 prefix — a fresh account now boots without a
# manual Glue crawler. `.env.deploy` is git-ignored so your account
# values never get committed.

# Build and push Docker image
docker build -t kiro-dashboard .
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin <account>.dkr.ecr.ap-northeast-2.amazonaws.com
docker tag kiro-dashboard:latest <account>.dkr.ecr.ap-northeast-2.amazonaws.com/kiro-dashboard:latest
docker push <account>.dkr.ecr.ap-northeast-2.amazonaws.com/kiro-dashboard:latest

# Force ECS service update
aws ecs update-service --cluster kiro-dashboard-cluster \
  --service <service-name> --force-new-deployment
```

## Configuration

### Runtime container env (ECS task)

These values end up on the Fargate container via `EcsStack`. Maintainer
defaults are baked in; forks override them by exporting the CDK-time env
vars listed in the next table before running `npx cdk deploy`.

| Container variable | Description | Default |
|----------|-------------|---------|
| `AWS_REGION` | AWS region for Athena/Glue/Identity Store | `us-east-1` |
| `ATHENA_DATABASE` | Glue database name | `titanlog` |
| `ATHENA_OUTPUT_BUCKET` | S3 path for Athena query results | `s3://whchoi01-titan-q-log/athena-results/` |
| `GLUE_TABLE_NAME` | Primary Glue table name | `user_report` |
| `IDENTITY_STORE_ID` | IAM Identity Center store ID | `d-90663be888` |
| `S3_REPORT_PREFIX` | S3 prefix for user_report CSV files | `q-user-log/AWSLogs/.../user_report/us-east-1/` |

### CDK-time overrides (read by `infra/bin/app.ts`)

Export these before `npx cdk deploy` to point the stack at your own
account. Omit them to keep the upstream maintainer defaults.

| CDK env | Overrides | Also used by |
|---------|-----------|--------------|
| `ATHENA_DATA_BUCKET_NAME` | S3 bucket holding Kiro User Activity Report CSV files | Enables the opt-in `KiroDashboardCatalog` stack |
| `ATHENA_RESULTS_BUCKET_NAME` | Bucket that Athena writes query results into | — |
| `ATHENA_RESULTS_PREFIX` | Prefix within the results bucket | — |
| `ATHENA_DATABASE_NAME` | Glue database name | `KiroDashboardCatalog` |
| `GLUE_TABLE_NAME_OVERRIDE` | Glue table name | `KiroDashboardCatalog` |
| `S3_REPORT_PREFIX` | S3 prefix under the data bucket | `KiroDashboardCatalog` |
| `IDENTITY_STORE_ID` | IAM Identity Center store ID | — |

When `ATHENA_DATA_BUCKET_NAME` is set, a 6th CDK stack —
`KiroDashboardCatalog` — is instantiated. It creates the Glue database
and the `user_report` external table with the 11 fixed columns documented
in `docs/kiro-user-activity-report-schema.md`. If you'd rather manage the
catalog outside CDK, the same DDL lives in
`infra/sql/user-report-table.sql` (substitute `<DATA_BUCKET>` /
`<REPORT_PREFIX>` and run in Athena).

### Empty-state behaviour

Until the first User Activity Report CSV lands in your S3 prefix, every
page renders as an **empty table** instead of a 500 error page. Routes
detect the underlying "missing table / empty data" signal and return a
200 with a well-shaped empty payload.

## Project Structure

```
app/                        Next.js App Router
  api/                      12 API routes
    analyze/                Bedrock AI analysis (SSE streaming)
    metrics/                KPI aggregations
    users/                  User rankings with IdC details
    trends/                 Daily activity trends
    credits/                Credit usage analysis
    engagement/             User segmentation and funnel
    productivity/           IDE productivity metrics
    idc-users/              Identity Center user status
    user-detail/            Per-user activity drill-down
    client-dist/            Client type distribution
    model-usage/            AI model usage analysis (S3 direct read)
    health/                 ECS health check
  components/               Shared React components
    layout/                 Sidebar (with logout), Header, KiroLogo
    charts/                 MetricCard, TrendChart, PieChart, BarChart, FunnelChart, IdcUserStatus
    tables/                 UserTable (sortable, searchable)
    ui/                     KiroIcon, KiroMascot, DateRangePicker, UserDetailPanel
  analyze/                  AI analysis chat page
  users/                    User activity page
  credits/                  Credit usage page
  trends/                   Activity trends page
  engagement/               Engagement metrics page
  productivity/             IDE productivity page
  model-usage/              AI model usage analysis page
lib/                        Shared libraries
  athena.ts                 Athena query client + NORMALIZE_USERID
  glue.ts                   Glue table resolver
  identity.ts               Identity Center user resolver (with masking)
  mask.ts                   Data masking utilities
  i18n.tsx                  Korean/English i18n context
types/                      TypeScript interfaces
  dashboard.ts              All data model types
infra/                      AWS CDK infrastructure
  bin/app.ts                CDK app entry (5 stacks)
  lib/network-stack.ts      VPC (new or existing mgmt-vpc)
  lib/security-stack.ts     Security groups, Cognito, EdgeAuthClient
  lib/ecs-stack.ts          ECS Fargate, ALB, ECR, IAM, Auto Scaling
  lib/cdn-stack.ts          CloudFront + Lambda@Edge + SSM config
  lambda/edge-auth/         Lambda@Edge Cognito auth (PKCE + JWT)
public/                     Static assets
  kiro-logo.svg             Kiro ghost character SVG
docs/                       Architecture, ADRs, specs
```

## Testing

```bash
# Run project structure tests
bash tests/run-all.sh

# Verify Next.js build
npm run build

# Verify CDK synthesis
cd infra && npx cdk synth --all

# Test Docker build
docker build -t kiro-dashboard .

# Test health endpoint
curl http://localhost:3000/api/health
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/add-new-chart`)
3. Commit changes (`git commit -m 'feat: add new chart component'`)
4. Push to the branch (`git push origin feat/add-new-chart`)
5. Open a Pull Request

Follow [Conventional Commits](https://www.conventionalcommits.org/) format:
- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `chore:` maintenance

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contact

- Maintainer: WooHyung Choi / [whchoi98](https://github.com/whchoi98)
- Issues: [GitHub Issues](https://github.com/whchoi98/kiro-dashboard/issues)

---

# 한국어

## 개요

kiro-dashboard는 Kiro IDE 사용 데이터를 시각화하는 풀스택 분석 플랫폼입니다. S3에 저장된 사용자 활동 리포트를 Athena로 쿼리하고, Recharts로 인터랙티브 차트를 렌더링하며, Amazon Bedrock Claude Sonnet 4.6으로 자연어 분석 기능을 제공합니다. 대시보드는 CloudFront와 ALB 뒤의 ECS Fargate에 배포되며, Cognito 인증을 사용합니다.

### 대시보드 개요

![대시보드 개요](screenshot/dashboard01.png)

### 사용자 활동 및 리더보드

![사용자](screenshot/user.png)

### 사용자 상세 드릴다운

![사용자 상세](screenshot/user-detail.png)

### 일별 트렌드

![트렌드](screenshot/trends.png)

### IDE 생산성 메트릭

![IDE 생산성](screenshot/ide_productivity.png)

### 참여도 세그먼트

![참여도](screenshot/engagement.png)

### AI 기반 자연어 분석

![AI 분석](screenshot/AI_analytics.png)

## 주요 기능

- **실시간 사용 분석** — 사용자, 메시지, 대화, 크레딧, 초과 크레딧을 1분~90일 범위로 추적합니다
- **IDE 생산성 메트릭** — 46개 컬럼 레거시 리포트에서 인라인 수락률, AI 코드 라인, 채팅, Dev Agent, 코드 리뷰를 분석합니다
- **Identity Center 통합** — 모든 IdC 사용자를 이름, 이메일, 소속으로 매핑하고 활성/비활성 상태를 추적합니다
- **AI 기반 분석** — Kiro 데이터에 대한 자연어 질문을 처리합니다. Claude Sonnet 4.6이 Athena SQL을 자율 생성하고 실행하여 한국어 마크다운 리포트를 생성합니다
- **사용자 상세 드릴다운** — 사용자 행 클릭 시 일별 활동 내역, 클라이언트 유형별 사용량, 대화 이력을 슬라이드 패널로 확인합니다
- **애니메이션 Kiro 마스코트** — 페이지별 테마에 맞는 Kiro 유령 캐릭터가 눈 깜빡임, 바운스, 상황별 액세서리(대시보드 그리드, 트렌드 화살표, 코드 터미널, 채팅 말풍선)를 표시합니다
- **이중 언어 인터페이스** — 사이드바 언어 전환기를 통한 한국어/영어 완전 지원
- **Lambda@Edge 인증** — CDN 레벨 Cognito PKCE 인증 (Lambda@Edge), 앱 내 인증 로직 없음
- **데이터 마스킹** — 모든 사용자 식별자(이름, 이메일, 소속)를 서버 측에서 마스킹하여 첫 2글자만 표시
- **모델 사용 분석** — 모델별 메시지 분포(Auto, Claude Opus, Claude Sonnet), 일별 트렌드, Auto vs 수동 선택 비율, 사용자별 모델 선호도 테이블 (S3 CSV 직접 파싱)

## 사전 요구 사항

- Node.js >= 18
- Docker (컨테이너 빌드용)
- AWS CLI v2 (적절한 자격 증명으로 설정)
- AWS CDK CLI (`npm install -g aws-cdk`)
- AWS 계정: ECS, ECR, CloudFront, ALB, Athena, Glue, S3, Cognito, IAM Identity Center, Bedrock 접근 권한 필요
- **Kiro IDE "User Activity Report" 활성화 필요** — 대시보드는 이 리포트가 S3에 떨어뜨리는 CSV 파일을 조회합니다. Kiro 콘솔에서 활성화하세요 ([Viewing per-user activity](https://kiro.dev/docs/enterprise/monitor-and-track/user-activity/)). 활성화 전에는 Glue 테이블은 존재해도 데이터가 없어 모든 페이지가 빈 표로 렌더링됩니다.

## 설치 방법

```bash
# 저장소 복제
git clone https://github.com/whchoi98/kiro-dashboard.git
cd kiro-dashboard

# 프론트엔드 의존성 설치
npm install

# CDK 의존성 설치
cd infra && npm install && cd ..

# 환경 파일 복사 및 설정
cp .env.example .env.local
# .env.local을 AWS 설정에 맞게 편집합니다
```

## 사용법

```bash
# 로컬 개발 서버 시작
npm run dev
# http://localhost:3000 접속

# 프로덕션 빌드
npm run build

# AWS에 배포 (최초)
# 1) 배포용 환경 템플릿을 복사하고 값을 채웁니다
cp .env.deploy.example .env.deploy
# .env.deploy 편집 — CDK_DEFAULT_ACCOUNT, ATHENA_DATA_BUCKET_NAME,
# S3_REPORT_PREFIX, IDENTITY_STORE_ID, ATHENA_RESULTS_BUCKET_NAME 등
# (모든 오버라이드는 .env.deploy.example 파일과 아래 "환경 설정"
# 섹션에 문서화되어 있음)

# 2) 셸에 로드한 뒤 배포
set -a; source .env.deploy; set +a
cd infra
npx cdk bootstrap
npx cdk deploy --all
# `ATHENA_DATA_BUCKET_NAME`을 설정하면 옵트-인 스택인
# `KiroDashboardCatalog`도 생성되어 `titanlog.user_report` Glue 테이블이
# 자신의 S3 프리픽스 위에 등록됩니다. 별도 Glue 크롤러 없이 바로
# 동작합니다. `.env.deploy`는 git 추적에서 제외되므로 계정별 값이
# 커밋되지 않습니다.

# Docker 이미지 빌드 및 푸시
docker build -t kiro-dashboard .
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin <계정>.dkr.ecr.ap-northeast-2.amazonaws.com
docker tag kiro-dashboard:latest <계정>.dkr.ecr.ap-northeast-2.amazonaws.com/kiro-dashboard:latest
docker push <계정>.dkr.ecr.ap-northeast-2.amazonaws.com/kiro-dashboard:latest

# ECS 서비스 강제 업데이트
aws ecs update-service --cluster kiro-dashboard-cluster \
  --service <서비스명> --force-new-deployment
```

## 환경 설정

### 런타임 컨테이너 환경 변수 (ECS task)

이 값들은 `EcsStack`을 통해 Fargate 컨테이너에 주입됩니다. 메인테이너
기본값이 내장되어 있으며, 포크는 아래 "CDK 배포 시 오버라이드" 섹션의
환경 변수를 `npx cdk deploy` 실행 전에 export하여 덮어씁니다.

| 컨테이너 변수 | 설명 | 기본값 |
|--------|------|--------|
| `AWS_REGION` | Athena/Glue/Identity Store AWS 리전 | `us-east-1` |
| `ATHENA_DATABASE` | Glue 데이터베이스 이름 | `titanlog` |
| `ATHENA_OUTPUT_BUCKET` | Athena 쿼리 결과 S3 경로 | `s3://whchoi01-titan-q-log/athena-results/` |
| `GLUE_TABLE_NAME` | 기본 Glue 테이블 이름 | `user_report` |
| `IDENTITY_STORE_ID` | IAM Identity Center 스토어 ID | `d-90663be888` |
| `S3_REPORT_PREFIX` | user_report CSV 파일 S3 경로 프리픽스 | `q-user-log/AWSLogs/.../user_report/us-east-1/` |

### CDK 배포 시 오버라이드 (`infra/bin/app.ts`가 읽음)

자신의 계정을 대상으로 배포할 때 다음 변수를 `npx cdk deploy` 전에
export 하세요. 지정하지 않으면 업스트림 메인테이너 기본값이 유지됩니다.

| CDK 환경 변수 | 덮어쓰는 대상 | 추가 효과 |
|---------|-----------|--------------|
| `ATHENA_DATA_BUCKET_NAME` | Kiro User Activity Report CSV가 있는 S3 버킷 | 옵트-인 스택 `KiroDashboardCatalog` 활성화 |
| `ATHENA_RESULTS_BUCKET_NAME` | Athena가 쿼리 결과를 쓰는 버킷 | — |
| `ATHENA_RESULTS_PREFIX` | 결과 버킷 내 프리픽스 | — |
| `ATHENA_DATABASE_NAME` | Glue 데이터베이스 이름 | `KiroDashboardCatalog` |
| `GLUE_TABLE_NAME_OVERRIDE` | Glue 테이블 이름 | `KiroDashboardCatalog` |
| `S3_REPORT_PREFIX` | 데이터 버킷 내 프리픽스 | `KiroDashboardCatalog` |
| `IDENTITY_STORE_ID` | IAM Identity Center 스토어 ID | — |

`ATHENA_DATA_BUCKET_NAME`을 설정하면 6번째 CDK 스택인
`KiroDashboardCatalog`가 인스턴스화됩니다. 이 스택은
`docs/kiro-user-activity-report-schema.md`에 정의된 11개 고정 컬럼으로
Glue 데이터베이스와 `user_report` 외부 테이블을 생성합니다. 카탈로그를
CDK 바깥에서 관리하고 싶다면 동일한 DDL이
`infra/sql/user-report-table.sql`에 있으니 `<DATA_BUCKET>` /
`<REPORT_PREFIX>`를 치환해 Athena에서 직접 실행하면 됩니다.

### 데이터 없음(empty-state) 동작

User Activity Report CSV가 S3에 도착하기 전까지는 500 에러 페이지 대신
각 페이지가 **빈 표**로 렌더링됩니다. API 라우트가 "테이블 없음 / 데이터
없음" 시그널을 감지해 200 + 올바른 shape의 빈 payload를 반환합니다.

## 프로젝트 구조

```
app/                        Next.js App Router
  api/                      12개 API 라우트
    analyze/                Bedrock AI 분석 (SSE 스트리밍)
    metrics/                KPI 집계
    users/                  IdC 정보 포함 사용자 순위
    trends/                 일별 활동 추이
    credits/                크레딧 사용 분석
    engagement/             사용자 세그먼트 및 퍼널
    productivity/           IDE 생산성 메트릭
    idc-users/              Identity Center 사용자 상태
    user-detail/            개별 사용자 활동 드릴다운
    client-dist/            클라이언트 유형별 분포
    model-usage/            AI 모델 사용 분석 (S3 직접 읽기)
    health/                 ECS 헬스 체크
  components/               공유 React 컴포넌트
    layout/                 사이드바 (로그아웃 포함), 헤더, Kiro 로고
    charts/                 MetricCard, TrendChart, PieChart, BarChart, FunnelChart, IdcUserStatus
    tables/                 UserTable (정렬, 검색 가능)
    ui/                     KiroIcon, KiroMascot, DateRangePicker, UserDetailPanel
  analyze/                  AI 분석 채팅 페이지
  users/                    사용자 활동 페이지
  credits/                  크레딧 사용 페이지
  trends/                   활동 트렌드 페이지
  engagement/               참여도 메트릭 페이지
  productivity/             IDE 생산성 페이지
  model-usage/              AI 모델 사용 분석 페이지
lib/                        공유 라이브러리
  athena.ts                 Athena 쿼리 클라이언트 + NORMALIZE_USERID
  glue.ts                   Glue 테이블 리졸버
  identity.ts               Identity Center 사용자 리졸버 (마스킹 포함)
  mask.ts                   데이터 마스킹 유틸리티
  i18n.tsx                  한국어/영어 i18n 컨텍스트
types/                      TypeScript 인터페이스
  dashboard.ts              전체 데이터 모델 타입
infra/                      AWS CDK 인프라
  bin/app.ts                CDK 앱 엔트리 (5개 스택)
  lib/network-stack.ts      VPC (신규 또는 기존 mgmt-vpc)
  lib/security-stack.ts     보안 그룹, Cognito, EdgeAuthClient
  lib/ecs-stack.ts          ECS Fargate, ALB, ECR, IAM, 오토 스케일링
  lib/cdn-stack.ts          CloudFront + Lambda@Edge + SSM 설정
  lambda/edge-auth/         Lambda@Edge Cognito 인증 (PKCE + JWT)
public/                     정적 에셋
  kiro-logo.svg             Kiro 유령 캐릭터 SVG
docs/                       아키텍처, ADR, 스펙
```

## 테스트

```bash
# 프로젝트 구조 테스트 실행
bash tests/run-all.sh

# Next.js 빌드 확인
npm run build

# CDK 합성 확인
cd infra && npx cdk synth --all

# Docker 빌드 테스트
docker build -t kiro-dashboard .

# 헬스 엔드포인트 테스트
curl http://localhost:3000/api/health
```

## 기여 방법

1. 저장소를 포크합니다
2. 기능 브랜치를 생성합니다 (`git checkout -b feat/add-new-chart`)
3. 변경 사항을 커밋합니다 (`git commit -m 'feat: add new chart component'`)
4. 브랜치에 푸시합니다 (`git push origin feat/add-new-chart`)
5. Pull Request를 생성합니다

[Conventional Commits](https://www.conventionalcommits.org/) 형식을 따릅니다:
- `feat:` 새로운 기능
- `fix:` 버그 수정
- `docs:` 문서
- `chore:` 유지보수

## 라이선스

이 프로젝트는 MIT 라이선스에 따라 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하십시오.

## 연락처

- 메인테이너: 최우형 / [whchoi98](https://github.com/whchoi98)
- 이슈: [GitHub Issues](https://github.com/whchoi98/kiro-dashboard/issues)

<!-- harness-eval-badge:start -->
![Harness Score](https://img.shields.io/badge/harness-6.5%2F10-orange)
![Harness Grade](https://img.shields.io/badge/grade-C+-orange)
![Last Eval](https://img.shields.io/badge/eval-2026--04--22-blue)
<!-- harness-eval-badge:end -->
