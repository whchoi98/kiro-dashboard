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

  // NOTE: iam.Role({ inlinePolicies }) embeds each policy directly in
  // AWS::IAM::Role.Properties.Policies — CDK only emits a standalone
  // AWS::IAM::Policy resource for policies attached via attachInlinePolicy()
  // / addToPrincipalPolicy() (e.g. the ECS execution role's DefaultPolicy).
  // Confirmed by dumping the synthesized template: TaskRole's inline policy
  // names (AthenaQuery, S3DataAccess, ..., InfraReadOnly) all show up inside
  // the AWS::IAM::Role resource, and template.findResources('AWS::IAM::Policy')
  // contains only ExecutionRoleDefaultPolicy. So this test targets
  // AWS::IAM::Role, not AWS::IAM::Policy.
  it('grants the exact read-only infra actions', () => {
    template.hasResourceProperties('AWS::IAM::Role', Match.objectLike({
      Policies: Match.arrayWith([
        Match.objectLike({
          PolicyName: 'InfraReadOnly',
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
        }),
      ]),
    }));
  });

  it('grants no write actions in the InfraReadOnly statements', () => {
    const roles = template.findResources('AWS::IAM::Role');
    const allActions = JSON.stringify(roles);
    for (const banned of ['ecs:UpdateService', 'ecs:RunTask', 'elasticloadbalancing:Modify', 'cloudfront:Update', 'ecr:Put']) {
      expect(allActions).not.toContain(banned);
    }
  });
});
