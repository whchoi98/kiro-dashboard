import * as crypto from 'crypto';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

/**
 * Optional dashboard configuration. When provided, the ECS task's environment
 * variables, S3 IAM scope, and Glue IAM scope are overridden so a fork can
 * point at its own account's Kiro User Activity Report bucket / Glue catalog.
 * When undefined, the upstream maintainer defaults are used unchanged — a
 * fresh `cdk deploy` on the maintainer's account continues to work.
 */
export interface EcsDashboardConfig {
  athenaResultsBucket?: string;
  athenaResultsPrefix?: string;
  athenaDatabase?: string;
  glueTableName?: string;
  identityStoreId?: string;
  s3ReportPrefix?: string;
  /**
   * Separate bucket holding the Kiro User Activity Report CSV files. Usually
   * the same as `athenaResultsBucket`; only set when the data bucket differs
   * from the Athena query-results bucket. When set, it is granted S3 read IAM.
   */
  athenaDataBucket?: string;
}

export interface EcsStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  albSg: ec2.SecurityGroup;
  ecsSg: ec2.SecurityGroup;
  dashboard?: EcsDashboardConfig;
}

export class EcsStack extends cdk.Stack {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly customSecret: string;

  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    this.customSecret = crypto.randomUUID();

    const nextAuthSecret = new secretsmanager.Secret(this, 'NextAuthSecret', {
      secretName: 'kiro-dashboard/nextauth-secret',
      generateSecretString: { excludePunctuation: true, passwordLength: 64 },
    });

    const repository = new ecr.Repository(this, 'Repository', {
      repositoryName: 'kiro-dashboard',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: 'kiro-dashboard-cluster',
      vpc: props.vpc,
    });

    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/ecs/kiro-dashboard',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Maintainer defaults — unchanged when no dashboard config is provided.
    // Fork/operator-specific overrides flow in through `props.dashboard`.
    // When only the data bucket is overridden, Athena results default into
    // that same bucket (the buckets are usually one and the same) rather
    // than the maintainer's bucket, which a fork account cannot write to.
    const athenaResultsBucket =
      props.dashboard?.athenaResultsBucket ??
      props.dashboard?.athenaDataBucket ??
      'whchoi01-titan-q-log';
    const athenaResultsPrefix = props.dashboard?.athenaResultsPrefix ?? 'athena-results';
    const athenaDatabase = props.dashboard?.athenaDatabase ?? 'titanlog';
    const glueTableName = props.dashboard?.glueTableName ?? 'user_report';
    const identityStoreId = props.dashboard?.identityStoreId ?? 'd-90663be888';
    // Kiro delivers UAR CSVs under AWSLogs/<subscriber-account>/, which is
    // always the account being deployed to — on the maintainer account this
    // resolves to the exact former hardcoded value, and on forks it matches
    // the CatalogStack reportPrefix default computed in bin/app.ts.
    const s3ReportPrefix =
      props.dashboard?.s3ReportPrefix ?? `q-user-log/AWSLogs/${this.account}/KiroLogs/user_report/us-east-1/`;
    const athenaDataBucket = props.dashboard?.athenaDataBucket;

