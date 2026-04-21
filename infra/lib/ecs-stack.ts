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
  taskRole: iam.Role;
  executionRole: iam.Role;
}

export class EcsStack extends cdk.Stack {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly customSecret: string;

  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    this.customSecret = `${this.stackName}-secret-${this.account}`;

    // ECR Repository
    const repository = new ecr.Repository(this, 'Repository', {
      repositoryName: 'kiro-dashboard',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: 'kiro-dashboard-cluster',
      vpc: props.vpc,
    });

    // Log Group
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/ecs/kiro-dashboard',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Task Definition
    const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: 512,
      memoryLimitMiB: 1024,
      taskRole: props.taskRole,
      executionRole: props.executionRole,
    });

    // Container
    taskDef.addContainer('AppContainer', {
      image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
      portMappings: [{ containerPort: 3000 }],
      environment: {
        AWS_REGION: this.region,
        ATHENA_DATABASE: 'kiro_dashboard',
        NEXT_PUBLIC_COGNITO_REGION: this.region,
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'kiro-dashboard',
        logGroup,
      }),
      healthCheck: {
        command: ['CMD-SHELL', 'wget -q -O /dev/null http://localhost:3000/api/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // ALB
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      loadBalancerName: 'kiro-dashboard-alb',
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.albSg,
      idleTimeout: cdk.Duration.seconds(120),
    });

    // Listener
    const listener = this.alb.addListener('HttpListener', {
      port: 80,
      defaultAction: elbv2.ListenerAction.fixedResponse(403, {
        contentType: 'text/plain',
        messageBody: 'Forbidden',
      }),
    });

    // Target Group
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

    // Listener rule: forward only when X-Custom-Secret header matches
    new elbv2.ApplicationListenerRule(this, 'ListenerRule', {
      listener,
      priority: 100,
      conditions: [
        elbv2.ListenerCondition.httpHeader('X-Custom-Secret', [this.customSecret]),
      ],
      action: elbv2.ListenerAction.forward([targetGroup]),
    });

    // Fargate Service
    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      securityGroups: [props.ecsSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
    });

    service.attachToApplicationTargetGroup(targetGroup);

    // Auto Scaling
    const scaling = service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 4,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
    });

    // Outputs
    new cdk.CfnOutput(this, 'ALBEndpoint', {
      value: this.alb.loadBalancerDnsName,
      description: 'ALB DNS name',
      exportName: `${this.stackName}-ALBEndpoint`,
    });

    new cdk.CfnOutput(this, 'ECRRepositoryUri', {
      value: repository.repositoryUri,
      description: 'ECR Repository URI',
      exportName: `${this.stackName}-ECRRepositoryUri`,
    });

    new cdk.CfnOutput(this, 'CustomHeaderSecret', {
      value: this.customSecret,
      description: 'Custom header secret value for CloudFront origin',
      exportName: `${this.stackName}-CustomHeaderSecret`,
    });
  }
}
