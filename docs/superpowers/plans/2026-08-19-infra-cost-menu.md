# /infra-cost 메뉴 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대시보드 자신의 AWS 자원(실시간 상태 + CloudWatch 지표 + 서울 정적 단가 비용 추정)을 보여주는 15번째 메뉴를 추가한다.

**Architecture:** CDK에 읽기 전용 `InfraReadOnly` 정책(Task 1) → 순수 비용 계산 `lib/infra-cost.ts`(Task 2) → 리전 명시 SDK 클라이언트들로 병렬 조회하는 `/api/infra` 라우트 + 타입(Task 3) → Header days 옵셔널화 + 페이지 + Sidebar + i18n(Task 4). 소스별 독립 저하(실패 자원만 unknown).

**Tech Stack:** CDK assertions, @aws-sdk/client-{ecs,elastic-load-balancing-v2,cloudfront,ecr,cloudwatch} (Task 0에서 설치·커밋 완료 — 2b3823f), Next.js 14, jest.

**Spec:** `docs/superpowers/specs/2026-08-19-infra-cost-menu-design.md`

## Global Constraints

- 라우트는 반드시 `export const dynamic = 'force-dynamic';` — 아니면 Next가 빌드 시 프리렌더하며 **Docker 빌드 컨테이너(자격증명 없음)에서 AWS 호출을 시도**해 실패하거나 unknown 상태가 구워진다.
- 모든 SDK 클라이언트는 리전 명시: 인프라는 `ap-northeast-2`, CloudFront API·지표는 `us-east-1` (앱 기본 `AWS_REGION=us-east-1`이므로 암묵 리전 금지).
- 소스별 독립 try/catch — 한 자원 실패가 응답 전체를 500으로 만들면 안 됨.
- 다크 우선 스타일, i18n ko/en 필수, `t()` 보간 없음.
- NEVER `npm install`/`npm ci`(의존성은 이미 설치·커밋됨); NEVER touch `.claude/settings.json`.
- 검증: `npx jest` + `npm run build`. 커밋 트레일러: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: CDK `InfraReadOnly` 정책 + 어서션 테스트

**Files:**
- Modify: `infra/lib/ecs-stack.ts` (taskRole inlinePolicies에 항목 추가)
- Test: `tests/infra/ecs-stack-infra-read.test.ts`
- Modify: `infra/CLAUDE.md` (IAM Permissions 절에 불릿 추가)

**Interfaces:** Produces: 태스크 롤이 런타임에 §2의 API들을 호출할 권한 (코드와 독립 배포 가능 — 권한이 먼저 배포돼도 무해).

- [ ] **Step 1: 실패하는 테스트** — `tests/infra/ecs-stack-infra-read.test.ts` (기존 `tests/infra/ecs-stack-env.test.ts`의 `synthEcsStack` 헬퍼 패턴을 그대로 복사해 시작):

```ts
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { EcsStack } from '../../infra/lib/ecs-stack';

function synthEcsStack(): Template {
  const app = new cdk.App();
  const stubStack = new cdk.Stack(app, 'Stub', { env: { account: '111111111111', region: 'ap-northeast-2' } });
  const vpc = new ec2.Vpc(stubStack, 'TestVpc', { maxAzs: 2, natGateways: 1 });
  const albSg = new ec2.SecurityGroup(stubStack, 'AlbSg', { vpc });
  const ecsSg = new ec2.SecurityGroup(stubStack, 'EcsSg', { vpc });
  const stack = new EcsStack(app, 'KiroDashboardEcs', {
    env: { account: '111111111111', region: 'ap-northeast-2' },
    vpc, albSg, ecsSg,
  });
  return Template.fromStack(stack);
}

describe('InfraReadOnly task-role policy', () => {
  const template = synthEcsStack();

  it('grants the exact read-only infra actions', () => {
    template.hasResourceProperties('AWS::IAM::Policy', Match.objectLike({
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: [
              'ecs:DescribeClusters',
              'ecs:ListServices',
              'ecs:DescribeServices',
              'ecs:ListTasks',
              'ecs:DescribeTasks',
            ],
            Effect: 'Allow',
          }),
          Match.objectLike({
            Action: [
              'elasticloadbalancing:DescribeLoadBalancers',
              'elasticloadbalancing:DescribeTargetGroups',
              'elasticloadbalancing:DescribeTargetHealth',
              'cloudfront:ListDistributions',
              'cloudfront:GetDistribution',
              'cloudwatch:GetMetricData',
            ],
            Effect: 'Allow',
            Resource: '*',
          }),
          Match.objectLike({
            Action: ['ecr:DescribeRepositories', 'ecr:DescribeImages'],
            Effect: 'Allow',
          }),
        ]),
      }),
    }));
  });

  it('grants no write actions in the InfraReadOnly statements', () => {
    const policies = template.findResources('AWS::IAM::Policy');
    const allActions = JSON.stringify(policies);
    for (const banned of ['ecs:UpdateService', 'ecs:RunTask', 'elasticloadbalancing:Modify', 'cloudfront:Update', 'ecr:Put']) {
      expect(allActions).not.toContain(banned);
    }
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx jest tests/infra/ecs-stack-infra-read.test.ts` → FAIL (정책 없음)

- [ ] **Step 3: 정책 추가** — `infra/lib/ecs-stack.ts`의 `inlinePolicies` 객체에서 `BedrockInvoke: …},` 항목 **뒤**에 추가:

