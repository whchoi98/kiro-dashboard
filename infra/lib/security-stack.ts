import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface SecurityStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class SecurityStack extends cdk.Stack {
  public readonly albSg: ec2.SecurityGroup;
  public readonly ecsSg: ec2.SecurityGroup;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly edgeClientId: string;

  constructor(scope: Construct, id: string, props: SecurityStackProps) {
    super(scope, id, props);

    const cfPrefixListId = new cdk.CfnParameter(this, 'CloudFrontPrefixListId', {
      type: 'String',
      description: 'CloudFront managed prefix list ID for ALB ingress',
      default: 'pl-22a6434b',
    });

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

    this.userPool = new cognito.UserPool(this, 'UserPool', {
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

    this.userPoolClient = this.userPool.addClient('DashboardClient', {
      generateSecret: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: ['http://localhost:3000/api/auth/callback/cognito'],
        logoutUrls: ['http://localhost:3000'],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
    });

    const edgeClient = this.userPool.addClient('EdgeAuthClient', {
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: ['https://placeholder.cloudfront.net/auth/callback'],
        logoutUrls: ['https://placeholder.cloudfront.net'],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
    });

    this.edgeClientId = edgeClient.userPoolClientId;

    this.userPool.addDomain('CognitoDomain', {
      cognitoDomain: {
        domainPrefix: `kiro-dashboard-${this.account}`,
      },
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: `${this.stackName}-UserPoolId`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      exportName: `${this.stackName}-UserPoolClientId`,
    });

    new cdk.CfnOutput(this, 'CognitoIssuer', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`,
      exportName: `${this.stackName}-CognitoIssuer`,
    });

    new cdk.CfnOutput(this, 'EdgeAuthClientId', {
      value: edgeClient.userPoolClientId,
      exportName: `${this.stackName}-EdgeAuthClientId`,
    });
  }
}
