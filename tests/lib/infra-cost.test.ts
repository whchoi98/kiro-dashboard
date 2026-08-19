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
