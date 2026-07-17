import * as cdk from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../../infra/lib/network-stack';

function synth(options?: { vpcCidr?: string; envVpcCidr?: string }) {
  // NetworkStack reads VPC_CIDR / EXISTING_VPC_ID directly from process.env.
  // Clear them so each test starts from a known baseline.
  delete process.env.EXISTING_VPC_ID;
  delete process.env.VPC_CIDR;
  if (options?.envVpcCidr) process.env.VPC_CIDR = options.envVpcCidr;

  const app = new cdk.App({
    context: {
      useExistingVpc: 'false',
      vpcId: '',
      vpcCidr: options?.vpcCidr ?? '',
    },
  });
  const stack = new NetworkStack(app, 'KiroDashboardNetwork', {
    env: { account: '111111111111', region: 'ap-northeast-2' },
  });
  return Template.fromStack(stack);
}

describe('NetworkStack — default (fresh account)', () => {
  it('creates a new VPC when useExistingVpc is falsy', () => {
    const template = synth();
    template.resourceCountIs('AWS::EC2::VPC', 1);
  });

  it('uses the default CIDR 10.254.0.0/16 when none supplied', () => {
    const template = synth();
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '10.254.0.0/16',
    });
  });

  it('honors a custom CIDR from cdk.json context', () => {
    const template = synth({ vpcCidr: '10.42.0.0/16' });
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '10.42.0.0/16',
    });
  });

  it('env VPC_CIDR overrides cdk.json context', () => {
    const template = synth({ vpcCidr: '10.42.0.0/16', envVpcCidr: '10.99.0.0/16' });
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '10.99.0.0/16',
    });
  });

  it('provisions SSM endpoints alongside the new VPC', () => {
    const template = synth();
    // Three interface endpoints: SSM, SSM_MESSAGES, EC2_MESSAGES
    template.resourceCountIs('AWS::EC2::VPCEndpoint', 3);
  });

  it('emits a synth-time warning naming EXISTING_VPC_ID when a new VPC will be created', () => {
    // An operator whose environment previously imported an existing VPC (the
    // upstream maintainer deployment) would otherwise replace their entire
    // network layer on the next deploy without any signal at synth time.
    delete process.env.EXISTING_VPC_ID;
    delete process.env.VPC_CIDR;
    const app = new cdk.App({
      context: { useExistingVpc: 'false', vpcId: '', vpcCidr: '' },
    });
    const stack = new NetworkStack(app, 'KiroDashboardNetwork', {
      env: { account: '111111111111', region: 'ap-northeast-2' },
    });

    Annotations.fromStack(stack).hasWarning('*', Match.stringLikeRegexp('EXISTING_VPC_ID'));
  });
});
