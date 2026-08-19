# 스펙: /infra-cost — 대시보드 인프라 자원·상태·비용 메뉴

- 날짜: 2026-08-19
- 상태: 설계 승인됨 (상태 소스 = 실시간 IAM 추가, 비용 = 정적 단가 추정, CloudWatch 지표 포함)
- 신규: 15번째 페이지, 20번째 API 라우트. **이 메뉴는 Kiro 데이터가 아니라 대시보드
  자신의 인프라를 보여준다** — 일일 리포트 캐시 전제가 적용되지 않는 유일한 페이지
  (`/ingest-health`와 같은 부류로, 조회는 캐시 없이 실시간).

## 1. IAM (선행 — `infra/lib/ecs-stack.ts` 태스크 롤에 `InfraReadOnly` 인라인 정책)

전부 읽기 전용. 리소스 스코프 가능한 것은 스코프:

| 액션 | 리소스 | 용도 |
|---|---|---|
| `ecs:DescribeClusters`, `ecs:ListServices`, `ecs:DescribeServices`, `ecs:ListTasks`, `ecs:DescribeTasks` | `cluster/kiro-dashboard-cluster`, `service/kiro-dashboard-cluster/*`, `task/kiro-dashboard-cluster/*` ARN | 서비스 desired/running, 배포 rollout, 태스크 상태 |
| `elasticloadbalancing:DescribeLoadBalancers`, `DescribeTargetGroups`, `DescribeTargetHealth` | `*` (Describe는 리소스 레벨 미지원) | ALB 상태·타겟 건강 |
| `cloudfront:ListDistributions`, `cloudfront:GetDistribution` | `*` | 배포 상태 (오리진 도메인 == ALB DNS로 매칭 — 교차스택 순환 의존을 피하는 방법) |
| `ecr:DescribeRepositories`, `ecr:DescribeImages` | `repository/kiro-dashboard` ARN | 최신 이미지 pushedAt·크기, 저장소 용량 |
| `cloudwatch:GetMetricData` | `*` (리소스 레벨 미지원) | 지표 |

**배포 함의**: IAM 변경 = CDK `KiroDashboardEcs` 배포 필요. `cdk diff`로 Path 판정
(X-Custom-Secret 회전이 뜨면 런북대로 **Ecs+Cdn 동시** 배포 — Trap 참조).

## 2. API — `GET /api/infra` (`app/api/infra/route.ts`)

- 리전 클라이언트: **ap-northeast-2**(ECS·ELBv2·ECR·CloudWatch), **us-east-1**
  (CloudFront + CloudFront 지표용 CloudWatch — CloudFront 지표는 us-east-1에만 존재)
- 캐시 없음 (상태는 실시간). 소스별 독립 try/catch — 실패한 자원만
  `status: 'unknown'` + `note`, 페이지는 절대 안 깨짐 (기존 missing-table 저하 철학)
- 조회 흐름 (전부 병렬):
  1. ECS: `ListServices(cluster)` → 첫 서비스 → `DescribeServices` (desired/running/
     rolloutState) — 서비스명은 CDK 생성명이라 목록에서 발견
  2. ALB: `DescribeLoadBalancers(Names=['kiro-dashboard-alb'])` → state, DNS →
     `DescribeTargetGroups(LoadBalancerArn)` → `DescribeTargetHealth` (healthy/total)
  3. CloudFront: `ListDistributions` → Origins에 ALB DNS 포함하는 배포 → status/enabled/domainName
  4. ECR: `DescribeRepositories` + `DescribeImages(imageTag='latest')` → pushedAt, imageSizeInBytes, 이미지 수
  5. CloudWatch `GetMetricData` (apne2, 최근 1h, period 300):
     `AWS/ECS` CPUUtilization·MemoryUtilization Avg {ClusterName, ServiceName},
     `AWS/ApplicationELB` RequestCount Sum·TargetResponseTime Avg {LoadBalancer=ARN에서 파생한 `app/...` 차원}
  6. CloudWatch (us-east-1): `AWS/CloudFront` Requests Sum {DistributionId, Region='Global'}
- 응답 `InfraStatusData` (types/dashboard.ts): `resources: InfraResource[]`
  (`{ id, type, name, region, status: 'healthy'|'degraded'|'unknown', detail, monthlyUsd: number|null }`),
  `metrics: { ecsCpuPct, ecsMemPct, albRequests1h, albP50LatencySec, cfRequests1h }` (각 `number|null`),
  `summary: { fixedMonthlyUsd, runningTasks, desiredTasks, healthyTargets, totalTargets }`,
  `pricingAsOf: string`

## 3. 비용 — `lib/infra-cost.ts` (순수 함수, jest 대상)

단가 상수 `SEOUL_PRICES` — **출처: AWS Pricing API 실측 (ap-northeast-2, 2026-08 publication)**,
값 변경 시 이 파일만 수정:

