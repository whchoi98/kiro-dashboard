#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { SecurityStack } from '../lib/security-stack';
import { EcsStack } from '../lib/ecs-stack';
import { CdnStack } from '../lib/cdn-stack';

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
