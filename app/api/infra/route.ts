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