```ts
        // Read-only self-introspection for the /infra-cost page: live status of
        // the dashboard's own ECS/ALB/CloudFront/ECR plus CloudWatch metrics.
        // Describe* on ELB/CloudFront/CloudWatch has no resource-level support.
        InfraReadOnly: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'ecs:DescribeClusters',
                'ecs:ListServices',
                'ecs:DescribeServices',
                'ecs:ListTasks',
                'ecs:DescribeTasks',
              ],
              resources: [
                `arn:aws:ecs:${this.region}:${this.account}:cluster/kiro-dashboard-cluster`,
                `arn:aws:ecs:${this.region}:${this.account}:service/kiro-dashboard-cluster/*`,
                `arn:aws:ecs:${this.region}:${this.account}:task/kiro-dashboard-cluster/*`,
                `arn:aws:ecs:${this.region}:${this.account}:container-instance/kiro-dashboard-cluster/*`,
              ],
            }),
            new iam.PolicyStatement({
              actions: [
                'elasticloadbalancing:DescribeLoadBalancers',
                'elasticloadbalancing:DescribeTargetGroups',
                'elasticloadbalancing:DescribeTargetHealth',
                'cloudfront:ListDistributions',
                'cloudfront:GetDistribution',
                'cloudwatch:GetMetricData',
              ],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              actions: ['ecr:DescribeRepositories', 'ecr:DescribeImages'],
              resources: [
                `arn:aws:ecr:${this.region}:${this.account}:repository/kiro-dashboard`,
              ],
            }),
          ],
        }),
```

- [ ] **Step 4: 통과 확인** — `npx jest tests/infra/` → 전체 PASS

- [ ] **Step 5: `infra/CLAUDE.md`** — IAM Permissions 절 마지막에 불릿 추가:

```markdown
- **InfraReadOnly**: `ecs:Describe*/List*` (kiro-dashboard-cluster 스코프), `elasticloadbalancing:Describe*`, `cloudfront:ListDistributions/GetDistribution`, `cloudwatch:GetMetricData`, `ecr:Describe*` (repo 스코프) — /infra-cost 페이지의 실시간 자기 상태 조회 (전부 읽기 전용)
```

- [ ] **Step 6: Commit**

```bash
git add infra/lib/ecs-stack.ts tests/infra/ecs-stack-infra-read.test.ts infra/CLAUDE.md
git commit -m "feat(infra): read-only InfraReadOnly task-role policy for /infra-cost

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `lib/infra-cost.ts` (순수 비용 계산) + 테스트

**Files:**
- Create: `lib/infra-cost.ts`
- Test: `tests/lib/infra-cost.test.ts`
- Modify: `lib/CLAUDE.md` (Files 표 `idc-users.ts` 행 아래)

**Interfaces:** Produces (Task 3이 import): `SEOUL_PRICES`, `CostInputs`, `CostLine`, `estimateMonthlyCost(inputs: CostInputs): { lines: CostLine[]; fixedTotalUsd: number }`

- [ ] **Step 1: 실패하는 테스트** — `tests/lib/infra-cost.test.ts`:

```ts
import { estimateMonthlyCost, SEOUL_PRICES, CostInputs } from '@/lib/infra-cost';

const BASE: CostInputs = {
  runningTasks: 1,
  taskVcpu: 0.5,
  taskMemoryGb: 1,
  natGateways: 1,
  ecrRepoGb: 2,
  albAvgLcu: 0.25,
};

function line(inputs: CostInputs, resource: string) {
  const { lines } = estimateMonthlyCost(inputs);
  const found = lines.find((l) => l.resource === resource);
  expect(found).toBeDefined();
  return found!;
}

