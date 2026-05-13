import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { EcsStack } from '../../infra/lib/ecs-stack';

type EnvPair = { Name: string; Value: string };

function synthEcsStack(props?: { dashboard?: {
  athenaResultsBucket?: string;
  athenaResultsPrefix?: string;
  athenaDatabase?: string;
  glueTableName?: string;
  identityStoreId?: string;
  s3ReportPrefix?: string;
  athenaDataBucket?: string;
} }) {
  const app = new cdk.App();
  const stubStack = new cdk.Stack(app, 'Stub', { env: { account: '111111111111', region: 'ap-northeast-2' } });
  const vpc = new ec2.Vpc(stubStack, 'TestVpc', { maxAzs: 2, natGateways: 1 });
  const albSg = new ec2.SecurityGroup(stubStack, 'AlbSg', { vpc });
  const ecsSg = new ec2.SecurityGroup(stubStack, 'EcsSg', { vpc });

  const stack = new EcsStack(app, 'KiroDashboardEcs', {
    env: { account: '111111111111', region: 'ap-northeast-2' },
    vpc,
    albSg,
    ecsSg,
    ...(props ?? {}),
  });
  return Template.fromStack(stack);
}

function getContainerEnv(template: Template): EnvPair[] {
  const taskDefs = template.findResources('AWS::ECS::TaskDefinition');
  const defs = Object.values(taskDefs);
  expect(defs.length).toBe(1);
  const containers = (defs[0] as any).Properties.ContainerDefinitions as Array<{ Environment: EnvPair[] }>;
  expect(containers.length).toBe(1);
  return containers[0].Environment;
}

describe('EcsStack — default maintainer configuration', () => {
  it('uses upstream maintainer bucket and identity store when no overrides provided', () => {
    const template = synthEcsStack();
    const env = getContainerEnv(template);
    const byName = Object.fromEntries(env.map((e) => [e.Name, e.Value]));

    expect(byName.ATHENA_DATABASE).toBe('titanlog');
    expect(byName.ATHENA_OUTPUT_BUCKET).toBe('s3://whchoi01-titan-q-log/athena-results/');
    expect(byName.GLUE_TABLE_NAME).toBe('user_report');
    expect(byName.IDENTITY_STORE_ID).toBe('d-90663be888');
    expect(byName.S3_REPORT_PREFIX).toBe('q-user-log/AWSLogs/120443221648/KiroLogs/user_report/us-east-1/');
  });
});

describe('EcsStack — opt-in dashboard overrides', () => {
  it('threads overrides into the container environment verbatim', () => {
    const template = synthEcsStack({
      dashboard: {
        athenaResultsBucket: 'my-athena-results-bucket',
        athenaResultsPrefix: 'custom-results',
        athenaDatabase: 'my_titanlog',
        glueTableName: 'my_user_report',
        identityStoreId: 'd-0123456789',
        s3ReportPrefix: 'my/report/prefix/',
      },
    });
    const env = getContainerEnv(template);
    const byName = Object.fromEntries(env.map((e) => [e.Name, e.Value]));

    expect(byName.ATHENA_DATABASE).toBe('my_titanlog');
    expect(byName.ATHENA_OUTPUT_BUCKET).toBe('s3://my-athena-results-bucket/custom-results/');
    expect(byName.GLUE_TABLE_NAME).toBe('my_user_report');
    expect(byName.IDENTITY_STORE_ID).toBe('d-0123456789');
    expect(byName.S3_REPORT_PREFIX).toBe('my/report/prefix/');
  });

  it('scopes the Glue IAM policy to the overridden database', () => {
    const template = synthEcsStack({
      dashboard: { athenaDatabase: 'my_titanlog' },
    });
    // TaskRole uses inline policies → embedded in AWS::IAM::Role (not a
    // separate AWS::IAM::Policy resource). Serialize and grep.
    const roles = template.findResources('AWS::IAM::Role');
    const serialized = JSON.stringify(roles);
    expect(serialized).toContain('database/my_titanlog');
    expect(serialized).toContain('table/my_titanlog/');
    expect(serialized).not.toContain('database/titanlog"');
  });

  it('includes the data bucket in S3 read resources when athenaDataBucket is provided', () => {
    const template = synthEcsStack({
      dashboard: { athenaDataBucket: 'my-kiro-logs-bucket' },
    });
    const roles = template.findResources('AWS::IAM::Role');
    const serialized = JSON.stringify(roles);
    expect(serialized).toContain('arn:aws:s3:::my-kiro-logs-bucket');
    expect(serialized).toContain('arn:aws:s3:::my-kiro-logs-bucket/*');
  });
});