    const s3ReadResources = [
      `arn:aws:s3:::${athenaResultsBucket}`,
      `arn:aws:s3:::${athenaResultsBucket}/*`,
    ];
    if (athenaDataBucket && athenaDataBucket !== athenaResultsBucket) {
      s3ReadResources.push(
        `arn:aws:s3:::${athenaDataBucket}`,
        `arn:aws:s3:::${athenaDataBucket}/*`,
      );
    }

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      inlinePolicies: {
        AthenaQuery: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'athena:StartQueryExecution',
                'athena:GetQueryExecution',
                'athena:GetQueryResults',
                'athena:StopQueryExecution',
                'athena:GetWorkGroup',
              ],
              resources: [`arn:aws:athena:*:${this.account}:workgroup/*`],
            }),
          ],
        }),
        S3DataAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['s3:GetObject', 's3:ListBucket', 's3:GetBucketLocation'],
              resources: s3ReadResources,
            }),
            new iam.PolicyStatement({
              actions: ['s3:PutObject', 's3:GetObject'],
              resources: [
                `arn:aws:s3:::${athenaResultsBucket}/${athenaResultsPrefix}/*`,
              ],
            }),
          ],
        }),
        GlueCatalog: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'glue:GetTable',
                'glue:GetTables',
                'glue:GetDatabase',
                'glue:GetPartitions',
              ],
              resources: [
                `arn:aws:glue:*:${this.account}:catalog`,
                `arn:aws:glue:*:${this.account}:database/${athenaDatabase}`,
                `arn:aws:glue:*:${this.account}:table/${athenaDatabase}/*`,
              ],
            }),
          ],
        }),
        IdentityStorePolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['identitystore:ListUsers', 'identitystore:DescribeUser'],
              resources: ['*'],
            }),
          ],
        }),
        BedrockInvoke: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'bedrock:InvokeModel',
                'bedrock:InvokeModelWithResponseStream',
              ],
              resources: [
                'arn:aws:bedrock:*::foundation-model/*',
                'arn:aws:bedrock:*:*:inference-profile/*',
              ],
            }),
          ],
        }),
        // Read-only self-introspection for the /infra-cost page: live status of
        // the dashboard's own ECS/ALB/CloudFront/ECR plus CloudWatch metrics.
        // Describe* on ELB/CloudFront/CloudWatch has no resource-level support.
        InfraReadOnly: new iam.PolicyDocument({
          statements: [
            // ListServices supports no resource types — it must be granted on
            // '*' and least-privileged via the ecs:cluster condition key.
            new iam.PolicyStatement({
              actions: ['ecs:ListServices'],
              resources: ['*'],
              conditions: {
                ArnEquals: {
                  'ecs:cluster': `arn:aws:ecs:${this.region}:${this.account}:cluster/kiro-dashboard-cluster`,
                },
              },
            }),
            new iam.PolicyStatement({
              actions: [
                'ecs:DescribeClusters',
                'ecs:DescribeServices',
                'ecs:ListTasks',
                'ecs:DescribeTasks',
              ],
              resources: [
                `arn:aws:ecs:${this.region}:${this.account}:cluster/kiro-dashboard-cluster`,
                `arn:aws:ecs:${this.region}:${this.account}:service/kiro-dashboard-cluster/*`,
                `arn:aws:ecs:${this.region}:${this.account}:task/kiro-dashboard-cluster/*`,
                `arn:aws:ecs:${this.region}:${this.account}:container-instance/kiro-dashboard-cluster/*`,
              ],
            }),
            new iam.PolicyStatement({
              actions: [
                'elasticloadbalancing:DescribeLoadBalancers',
                'elasticloadbalancing:DescribeTargetGroups',
                'elasticloadbalancing:DescribeTargetHealth',
                'cloudfront:ListDistributions',
                'cloudfront:GetDistribution',
                'cloudwatch:GetMetricData',
              ],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              actions: ['ecr:DescribeRepositories', 'ecr:DescribeImages'],
              resources: [
                `arn:aws:ecr:${this.region}:${this.account}:repository/kiro-dashboard`,
              ],
            }),
          ],
        }),
      },
    });

    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: 512,
      memoryLimitMiB: 1024,
      taskRole,
      executionRole,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    taskDef.addContainer('AppContainer', {
      image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
      portMappings: [{ containerPort: 3000 }],
      environment: {
        HOSTNAME: '0.0.0.0',
        AWS_REGION: 'us-east-1',
        ATHENA_DATABASE: athenaDatabase,
        ATHENA_OUTPUT_BUCKET: `s3://${athenaResultsBucket}/${athenaResultsPrefix}/`,
        GLUE_TABLE_NAME: glueTableName,
        IDENTITY_STORE_ID: identityStoreId,
        S3_REPORT_PREFIX: s3ReportPrefix,
        // /api/model-usage lists UAR CSVs S3-direct; in a two-bucket setup it
        // must target the data bucket, not the Athena results bucket.
        ...(athenaDataBucket ? { S3_DATA_BUCKET: athenaDataBucket } : {}),
        NEXTAUTH_URL: '',
      },
      secrets: {
        NEXTAUTH_SECRET: ecs.Secret.fromSecretsManager(nextAuthSecret),
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'kiro-dashboard',
        logGroup,
      }),
      healthCheck: {
        command: ['CMD-SHELL', 'node -e "const http=require(\'http\');const r=http.get(\'http://localhost:3000/api/health\',res=>{process.exit(res.statusCode===200?0:1)});r.on(\'error\',()=>process.exit(1))"'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      loadBalancerName: 'kiro-dashboard-alb',
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.albSg,
      idleTimeout: cdk.Duration.seconds(120),
    });

    const listener = this.alb.addListener('HttpListener', {
      port: 80,
      defaultAction: elbv2.ListenerAction.fixedResponse(403, {
        contentType: 'text/plain',
        messageBody: 'Forbidden',
      }),
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc: props.vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/api/health',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    new elbv2.ApplicationListenerRule(this, 'ListenerRule', {
      listener,
      priority: 100,
      conditions: [
        elbv2.ListenerCondition.httpHeader('X-Custom-Secret', [this.customSecret]),
      ],
      action: elbv2.ListenerAction.forward([targetGroup]),
    });

    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      securityGroups: [props.ecsSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
    });

    service.attachToApplicationTargetGroup(targetGroup);

    const scaling = service.autoScaleTaskCount({ minCapacity: 1, maxCapacity: 4 });
    scaling.scaleOnCpuUtilization('CpuScaling', { targetUtilizationPercent: 70 });

    new cdk.CfnOutput(this, 'ALBEndpoint', {
      value: this.alb.loadBalancerDnsName,
      exportName: `${this.stackName}-ALBEndpoint`,
    });

    new cdk.CfnOutput(this, 'ECRRepositoryUri', {
      value: repository.repositoryUri,
      exportName: `${this.stackName}-ECRRepositoryUri`,
    });

    new cdk.CfnOutput(this, 'NextAuthSecretArn', {
      value: nextAuthSecret.secretArn,
      exportName: `${this.stackName}-NextAuthSecretArn`,
    });
  }
}
