#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { SecurityStack } from '../lib/security-stack';
import { EcsStack } from '../lib/ecs-stack';
import { CdnStack } from '../lib/cdn-stack';

const app = new cdk.App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-2' };

const networkStack = new NetworkStack(app, 'KiroDashboardNetwork', { env, description: 'Kiro Dashboard - VPC and networking' });
const securityStack = new SecurityStack(app, 'KiroDashboardSecurity', { env, description: 'Kiro Dashboard - Security groups, Cognito, IAM', vpc: networkStack.vpc });
const ecsStack = new EcsStack(app, 'KiroDashboardEcs', { env, description: 'Kiro Dashboard - ECS Fargate, ALB, Auto Scaling', vpc: networkStack.vpc, albSg: securityStack.albSg, ecsSg: securityStack.ecsSg, taskRole: securityStack.taskRole, executionRole: securityStack.executionRole });
const customSecret = `KiroDashboardEcs-secret-${env.account}`;
new CdnStack(app, 'KiroDashboardCdn', { env, description: 'Kiro Dashboard - CloudFront distribution', alb: ecsStack.alb, customSecret });
app.synth();
