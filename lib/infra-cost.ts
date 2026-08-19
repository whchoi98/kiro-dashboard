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
