#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { SecurityStack } from '../lib/security-stack';
import { EcsStack } from '../lib/ecs-stack';
import { CdnStack } from '../lib/cdn-stack';
import { CatalogStack } from '../lib/catalog-stack';

// NetworkStack reads `EXISTING_VPC_ID` / `VPC_CIDR` directly from
// `process.env`, so fork operators can reuse an existing VPC without
// editing `cdk.json`. Leaving both unset falls through to "create a
// fresh VPC" which is what a first-time `cdk deploy` on a new account
// expects.
const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-2',
};

const networkStack = new NetworkStack(app, 'KiroDashboardNetwork', {
  env,
  description: 'Kiro Dashboard - VPC and networking',
});

const securityStack = new SecurityStack(app, 'KiroDashboardSecurity', {
  env,
  description: 'Kiro Dashboard - Security groups, Cognito',
  vpc: networkStack.vpc,
});

// Dashboard overrides: unset → upstream maintainer defaults (back-compat).
// Forks/operators set these to point the task at their own bucket / catalog.
const dashboardOverrides = {
  athenaResultsBucket: process.env.ATHENA_RESULTS_BUCKET_NAME,
  athenaResultsPrefix: process.env.ATHENA_RESULTS_PREFIX,
  athenaDatabase: process.env.ATHENA_DATABASE_NAME,
  glueTableName: process.env.GLUE_TABLE_NAME_OVERRIDE,
  identityStoreId: process.env.IDENTITY_STORE_ID,
  s3ReportPrefix: process.env.S3_REPORT_PREFIX,
  athenaDataBucket: process.env.ATHENA_DATA_BUCKET_NAME,
};
const hasDashboardOverride = Object.values(dashboardOverrides).some((v) => v !== undefined);

const ecsStack = new EcsStack(app, 'KiroDashboardEcs', {
  env,
  description: 'Kiro Dashboard - ECS Fargate, ALB, Auto Scaling',
  vpc: networkStack.vpc,
  albSg: securityStack.albSg,
  ecsSg: securityStack.ecsSg,
  dashboard: hasDashboardOverride ? dashboardOverrides : undefined,
});

// Opt-in Catalog stack: creates the Glue database + `user_report` table when
// the operator points at their own S3 data bucket via
// `ATHENA_DATA_BUCKET_NAME`. Required for a fresh account to run the
// dashboard without the maintainer's pre-existing Glue crawler.
//
// IMPORTANT: this stack must land in the region the ECS task queries
// Athena from (the container env hard-codes `AWS_REGION=us-east-1` in
// EcsStack). Glue databases are region-scoped, so registering the
// catalog in the CDK deployment region (e.g. ap-northeast-2) would
// leave it invisible to the runtime. Override via `ATHENA_REGION`
// if/when the ECS AWS_REGION is ever relocated.
if (process.env.ATHENA_DATA_BUCKET_NAME) {
  const catalogRegion = process.env.ATHENA_REGION ?? 'us-east-1';
  new CatalogStack(app, 'KiroDashboardCatalog', {
    env: { account: env.account, region: catalogRegion },
    description: 'Kiro Dashboard - Glue Data Catalog (user_report + by_user_analytic)',
    databaseName: process.env.ATHENA_DATABASE_NAME ?? 'titanlog',
    tableName: process.env.GLUE_TABLE_NAME_OVERRIDE ?? 'user_report',
    dataBucket: process.env.ATHENA_DATA_BUCKET_NAME,
    reportPrefix:
      process.env.S3_REPORT_PREFIX ?? `q-user-log/AWSLogs/${env.account}/KiroLogs/user_report/us-east-1/`,
    byUserAnalyticPrefix: process.env.BY_USER_ANALYTIC_PREFIX,
  });
}

new CdnStack(app, 'KiroDashboardCdn', {
  env,
  description: 'Kiro Dashboard - CloudFront distribution + Lambda@Edge auth',
  alb: ecsStack.alb,
  customSecret: ecsStack.customSecret,
  userPool: securityStack.userPool,
  edgeClientId: securityStack.edgeClientId,
  userPoolDomain: `kiro-dashboard-${env.account}`,
});

app.synth();
