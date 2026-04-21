import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface SecurityStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class SecurityStack extends cdk.Stack {
  public readonly albSg: ec2.SecurityGroup;
  public readonly ecsSg: ec2.SecurityGroup;
  public readonly taskRole: iam.Role;
  public readonly executionRole: iam.Role;

  constructor(scope: Construct, id: string, props: SecurityStackProps) {
    super(scope, id, props);

    // CloudFront Prefix List parameter
    const cfPrefixListId = new cdk.CfnParameter(this, 'CloudFrontPrefixListId', {
      type: 'String',
      description: 'CloudFront managed prefix list ID for ALB ingress',
      default: 'pl-3b927c52',
    });

    // ALB Security Group
    this.albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc: props.vpc,
      description: 'ALB security group - allows CloudFront prefix list on port 80',
      allowAllOutbound: true,
    });

    new ec2.CfnSecurityGroupIngress(this, 'AlbIngressFromCloudFront', {
      groupId: this.albSg.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 80,
      toPort: 80,
      sourcePrefixListId: cfPrefixListId.valueAsString,
      description: 'Allow HTTP from CloudFront prefix list',
    });

    // ECS Security Group
    this.ecsSg = new ec2.SecurityGroup(this, 'EcsSg', {
      vpc: props.vpc,
      description: 'ECS tasks security group',
      allowAllOutbound: true,
    });

    this.ecsSg.addIngressRule(
      ec2.Peer.securityGroupId(this.albSg.securityGroupId),
      ec2.Port.tcp(3000),
      'Allow traffic from ALB on port 3000',
    );

    // Cognito User Pool
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'kiro-dashboard-users',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireDigits: true,
        requireLowercase: false,
        requireSymbols: false,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // User Pool Client
    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: ['http://localhost:3000'],
      },
    });

    // Cognito Domain
    const userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool,
      cognitoDomain: {
        domainPrefix: `kiro-dashboard-${this.account}`,
      },
    });

    // Task Role
    this.taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'ECS task role for kiro-dashboard',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonAthenaFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSGlueConsoleFullAccess'),
      ],
      inlinePolicies: {
        IdentityStorePolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'identitystore:ListUsers',
                'identitystore:DescribeUser',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // Execution Role
    this.executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'ECS task execution role for kiro-dashboard',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `${this.stackName}-UserPoolId`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `${this.stackName}-UserPoolClientId`,
    });

    new cdk.CfnOutput(this, 'CognitoIssuer', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      description: 'Cognito OIDC Issuer URL',
      exportName: `${this.stackName}-CognitoIssuer`,
    });

    new cdk.CfnOutput(this, 'CognitoDomain', {
      value: `https://${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito Hosted UI Domain',
      exportName: `${this.stackName}-CognitoDomain`,
    });
  }
}
