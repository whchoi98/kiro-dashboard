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
  });

  it('derives the S3_REPORT_PREFIX default from the deploying account, matching CatalogStack', () => {
    // Kiro delivers UAR CSVs under AWSLogs/<subscriber-account>/ — always the
    // account being deployed to. On the maintainer account (120443221648) this
    // resolves to the exact upstream value; on a fork it matches the Glue
    // table LOCATION that bin/app.ts computes for CatalogStack, instead of
    // silently pointing /api/model-usage at the maintainer's account path.
    const template = synthEcsStack();
    const env = getContainerEnv(template);
    const byName = Object.fromEntries(env.map((e) => [e.Name, e.Value]));

    expect(byName.S3_REPORT_PREFIX).toBe(
      'q-user-log/AWSLogs/111111111111/KiroLogs/user_report/us-east-1/'
    );
  });

  it('derives S3_REPORT_PREFIX from the account even when other overrides are set', () => {
    const template = synthEcsStack({
      dashboard: { athenaDataBucket: 'my-kiro-logs-bucket' },
    });
    const env = getContainerEnv(template);
    const byName = Object.fromEntries(env.map((e) => [e.Name, e.Value]));

    expect(byName.S3_REPORT_PREFIX).toBe(
      'q-user-log/AWSLogs/111111111111/KiroLogs/user_report/us-east-1/'
    );
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

  it('derives the Athena results bucket from the data bucket when only the data bucket is set', () => {
    // A fork that opts in with just ATHENA_DATA_BUCKET_NAME must not have its
    // Athena results written to (and its PutObject IAM scoped to) the
    // maintainer's bucket, which its account cannot access. The config
    // comment says the data bucket is "usually the same" bucket — make that
    // the default instead of the maintainer fallback.
    const template = synthEcsStack({
      dashboard: { athenaDataBucket: 'my-kiro-logs-bucket' },
    });
    const env = getContainerEnv(template);
    const byName = Object.fromEntries(env.map((e) => [e.Name, e.Value]));

    expect(byName.ATHENA_OUTPUT_BUCKET).toBe('s3://my-kiro-logs-bucket/athena-results/');

    const roles = template.findResources('AWS::IAM::Role');
    const serialized = JSON.stringify(roles);
    expect(serialized).not.toContain('whchoi01-titan-q-log');
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

  it('exposes S3_DATA_BUCKET to the container when the data bucket differs from the results bucket', () => {
    // /api/model-usage lists UAR CSVs directly from S3. It derives its bucket
    // from ATHENA_OUTPUT_BUCKET, so in a two-bucket setup it would list the
    // results bucket (where no CSVs live) and silently render empty. The
    // container needs the data bucket name explicitly.
    const template = synthEcsStack({
      dashboard: { athenaDataBucket: 'my-data-bucket', athenaResultsBucket: 'my-results-bucket' },
    });
    const env = getContainerEnv(template);
    const byName = Object.fromEntries(env.map((e) => [e.Name, e.Value]));

    expect(byName.S3_DATA_BUCKET).toBe('my-data-bucket');
  });

  it('omits S3_DATA_BUCKET when no data bucket override is provided', () => {
    const template = synthEcsStack();
    const env = getContainerEnv(template);
    const byName = Object.fromEntries(env.map((e) => [e.Name, e.Value]));

    expect(byName.S3_DATA_BUCKET).toBeUndefined();
  });
});