```ts
export const SEOUL_PRICES = {
  fargateArmVcpuHour: 0.03725,   // APN2-Fargate-ARM-vCPU-Hours (태스크는 ARM64)
  fargateArmGbHour: 0.00409,     // APN2-Fargate-ARM-GB-Hours
  albHour: 0.025,                // APN2-LoadBalancerUsage (Application)
  albLcuHour: 0.008,             // APN2-LCUUsage (Application)
  natGatewayHour: 0.059,         // APN2-NatGateway-Hours
  natGatewayGb: 0.059,           // APN2-NatGateway-Bytes (per GB)
  ecrStorageGbMonth: 0.10,       // ECR storage (approx, 공식 단가)
  secretsManagerSecretMonth: 0.4,// Secrets Manager per secret (NextAuthSecret 잔재)
  hoursPerMonth: 730,
  asOf: '2026-08 (AWS Pricing API)',
} as const;
```

```ts
export interface CostInputs {
  runningTasks: number;        // 실측 (ECS DescribeServices)
  taskVcpu: number;            // 0.5 (CDK 정의)
  taskMemoryGb: number;        // 1 (CDK 정의)
  natGateways: number;         // 1 (CDK 정의)
  ecrRepoGb: number | null;    // 실측 (DescribeImages 합)
  albAvgLcu: number;           // 근사 0.25 (소규모 트래픽 가정, 상수)
}
export interface CostLine {
  resource: string;            // 'Fargate' | 'ALB' | 'NAT Gateway' | 'ECR' | 'Secrets Manager' | ...
  formula: string;             // 사람이 읽는 계산식 (예: '0.5 vCPU × $0.03725 × 730h × 2 tasks')
  monthlyUsd: number | null;   // null = usage-기반이라 제외
  kind: 'fixed' | 'usage-excluded';
}
export function estimateMonthlyCost(inputs: CostInputs): { lines: CostLine[]; fixedTotalUsd: number };
```

- **고정비 계산**: Fargate(태스크 수 실측 반영), ALB(시간+LCU 근사), NAT, ECR(실측 GB), Secrets Manager
- **usage-excluded 라인** (계산하지 않고 명시만): CloudFront·Athena·Bedrock·S3·CloudWatch Logs —
  "사용량 비례, Billing 콘솔 참조" 라벨. us-east-1 자원(Athena·S3·Bedrock·Lambda@Edge)은
  요청 범위(ap-northeast-2 기준) 밖임을 표에 리전 컬럼으로 드러낸다
- 반올림: 라인별 소수 2자리

## 4. UI — `app/infra-cost/page.tsx` + Sidebar 등록

- Sidebar: `{ key: 'nav.infraCost', href: '/infra-cost', accent: '#64748b' }` (ingest-health 다음)
- StatCard 4: 월 고정비 추정(총합, $), 실행 태스크(running/desired), 건강 타겟(healthy/total), ALB 요청(1h)
- CloudWatch 지표 카드: ECS CPU %·메모리 %(1h 평균), ALB 응답시간(초), CloudFront 요청(1h)
- 자원 테이블: 유형 | 이름 | 리전 | 상태 배지(healthy 초록·degraded 주황·unknown 회색) | 상세 | 월 추정($ 또는 "사용량 비례")
- 각주: "비용은 ap-northeast-2 온디맨드 정적 단가(2026-08, AWS Pricing API) 기반 **추정치**입니다.
  실제 청구액은 AWS Billing 콘솔을 확인하세요." (ko/en)
- 다크 우선, 신규 i18n 키는 `infra.*` 네임스페이스 (ko/en 페어)

## 5. 엣지 케이스

- IAM 미배포 상태(신규 코드 + 구 권한): 모든 자원 `unknown`, 지표 null → 페이지는 각 셀 '—' 렌더
- CloudFront 매칭 실패(오리진 불일치) / ALB 이름 변경: 해당 자원만 unknown
- GetMetricData 빈 시계열: null → '—'
- 태스크 0개(스케일 인 극단): Fargate 라인 $0, running 0/desired N 표시

## 6. 테스트 / 검증 / 배포 / 문서

- `tests/lib/infra-cost.test.ts`: 태스크 수 비례, ecrRepoGb null 처리, usage-excluded 라인 존재,
  고정 총합 = fixed 라인 합, 반올림
- `npx jest` + `npm run build`
- 배포 순서: ① `cdk diff KiroDashboardEcs`로 Path 판정 → CDK 배포(IAM) ② 이미지 Path A
  (권한이 코드보다 먼저 있어도 무해 — 코드가 권한보다 먼저면 unknown 저하로 동작)
- 문서: `app/api/CLAUDE.md`(20번째), `app/CLAUDE.md`(페이지), `lib/CLAUDE.md`(infra-cost),
  `types/CLAUDE.md`(InfraStatusData), `infra/CLAUDE.md`(InfraReadOnly 정책)
