import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface EcsStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  albSg: ec2.SecurityGroup;
  ecsSg: ec2.SecurityGroup;
}

export class EcsStack extends cdk.Stack {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly customSecret: string;

  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    this.customSecret = `${this.stackName}-secret-${this.account}`;

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

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonAthenaFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSGlueConsoleFullAccess'),
      ],
      inlinePolicies: {
        IdentityStorePolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['identitystore:ListUsers', 'identitystore:DescribeUser'],
              resources: ['*'],
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
        ATHENA_DATABASE: 'titanlog',
        ATHENA_OUTPUT_BUCKET: 's3://whchoi01-titan-q-log/athena-results/',
        GLUE_TABLE_NAME: 'user_report',
        IDENTITY_STORE_ID: 'd-90663be888',
        NEXTAUTH_URL: '',
        NEXTAUTH_SECRET: 'change-me-in-production',
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

    new cdk.CfnOutput(this, 'CustomHeaderSecret', {
      value: this.customSecret,
      exportName: `${this.stackName}-CustomHeaderSecret`,
    });
  }
}
