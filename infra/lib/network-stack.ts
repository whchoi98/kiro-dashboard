import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const useExistingVpc = this.node.tryGetContext('useExistingVpc') === 'true';
    const vpcId: string = this.node.tryGetContext('vpcId') ?? '';
    const vpcCidr: string = this.node.tryGetContext('vpcCidr') ?? '10.254.0.0/16';

    if (useExistingVpc && vpcId) {
      this.vpc = ec2.Vpc.fromLookup(this, 'Vpc', { vpcId });
    } else {
      const newVpc = new ec2.Vpc(this, 'Vpc', {
        ipAddresses: ec2.IpAddresses.cidr(vpcCidr),
        maxAzs: 2,
        natGateways: 1,
        subnetConfiguration: [
          {
            cidrMask: 24,
            name: 'Public',
            subnetType: ec2.SubnetType.PUBLIC,
          },
          {
            cidrMask: 24,
            name: 'Private',
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          },
        ],
      });

      cdk.Tags.of(newVpc).add('Name', 'mgmt-vpc');

      // SSM VPC Endpoints security group
      const endpointSg = new ec2.SecurityGroup(this, 'EndpointSg', {
        vpc: newVpc,
        description: 'Allow HTTPS for SSM VPC endpoints',
        allowAllOutbound: false,
      });
      endpointSg.addIngressRule(
        ec2.Peer.ipv4(vpcCidr),
        ec2.Port.tcp(443),
        'Allow HTTPS from VPC CIDR',
      );

      // SSM Endpoints
      newVpc.addInterfaceEndpoint('SsmEndpoint', {
        service: ec2.InterfaceVpcEndpointAwsService.SSM,
        securityGroups: [endpointSg],
        privateDnsEnabled: true,
      });

      newVpc.addInterfaceEndpoint('SsmMessagesEndpoint', {
        service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
        securityGroups: [endpointSg],
        privateDnsEnabled: true,
      });

      newVpc.addInterfaceEndpoint('Ec2MessagesEndpoint', {
        service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
        securityGroups: [endpointSg],
        privateDnsEnabled: true,
      });

      this.vpc = newVpc;
    }

    new cdk.CfnOutput(this, 'VPCId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: `${this.stackName}-VPCId`,
    });
  }
}
