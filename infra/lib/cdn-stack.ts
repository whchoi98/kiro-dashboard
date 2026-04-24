import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface CdnStackProps extends cdk.StackProps {
  alb: elbv2.ApplicationLoadBalancer;
  customSecret: string;
  userPool: cognito.IUserPool;
  edgeClientId: string;
  userPoolDomain: string;
}

export class CdnStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CdnStackProps) {
    super(scope, id, props);

    const cognitoRegion = 'ap-northeast-2';
    const cognitoDomain = `${props.userPoolDomain}.auth.${cognitoRegion}.amazoncognito.com`;

    const ssmConfig = new cr.AwsCustomResource(this, 'SsmEdgeAuthConfig', {
      onCreate: {
        service: 'SSM',
        action: 'putParameter',
        parameters: {
          Name: '/kiro-dashboard/edge-auth/config',
          Value: JSON.stringify({
            userPoolId: props.userPool.userPoolId,
            clientId: props.edgeClientId,
            cognitoDomain,
            cognitoRegion,
          }),
          Type: 'String',
          Overwrite: true,
        },
        region: 'us-east-1',
        physicalResourceId: cr.PhysicalResourceId.of('edge-auth-ssm-config'),
      },
      onUpdate: {
        service: 'SSM',
        action: 'putParameter',
        parameters: {
          Name: '/kiro-dashboard/edge-auth/config',
          Value: JSON.stringify({
            userPoolId: props.userPool.userPoolId,
            clientId: props.edgeClientId,
            cognitoDomain,
            cognitoRegion,
          }),
          Type: 'String',
          Overwrite: true,
        },
        region: 'us-east-1',
        physicalResourceId: cr.PhysicalResourceId.of('edge-auth-ssm-config'),
      },
      onDelete: {
        service: 'SSM',
        action: 'deleteParameter',
        parameters: {
          Name: '/kiro-dashboard/edge-auth/config',
        },
        region: 'us-east-1',
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['ssm:PutParameter', 'ssm:DeleteParameter'],
          resources: [`arn:aws:ssm:us-east-1:${this.account}:parameter/kiro-dashboard/edge-auth/config`],
        }),
      ]),
    });

    const edgeFunction = new cloudfront.experimental.EdgeFunction(
      this,
      'EdgeAuthFunction',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(
          path.join(__dirname, '..', 'lambda', 'edge-auth'),
          {
            bundling: {
              image: lambda.Runtime.NODEJS_20_X.bundlingImage,
              command: [
                'bash', '-c',
                [
                  'cp -r /asset-input/* /asset-output/',
                  'cd /asset-output',
                  'npm ci --omit=dev',
                  'npx esbuild index.ts --bundle --platform=node --target=node20 --outfile=index.js --external:@aws-sdk/*',
                  'rm -rf node_modules src *.ts tsconfig.json package-lock.json',
                ].join(' && '),
              ],
              user: 'root',
            },
          }
        ),
        timeout: cdk.Duration.seconds(5),
        memorySize: 128,
        stackId: 'KiroDashboardEdgeLambda',
      }
    );

    edgeFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [`arn:aws:ssm:us-east-1:${this.account}:parameter/kiro-dashboard/edge-auth/config`],
      })
    );

    edgeFunction.node.addDependency(ssmConfig);

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.HttpOrigin(props.alb.loadBalancerDnsName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          readTimeout: cdk.Duration.seconds(60),
          customHeaders: {
            'X-Custom-Secret': props.customSecret,
          },
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        edgeLambdas: [
          {
            functionVersion: edgeFunction.currentVersion,
            eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
          },
        ],
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
    });

    new cr.AwsCustomResource(this, 'UpdateEdgeClientCallbackUrls', {
      onCreate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'updateUserPoolClient',
        parameters: {
          UserPoolId: props.userPool.userPoolId,
          ClientId: props.edgeClientId,
          CallbackURLs: [
            `https://${distribution.distributionDomainName}/auth/callback`,
          ],
          LogoutURLs: [
            `https://${distribution.distributionDomainName}`,
          ],
          AllowedOAuthFlows: ['code'],
          AllowedOAuthScopes: ['openid', 'email', 'profile'],
          AllowedOAuthFlowsUserPoolClient: true,
          SupportedIdentityProviders: ['COGNITO'],
        },
        region: cognitoRegion,
        physicalResourceId: cr.PhysicalResourceId.of('update-edge-client-urls'),
      },
      onUpdate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'updateUserPoolClient',
        parameters: {
          UserPoolId: props.userPool.userPoolId,
          ClientId: props.edgeClientId,
          CallbackURLs: [
            `https://${distribution.distributionDomainName}/auth/callback`,
          ],
          LogoutURLs: [
            `https://${distribution.distributionDomainName}`,
          ],
          AllowedOAuthFlows: ['code'],
          AllowedOAuthScopes: ['openid', 'email', 'profile'],
          AllowedOAuthFlowsUserPoolClient: true,
          SupportedIdentityProviders: ['COGNITO'],
        },
        region: cognitoRegion,
        physicalResourceId: cr.PhysicalResourceId.of('update-edge-client-urls'),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['cognito-idp:UpdateUserPoolClient'],
          resources: [props.userPool.userPoolArn],
        }),
      ]),
    });

    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL',
      exportName: `${this.stackName}-CloudFrontURL`,
    });
  }
}