describe('estimateMonthlyCost', () => {
  it('Fargate scales linearly with running task count', () => {
    const one = line(BASE, 'Fargate').monthlyUsd!;
    const two = line({ ...BASE, runningTasks: 2 }, 'Fargate').monthlyUsd!;
    expect(two).toBeCloseTo(one * 2, 2);
  });

  it('Fargate at 0 tasks costs 0 but the line still exists', () => {
    expect(line({ ...BASE, runningTasks: 0 }, 'Fargate').monthlyUsd).toBe(0);
  });

  it('Fargate formula matches the ARM unit prices', () => {
    const expected =
      (BASE.taskVcpu * SEOUL_PRICES.fargateArmVcpuHour + BASE.taskMemoryGb * SEOUL_PRICES.fargateArmGbHour) *
      SEOUL_PRICES.hoursPerMonth;
    expect(line(BASE, 'Fargate').monthlyUsd).toBeCloseTo(Math.round(expected * 100) / 100, 2);
  });

  it('null ecrRepoGb yields a null-cost ECR line (unmeasured, not zero)', () => {
    expect(line({ ...BASE, ecrRepoGb: null }, 'ECR').monthlyUsd).toBeNull();
  });

  it('usage-based services are present but excluded from the fixed total', () => {
    const { lines, fixedTotalUsd } = estimateMonthlyCost(BASE);
    const usage = lines.filter((l) => l.kind === 'usage-excluded');
    expect(usage.map((l) => l.resource)).toEqual(
      expect.arrayContaining(['CloudFront', 'Athena', 'S3', 'Bedrock', 'CloudWatch Logs']),
    );
    for (const l of usage) expect(l.monthlyUsd).toBeNull();
    const fixedSum = lines
      .filter((l) => l.kind === 'fixed' && l.monthlyUsd !== null)
      .reduce((s, l) => s + l.monthlyUsd!, 0);
    expect(fixedTotalUsd).toBeCloseTo(fixedSum, 2);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx jest tests/lib/infra-cost.test.ts` → FAIL

- [ ] **Step 3: 구현** — `lib/infra-cost.ts`:

```ts
/**
 * Static on-demand unit prices for the dashboard's OWN infrastructure in
 * ap-northeast-2 (Seoul), sourced from the AWS Pricing API (2026-08
 * publications). Display-only ESTIMATES for /infra-cost — never presented as
 * billing. The task runs on Fargate ARM64 (runtimePlatform in ecs-stack.ts),
 * so the ARM rates apply. Update this table only; no code reads live pricing.
 */
export const SEOUL_PRICES = {
  fargateArmVcpuHour: 0.03725, // APN2-Fargate-ARM-vCPU-Hours
  fargateArmGbHour: 0.00409, // APN2-Fargate-ARM-GB-Hours
  albHour: 0.025, // APN2-LoadBalancerUsage (Application)
  albLcuHour: 0.008, // APN2-LCUUsage (Application)
  natGatewayHour: 0.059, // APN2-NatGateway-Hours
  natGatewayGb: 0.059, // APN2-NatGateway-Bytes (per GB; usage part not estimated)
  ecrStorageGbMonth: 0.1,
  secretsManagerSecretMonth: 0.4, // legacy NextAuthSecret still provisioned
  hoursPerMonth: 730,
  asOf: '2026-08 (AWS Pricing API)',
} as const;

export interface CostInputs {
  runningTasks: number; // measured (ECS DescribeServices)
  taskVcpu: number; // 0.5 per CDK task definition
  taskMemoryGb: number; // 1 per CDK task definition
  natGateways: number; // 1 per CDK network stack
  ecrRepoGb: number | null; // measured (DescribeImages sum); null = unmeasured
  albAvgLcu: number; // small-traffic approximation constant (0.25)
}

export interface CostLine {
  resource: string;
  formula: string;
  monthlyUsd: number | null; // null = unmeasured or usage-based
  kind: 'fixed' | 'usage-excluded';
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Fixed-cost estimate for Seoul resources; usage-billed services are listed
 * but deliberately excluded (kind 'usage-excluded', monthlyUsd null) — the
 * honest answer for those is the Billing console, not a guess.
 */
export function estimateMonthlyCost(inputs: CostInputs): {
  lines: CostLine[];
  fixedTotalUsd: number;
} {
  const p = SEOUL_PRICES;
  const fargateHourly =
    inputs.taskVcpu * p.fargateArmVcpuHour + inputs.taskMemoryGb * p.fargateArmGbHour;
  const fargate = round2(fargateHourly * p.hoursPerMonth * inputs.runningTasks);
  const alb = round2((p.albHour + p.albLcuHour * inputs.albAvgLcu) * p.hoursPerMonth);
  const nat = round2(p.natGatewayHour * p.hoursPerMonth * inputs.natGateways);
  const ecr =
    inputs.ecrRepoGb === null ? null : round2(inputs.ecrRepoGb * p.ecrStorageGbMonth);
  const secrets = round2(p.secretsManagerSecretMonth);

  const lines: CostLine[] = [
    {
      resource: 'Fargate',
      formula: `(${inputs.taskVcpu} vCPU × $${p.fargateArmVcpuHour} + ${inputs.taskMemoryGb} GB × $${p.fargateArmGbHour}) × ${p.hoursPerMonth}h × ${inputs.runningTasks} task(s)`,
      monthlyUsd: fargate,
      kind: 'fixed',
    },
    {
      resource: 'ALB',
      formula: `($${p.albHour} + $${p.albLcuHour} × ${inputs.albAvgLcu} LCU) × ${p.hoursPerMonth}h`,
      monthlyUsd: alb,
      kind: 'fixed',
    },
    {
      resource: 'NAT Gateway',
      formula: `$${p.natGatewayHour} × ${p.hoursPerMonth}h × ${inputs.natGateways} (+ $${p.natGatewayGb}/GB processed, usage)`,
      monthlyUsd: nat,
      kind: 'fixed',
    },
    {
      resource: 'ECR',
      formula:
        inputs.ecrRepoGb === null
          ? 'repository size unmeasured'
          : `${inputs.ecrRepoGb.toFixed(2)} GB × $${p.ecrStorageGbMonth}/GB-month`,
      monthlyUsd: ecr,
      kind: 'fixed',
    },
    {
      resource: 'Secrets Manager',
      formula: `1 secret × $${p.secretsManagerSecretMonth}/month (legacy NextAuthSecret)`,
      monthlyUsd: secrets,
      kind: 'fixed',
    },
    { resource: 'CloudFront', formula: 'per-request + data transfer', monthlyUsd: null, kind: 'usage-excluded' },
    { resource: 'Athena', formula: 'per TB scanned', monthlyUsd: null, kind: 'usage-excluded' },
    { resource: 'S3', formula: 'storage + requests', monthlyUsd: null, kind: 'usage-excluded' },
    { resource: 'Bedrock', formula: 'per input/output token', monthlyUsd: null, kind: 'usage-excluded' },
    { resource: 'CloudWatch Logs', formula: 'per GB ingested', monthlyUsd: null, kind: 'usage-excluded' },
  ];

  const fixedTotalUsd = round2(
    lines.reduce((s, l) => (l.kind === 'fixed' && l.monthlyUsd !== null ? s + l.monthlyUsd : s), 0),
  );

  return { lines, fixedTotalUsd };
}
```

- [ ] **Step 4: 통과 확인** — `npx jest tests/lib/infra-cost.test.ts` → PASS (5 tests)

- [ ] **Step 5: `lib/CLAUDE.md`** — `idc-users.ts` 행 아래 추가:

```markdown
| `infra-cost.ts` | Static Seoul on-demand prices (`SEOUL_PRICES`, AWS Pricing API 2026-08, ARM rates) + pure `estimateMonthlyCost` — fixed lines (Fargate/ALB/NAT/ECR/Secrets) computed, usage-billed services listed as 'usage-excluded' with null cost; consumed by `/api/infra` |
```

- [ ] **Step 6: Commit**

```bash
git add lib/infra-cost.ts tests/lib/infra-cost.test.ts lib/CLAUDE.md
git commit -m "feat(lib): static Seoul pricing table and monthly cost estimator

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 타입 + `/api/infra` 라우트

**Files:**
- Modify: `types/dashboard.ts` (파일 끝에 인터페이스 추가), `types/CLAUDE.md`
- Create: `app/api/infra/route.ts`
- Modify: `app/api/CLAUDE.md` (엔드포인트 표에 행 추가 + Key Conventions에 리전 주의 불릿)

**Interfaces:**
- Consumes (Task 2): `estimateMonthlyCost`, `SEOUL_PRICES`
- Produces (Task 4가 소비): `GET /api/infra` → `InfraStatusData`

- [ ] **Step 1: 타입 추가** — `types/dashboard.ts` 끝에:

```ts
/** One row on /infra-cost. 'static' = defined by CDK, not live-queried. */
export interface InfraResource {
  id: string;
  type: string;
  name: string;
  region: string;
  status: 'healthy' | 'degraded' | 'unknown' | 'static';
  detail: string;
  monthlyUsd: number | null; // null = usage-based or unmeasured
}

export interface InfraStatusData {
  resources: InfraResource[];
  metrics: {
    ecsCpuPct: number | null;
    ecsMemPct: number | null;
    albRequests1h: number | null;
    albP50LatencySec: number | null;
    cfRequests1h: number | null;
  };
  summary: {
    fixedMonthlyUsd: number;
    runningTasks: number | null;
    desiredTasks: number | null;
    healthyTargets: number | null;
    totalTargets: number | null;
  };
  pricingAsOf: string;
}
```

- [ ] **Step 2: 라우트 작성** — `app/api/infra/route.ts` 전체:

```ts
import { NextResponse } from 'next/server';
import {
  ECSClient,
  ListServicesCommand,
  DescribeServicesCommand,
} from '@aws-sdk/client-ecs';
import {
  ElasticLoadBalancingV2Client,
  DescribeLoadBalancersCommand,
  DescribeTargetGroupsCommand,
  DescribeTargetHealthCommand,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { CloudFrontClient, ListDistributionsCommand } from '@aws-sdk/client-cloudfront';
import { ECRClient, DescribeImagesCommand } from '@aws-sdk/client-ecr';
import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { estimateMonthlyCost, SEOUL_PRICES } from '@/lib/infra-cost';
import { InfraResource, InfraStatusData } from '@/types/dashboard';

// This page introspects the dashboard's OWN infrastructure, which lives in
// Seoul — the app's default AWS_REGION is us-east-1 (Athena/Bedrock), so every
// client pins its region explicitly. CloudFront is a global API and publishes
// its CloudWatch metrics ONLY in us-east-1.
const INFRA_REGION = 'ap-northeast-2';
const CLUSTER = 'kiro-dashboard-cluster';
const ALB_NAME = 'kiro-dashboard-alb';
const ECR_REPO = 'kiro-dashboard';

const ecs = new ECSClient({ region: INFRA_REGION });
const elb = new ElasticLoadBalancingV2Client({ region: INFRA_REGION });
const ecrClient = new ECRClient({ region: INFRA_REGION });
const cw = new CloudWatchClient({ region: INFRA_REGION });
const cf = new CloudFrontClient({ region: 'us-east-1' });
const cwUsEast1 = new CloudWatchClient({ region: 'us-east-1' });

// Live AWS calls at build time would run inside the Docker build (no
// credentials) and bake failures into a prerendered response.
export const dynamic = 'force-dynamic';

interface EcsInfo {
  resource: InfraResource;
  serviceName: string | null;
  running: number | null;
  desired: number | null;
}

async function fetchEcs(): Promise<EcsInfo> {
  const base = { id: 'ecs', type: 'ECS Fargate', name: CLUSTER, region: INFRA_REGION };
  try {
    const list = await ecs.send(new ListServicesCommand({ cluster: CLUSTER }));
    const serviceArn = list.serviceArns?.[0];
    if (!serviceArn) {
      return {
        resource: { ...base, status: 'unknown', detail: 'no service found', monthlyUsd: null },
        serviceName: null,
        running: null,
        desired: null,
      };
    }
    const serviceName = serviceArn.split('/').pop() ?? serviceArn;
    const desc = await ecs.send(
      new DescribeServicesCommand({ cluster: CLUSTER, services: [serviceArn] }),
    );
    const svc = desc.services?.[0];
    const running = svc?.runningCount ?? null;
    const desired = svc?.desiredCount ?? null;
    const rollout = svc?.deployments?.[0]?.rolloutState ?? 'UNKNOWN';
    const healthy = svc?.status === 'ACTIVE' && rollout === 'COMPLETED' && running === desired;
    return {
      resource: {
        ...base,
        status: healthy ? 'healthy' : 'degraded',
        detail: `${running ?? '?'} / ${desired ?? '?'} tasks · ${rollout}`,
        monthlyUsd: null,
      },
      serviceName,
      running,
      desired,
    };
  } catch (err) {
    console.warn('[/api/infra] ecs:', err);
    return {
      resource: { ...base, status: 'unknown', detail: 'query failed', monthlyUsd: null },
      serviceName: null,
      running: null,
      desired: null,
    };
  }
}

interface AlbInfo {
  resource: InfraResource;
  lbDimension: string | null; // 'app/name/hash' for CloudWatch
  dnsName: string | null;
  healthy: number | null;
  total: number | null;
}

async function fetchAlb(): Promise<AlbInfo> {
  const base = { id: 'alb', type: 'ALB', name: ALB_NAME, region: INFRA_REGION };
  try {
    const lbs = await elb.send(new DescribeLoadBalancersCommand({ Names: [ALB_NAME] }));
    const lb = lbs.LoadBalancers?.[0];
    if (!lb?.LoadBalancerArn) {
      return {
        resource: { ...base, status: 'unknown', detail: 'not found', monthlyUsd: null },
        lbDimension: null, dnsName: null, healthy: null, total: null,
      };
    }
    const lbDimension = lb.LoadBalancerArn.split('loadbalancer/')[1] ?? null;
    const tgs = await elb.send(
      new DescribeTargetGroupsCommand({ LoadBalancerArn: lb.LoadBalancerArn }),
    );
    const tgArn = tgs.TargetGroups?.[0]?.TargetGroupArn;
    let healthy: number | null = null;
    let total: number | null = null;
    if (tgArn) {
      const th = await elb.send(new DescribeTargetHealthCommand({ TargetGroupArn: tgArn }));
      const states = th.TargetHealthDescriptions ?? [];
      total = states.length;
      healthy = states.filter((s) => s.TargetHealth?.State === 'healthy').length;
    }
    const ok = lb.State?.Code === 'active' && healthy !== null && total !== null && healthy === total && total > 0;
    return {
      resource: {
        ...base,
        status: ok ? 'healthy' : 'degraded',
        detail: `${lb.State?.Code ?? '?'} · targets ${healthy ?? '?'} / ${total ?? '?'}`,
        monthlyUsd: null,
      },
      lbDimension,
      dnsName: lb.DNSName ?? null,
      healthy,
      total,
    };
  } catch (err) {
    console.warn('[/api/infra] alb:', err);
    return {
      resource: { ...base, status: 'unknown', detail: 'query failed', monthlyUsd: null },
      lbDimension: null, dnsName: null, healthy: null, total: null,
    };
  }
}

interface CfInfo {
  resource: InfraResource;
  distributionId: string | null;
}

async function fetchCloudFront(albDns: string | null): Promise<CfInfo> {
  const base = { id: 'cloudfront', type: 'CloudFront', name: 'distribution', region: 'global' };
  try {
    const list = await cf.send(new ListDistributionsCommand({}));
    const items = list.DistributionList?.Items ?? [];
    const match = albDns
      ? items.find((d) => d.Origins?.Items?.some((o) => o.DomainName === albDns))
      : items[0];
    if (!match?.Id) {
      return {
        resource: { ...base, status: 'unknown', detail: 'no matching distribution', monthlyUsd: null },
        distributionId: null,
      };
    }
    const ok = match.Status === 'Deployed' && match.Enabled === true;
    return {
      resource: {
        ...base,
        name: match.DomainName ?? match.Id,
        status: ok ? 'healthy' : 'degraded',
        detail: `${match.Status ?? '?'} · ${match.Enabled ? 'enabled' : 'disabled'}`,
        monthlyUsd: null,
      },
      distributionId: match.Id,
    };
  } catch (err) {
    console.warn('[/api/infra] cloudfront:', err);
    return { resource: { ...base, status: 'unknown', detail: 'query failed', monthlyUsd: null }, distributionId: null };
  }
}

interface EcrInfo {
  resource: InfraResource;
  repoGb: number | null;
}

async function fetchEcr(): Promise<EcrInfo> {
  const base = { id: 'ecr', type: 'ECR', name: ECR_REPO, region: INFRA_REGION };
  try {
    const images = await ecrClient.send(
      new DescribeImagesCommand({ repositoryName: ECR_REPO, maxResults: 100 }),
    );
    const details = images.imageDetails ?? [];
    const bytes = details.reduce((s, d) => s + (d.imageSizeInBytes ?? 0), 0);
    const repoGb = bytes / 1_073_741_824;
    const latest = details
      .filter((d) => d.imageTags?.includes('latest'))
      .map((d) => d.imagePushedAt)[0];
    return {
      resource: {
        ...base,
        status: 'healthy',
        detail: `${details.length} images · latest pushed ${latest ? new Date(latest).toISOString().slice(0, 16).replace('T', ' ') : '?'} UTC`,
        monthlyUsd: null,
      },
      repoGb,
    };
  } catch (err) {
    console.warn('[/api/infra] ecr:', err);
    return { resource: { ...base, status: 'unknown', detail: 'query failed', monthlyUsd: null }, repoGb: null };
  }
}

interface MetricsInfo {
  ecsCpuPct: number | null;
  ecsMemPct: number | null;
  albRequests1h: number | null;
  albP50LatencySec: number | null;
}

async function fetchSeoulMetrics(serviceName: string | null, lbDimension: string | null): Promise<MetricsInfo> {
  const empty: MetricsInfo = { ecsCpuPct: null, ecsMemPct: null, albRequests1h: null, albP50LatencySec: null };
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 3_600_000);
    const queries = [];
    if (serviceName) {
      const dims = [
        { Name: 'ClusterName', Value: CLUSTER },
        { Name: 'ServiceName', Value: serviceName },
      ];
      queries.push(
        { Id: 'cpu', MetricStat: { Metric: { Namespace: 'AWS/ECS', MetricName: 'CPUUtilization', Dimensions: dims }, Period: 300, Stat: 'Average' } },
        { Id: 'mem', MetricStat: { Metric: { Namespace: 'AWS/ECS', MetricName: 'MemoryUtilization', Dimensions: dims }, Period: 300, Stat: 'Average' } },
      );
    }
    if (lbDimension) {
      const dims = [{ Name: 'LoadBalancer', Value: lbDimension }];
      queries.push(
        { Id: 'req', MetricStat: { Metric: { Namespace: 'AWS/ApplicationELB', MetricName: 'RequestCount', Dimensions: dims }, Period: 3600, Stat: 'Sum' } },
        { Id: 'lat', MetricStat: { Metric: { Namespace: 'AWS/ApplicationELB', MetricName: 'TargetResponseTime', Dimensions: dims }, Period: 3600, Stat: 'Average' } },
      );
    }
    if (!queries.length) return empty;
    const out = await cw.send(
      new GetMetricDataCommand({ StartTime: start, EndTime: end, MetricDataQueries: queries }),
    );
    const val = (id: string): number | null => {
      const r = (out.MetricDataResults ?? []).find((m) => m.Id === id);
      const vs = r?.Values ?? [];
      if (!vs.length) return null;
      if (id === 'req') return vs.reduce((s, v) => s + v, 0);
      return vs.reduce((s, v) => s + v, 0) / vs.length;
    };
    return {
      ecsCpuPct: val('cpu'),
      ecsMemPct: val('mem'),
      albRequests1h: val('req'),
      albP50LatencySec: val('lat'),
    };
  } catch (err) {
    console.warn('[/api/infra] cloudwatch apne2:', err);
    return empty;
  }
}

async function fetchCfRequests(distributionId: string | null): Promise<number | null> {
  if (!distributionId) return null;
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 3_600_000);
    const out = await cwUsEast1.send(
      new GetMetricDataCommand({
        StartTime: start,
        EndTime: end,
        MetricDataQueries: [
          {
            Id: 'cfreq',
            MetricStat: {
              Metric: {
                Namespace: 'AWS/CloudFront',
                MetricName: 'Requests',
                Dimensions: [
                  { Name: 'DistributionId', Value: distributionId },
                  { Name: 'Region', Value: 'Global' },
                ],
              },
              Period: 3600,
              Stat: 'Sum',
            },
          },
        ],
      }),
    );
    const vs = out.MetricDataResults?.[0]?.Values ?? [];
    return vs.length ? vs.reduce((s, v) => s + v, 0) : null;
  } catch (err) {
    console.warn('[/api/infra] cloudwatch us-east-1:', err);
    return null;
  }
}

// Not live-queried: either no read permission by design or nothing meaningful
// to poll. Costs (where fixed) attach from the estimator below.
function staticResources(): InfraResource[] {
  return [
    { id: 'nat', type: 'NAT Gateway', name: 'network-stack NAT', region: INFRA_REGION, status: 'static', detail: '1 gateway (CDK network stack)', monthlyUsd: null },
    { id: 'vpc', type: 'VPC', name: 'kiro-dashboard VPC', region: INFRA_REGION, status: 'static', detail: '2 AZ, public/private subnets — no hourly charge', monthlyUsd: 0 },
    { id: 'cognito', type: 'Cognito', name: 'user pool', region: INFRA_REGION, status: 'static', detail: 'Hosted UI + PKCE — free tier', monthlyUsd: 0 },
    { id: 'edge', type: 'Lambda@Edge', name: 'edge-auth', region: 'us-east-1', status: 'static', detail: 'viewer-request auth', monthlyUsd: null },
    { id: 'secrets', type: 'Secrets Manager', name: 'NextAuthSecret', region: INFRA_REGION, status: 'static', detail: 'legacy, still provisioned', monthlyUsd: null },
    { id: 'athena', type: 'Athena', name: 'titanlog', region: 'us-east-1', status: 'static', detail: 'per-TB-scanned', monthlyUsd: null },
    { id: 's3', type: 'S3', name: 'report + results buckets', region: 'us-east-1', status: 'static', detail: 'reports, athena results, first-seen ledger', monthlyUsd: null },
    { id: 'bedrock', type: 'Bedrock', name: 'Claude (analyze)', region: 'us-east-1', status: 'static', detail: 'per-token', monthlyUsd: null },
    { id: 'logs', type: 'CloudWatch Logs', name: 'ecs log group', region: INFRA_REGION, status: 'static', detail: '1-month retention', monthlyUsd: null },
  ];
}

export async function GET() {
  const [ecsInfo, albInfo] = await Promise.all([fetchEcs(), fetchAlb()]);
  const [cfInfo, ecrInfo, seoulMetrics] = await Promise.all([
    fetchCloudFront(albInfo.dnsName),
    fetchEcr(),
    fetchSeoulMetrics(ecsInfo.serviceName, albInfo.lbDimension),
  ]);
  const cfRequests1h = await fetchCfRequests(cfInfo.distributionId);

  const { lines, fixedTotalUsd } = estimateMonthlyCost({
    runningTasks: ecsInfo.running ?? 1,
    taskVcpu: 0.5,
    taskMemoryGb: 1,
    natGateways: 1,
    ecrRepoGb: ecrInfo.repoGb,
    albAvgLcu: 0.25,
  });
  const cost = (resource: string): number | null =>
    lines.find((l) => l.resource === resource)?.monthlyUsd ?? null;

  const live: InfraResource[] = [
    { ...ecsInfo.resource, monthlyUsd: cost('Fargate') },
    { ...albInfo.resource, monthlyUsd: cost('ALB') },
    { ...cfInfo.resource, monthlyUsd: cost('CloudFront') },
    { ...ecrInfo.resource, monthlyUsd: cost('ECR') },
  ];
  const statics = staticResources().map((r) => {
    if (r.id === 'nat') return { ...r, monthlyUsd: cost('NAT Gateway') };
    if (r.id === 'secrets') return { ...r, monthlyUsd: cost('Secrets Manager') };
    return r;
  });

  const data: InfraStatusData = {
    resources: [...live, ...statics],
    metrics: { ...seoulMetrics, cfRequests1h },
    summary: {
      fixedMonthlyUsd: fixedTotalUsd,
      runningTasks: ecsInfo.running,
      desiredTasks: ecsInfo.desired,
      healthyTargets: albInfo.healthy,
      totalTargets: albInfo.total,
    },
    pricingAsOf: SEOUL_PRICES.asOf,
  };
  return NextResponse.json(data);
}
```

- [ ] **Step 3: 검증** — `npx tsc --noEmit 2>&1 | grep -E "^(app|lib|types)/"` → 출력 없음

- [ ] **Step 4: 문서** — `app/api/CLAUDE.md` 엔드포인트 표에:

```markdown
| `GET /api/infra` | `infra/route.ts` | Dashboard self-introspection: live ECS/ALB/CloudFront/ECR status + CloudWatch metrics (Seoul + us-east-1 for CloudFront) + static Seoul price estimates from `lib/infra-cost.ts`. `force-dynamic` (build box has no AWS creds); per-source degrade to `unknown` |
```

Key Conventions에 불릿 추가: "The `infra` endpoint pins every SDK client region explicitly (infra lives in ap-northeast-2; the app default AWS_REGION is us-east-1). It performs NO caching — status is realtime."

`types/CLAUDE.md`의 표에 `InfraResource`/`InfraStatusData` 행 1줄 추가.

- [ ] **Step 5: Commit**

```bash
git add types/dashboard.ts types/CLAUDE.md app/api/infra/route.ts app/api/CLAUDE.md
git commit -m "feat(api): /api/infra — live self-status, CloudWatch metrics, cost estimates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Header days 옵셔널화 + 페이지 + Sidebar + i18n + 전체 검증

**Files:**
- Modify: `app/components/layout/Header.tsx` (days/onDaysChange 옵셔널 — 둘 다 있을 때만 픽커 렌더)
- Create: `app/infra-cost/page.tsx`
- Modify: `app/components/layout/Sidebar.tsx` (NAV 목록), `lib/i18n.tsx` (ko/en), `app/CLAUDE.md`, `app/components/CLAUDE.md` (Header 설명 한 줄)

**Interfaces:** Consumes: `GET /api/infra` → `InfraStatusData`

- [ ] **Step 1: Header 옵셔널화** — `interface HeaderProps`에서 `days: number;` → `days?: number;`, `onDaysChange: (days: number) => void;` → `onDaysChange?: (days: number) => void;`. 본문에서 DateRangePicker(또는 기간 선택 UI)를 렌더하는 부분을 `{days !== undefined && onDaysChange && ( … )}`로 감싼다 (파일을 읽고 픽커 렌더 지점을 찾아 적용; 기존 호출자는 전원 두 prop을 넘기므로 무영향).

- [ ] **Step 2: i18n ko** — `'nav.ingestHealth'` 계열 키 근처(같은 블록)에 추가:

```ts
    'nav.infraCost': '인프라·비용',
    'header.infraCost': '인프라 자원 · 비용',
    'header.infraCost.sub': '대시보드 자체 AWS 자원의 실시간 상태와 월 비용 추정 (ap-northeast-2)',
    'infra.fixedMonthly': '월 고정비 추정',
    'infra.runningTasks': '실행 태스크',
    'infra.healthyTargets': '건강한 타겟',
    'infra.albRequests': 'ALB 요청 (1시간)',
    'infra.metric.cpu': 'ECS CPU (1h 평균)',
    'infra.metric.mem': 'ECS 메모리 (1h 평균)',
    'infra.metric.latency': 'ALB 응답시간 (1h 평균)',
    'infra.metric.cfRequests': 'CloudFront 요청 (1h)',
    'infra.col.type': '유형',
    'infra.col.name': '이름',
    'infra.col.region': '리전',
    'infra.col.status': '상태',
    'infra.col.detail': '상세',
    'infra.col.monthly': '월 추정',
    'infra.usageBased': '사용량 비례',
    'infra.status.static': '정적',
    'infra.estimateNote': '비용은 ap-northeast-2 온디맨드 정적 단가(2026-08, AWS Pricing API) 기반 추정치입니다. 실제 청구액은 AWS Billing 콘솔을 확인하세요.',
```

- [ ] **Step 3: i18n en** — en 블록 같은 위치에:

```ts
    'nav.infraCost': 'Infra & Cost',
    'header.infraCost': 'Infrastructure & Cost',
    'header.infraCost.sub': 'Live status and monthly cost estimate of this dashboard\'s own AWS resources (ap-northeast-2)',
    'infra.fixedMonthly': 'Est. Fixed Monthly',
    'infra.runningTasks': 'Running Tasks',
    'infra.healthyTargets': 'Healthy Targets',
    'infra.albRequests': 'ALB Requests (1h)',
    'infra.metric.cpu': 'ECS CPU (1h avg)',
    'infra.metric.mem': 'ECS Memory (1h avg)',
    'infra.metric.latency': 'ALB Response Time (1h avg)',
    'infra.metric.cfRequests': 'CloudFront Requests (1h)',
    'infra.col.type': 'Type',
    'infra.col.name': 'Name',
    'infra.col.region': 'Region',
    'infra.col.status': 'Status',
    'infra.col.detail': 'Detail',
    'infra.col.monthly': 'Monthly Est.',
    'infra.usageBased': 'usage-based',
    'infra.status.static': 'static',
    'infra.estimateNote': 'Costs are ESTIMATES from static ap-northeast-2 on-demand prices (2026-08, AWS Pricing API). Check the AWS Billing console for actual charges.',
```

- [ ] **Step 4: Sidebar** — NAV 배열의 `nav.ingestHealth` 항목 뒤에:

```ts
  { key: 'nav.infraCost', href: '/infra-cost', accent: '#64748b' },
```

- [ ] **Step 5: 페이지** — `app/infra-cost/page.tsx` (ingest-health 페이지 구조를 따름):

```tsx
'use client';

import { useState, useEffect } from 'react';
import Header from '@/app/components/layout/Header';
import { SkeletonGate } from '@/app/components/ui/PageSkeleton';
import { pageBodyOpacityClass } from '@/lib/skeleton-layout';
import MetricCard from '@/app/components/charts/MetricCard';
import { InfraStatusData } from '@/types/dashboard';
import { useI18n } from '@/lib/i18n';

const STATUS_STYLE: Record<string, string> = {
  healthy: 'bg-emerald-500/10 text-emerald-400',
  degraded: 'bg-orange-500/10 text-orange-400',
  unknown: 'bg-gray-500/10 text-gray-400',
  static: 'bg-slate-500/10 text-slate-400',
};

function usd(n: number | null): string {
  return n === null ? '—' : `$${n.toFixed(2)}`;
}

function pct(n: number | null): string {
  return n === null ? '—' : `${n.toFixed(1)}%`;
}

export default function InfraCostPage() {
  const [data, setData] = useState<InfraStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/infra')
      .then((r) => r.json())
      .then((payload) => {
        if (!cancelled) setData(payload ?? null);
      })
      .catch(() => {
        // Keep existing data on error
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const s = data?.summary;
  const m = data?.metrics;

  return (
    <div className={`flex flex-col gap-6 transition-opacity duration-200 ${pageBodyOpacityClass(loading, data !== null)}`}>
      <Header titleKey="header.infraCost" subtitleKey="header.infraCost.sub" mascotMood="thinking" mascotTheme="dashboard" />

      <SkeletonGate variant="table" loading={loading} hasData={data !== null}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard title={t('infra.fixedMonthly')} value={usd(s?.fixedMonthlyUsd ?? null)} changeRate={0} accentColor="#9046FF" subtitle={data?.pricingAsOf ?? ''} />
        <MetricCard title={t('infra.runningTasks')} value={s?.runningTasks !== null && s?.runningTasks !== undefined ? `${s.runningTasks} / ${s.desiredTasks ?? '?'}` : '—'} changeRate={0} accentColor="#22c55e" subtitle="ECS Fargate" />
        <MetricCard title={t('infra.healthyTargets')} value={s?.healthyTargets !== null && s?.healthyTargets !== undefined ? `${s.healthyTargets} / ${s.totalTargets ?? '?'}` : '—'} changeRate={0} accentColor="#0ea5e9" subtitle="ALB" />
        <MetricCard title={t('infra.albRequests')} value={m?.albRequests1h === null || m?.albRequests1h === undefined ? '—' : m.albRequests1h.toLocaleString()} changeRate={0} accentColor="#f97316" subtitle="AWS/ApplicationELB" />
      </div>

      {/* CloudWatch metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { key: 'infra.metric.cpu', value: pct(m?.ecsCpuPct ?? null) },
          { key: 'infra.metric.mem', value: pct(m?.ecsMemPct ?? null) },
          { key: 'infra.metric.latency', value: m?.albP50LatencySec === null || m?.albP50LatencySec === undefined ? '—' : `${(m.albP50LatencySec * 1000).toFixed(0)} ms` },
          { key: 'infra.metric.cfRequests', value: m?.cfRequests1h === null || m?.cfRequests1h === undefined ? '—' : m.cfRequests1h.toLocaleString() },
        ].map((item) => (
          <div key={item.key} className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t(item.key)}</span>
            <span className="text-2xl font-bold font-mono text-gray-200">{item.value}</span>
          </div>
        ))}
      </div>

      {/* Resource table */}
      <div className="rounded-xl border border-gray-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/70">
              <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">{t('infra.col.type')}</th>
              <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">{t('infra.col.name')}</th>
              <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-32">{t('infra.col.region')}</th>
              <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-28">{t('infra.col.status')}</th>
              <th className="text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider">{t('infra.col.detail')}</th>
              <th className="text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-28">{t('infra.col.monthly')}</th>
            </tr>
          </thead>
          <tbody>
            {(data?.resources ?? []).map((r) => (
              <tr key={r.id} className="border-b border-gray-800/50 last:border-b-0 hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-2.5 text-gray-200 font-medium whitespace-nowrap">{r.type}</td>
                <td className="px-4 py-2.5 text-gray-400 font-mono text-xs break-all">{r.name}</td>
                <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{r.region}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[r.status]}`}>
                    {r.status === 'static' ? t('infra.status.static') : r.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-400 text-xs">{r.detail}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-300">
                  {r.monthlyUsd === null ? <span className="text-gray-600">{t('infra.usageBased')}</span> : usd(r.monthlyUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-600">{t('infra.estimateNote')}</p>
      </SkeletonGate>
    </div>
  );
}
```

주의: `SkeletonGate`의 닫는 태그 위치는 ingest-health 페이지와 동일한 관용구를 따른다 (열고 본문 전체를 감싼 뒤 마지막에 닫음).

- [ ] **Step 6: 전체 검증** — `npx jest` 전체 PASS · `npm run build` 성공 후 라우트 표에서 `/api/infra`가 **ƒ (Dynamic)**, `/infra-cost`가 ○인지 확인

- [ ] **Step 7: 문서** — `app/CLAUDE.md` Directory Layout에 `infra-cost/` 행 추가 (`대시보드 자체 인프라 상태·비용 (self-introspection, /api/infra)`), `app/components/CLAUDE.md`의 Header 항목(있으면)에 "days/onDaysChange는 옵셔널 — 없으면 기간 픽커 미렌더 (/infra-cost)" 한 줄.

- [ ] **Step 8: Commit**

```bash
git add app/components/layout/Header.tsx app/infra-cost/page.tsx app/components/layout/Sidebar.tsx lib/i18n.tsx app/CLAUDE.md app/components/CLAUDE.md
git commit -m "feat(pages): /infra-cost — live infra status, CloudWatch metrics, cost estimates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5 (운영, 컨트롤러): CDK 배포 → 이미지 배포 → 라이브 검증

- [ ] `cd infra && npx cdk diff KiroDashboardEcs` (`.env.deploy` 소싱 + `AWS_REGION=ap-northeast-2` 강제 — 런북 Trap 5) → 델타가 IAM 정책 + 영원한 X-Custom-Secret 회전뿐인지 확인 → 회전이 있으므로 런북대로 **Ecs+Cdn 한 명령** 배포 여부 판정
- [ ] CDK 배포 후: 이미지 Path A (build → docker → ECR latest+sha → force-new-deployment → stable)
- [ ] 라이브 검증: ALB+시크릿 헤더로 `/api/infra` → ECS/ALB/CloudFront/ECR 4종 healthy, 지표 숫자 존재, fixedMonthlyUsd ≈ $80±, unknown 없음
