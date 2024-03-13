import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cloudmap from 'aws-cdk-lib/aws-servicediscovery';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ecsp from 'aws-cdk-lib/aws-ecs-patterns';
import * as ecr from 'aws-cdk-lib/aws-ecr';

const vpcId = 'vpc-0123456789abcdefg'
const certArn = 'arn:aws:acm:ap-northeast-1:123456789012:certificate/abcdefgh-0123-ijkl-4567-mnopqrstuvwx';
const record = 'cache';
const containerImage = 'keycloak/keycloak:23.0.6';
const repoPrefix = 'kc-quay';

export class KeyCloakStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, 'vpc', { vpcId: vpcId });
    const certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', certArn);
    const kcImageUrl = `${this.account}.dkr.ecr.${this.region}.amazonaws.com/${repoPrefix}/${containerImage}`;

    // VPC Endpoint
    vpc.addInterfaceEndpoint('EcrEndpoint', { service: ec2.InterfaceVpcEndpointAwsService.ECR, });
    vpc.addInterfaceEndpoint('EcrDockerEndpoint', { service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER, });
    vpc.addInterfaceEndpoint('LogsEndpoint', { service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS, });
    vpc.addInterfaceEndpoint('SsmEndpoint', { service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER, });
    vpc.addGatewayEndpoint('S3Endpoint', { service: ec2.GatewayVpcEndpointAwsService.S3, });

    // ECR PullThrough Cache
    new ecr.CfnPullThroughCacheRule(this, `pullthroughcacherule`, {
      ecrRepositoryPrefix: repoPrefix,
      upstreamRegistryUrl: "quay.io"
    });

    // Advanced LoadBalancer (ALB)
    const albSg = new ec2.SecurityGroup(this, "albSg", {
      vpc,
      allowAllOutbound: true,
      description: "security group for a ALB"
    });

    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'allow HTTPS access from the world');

    const alb = new elbv2.ApplicationLoadBalancer(this, 'alb', {
      vpc,
      internetFacing: false,
      loadBalancerName: 'kc-alb'
    });

    alb.addSecurityGroup(albSg)

    // RDS
    const rdsSg = new ec2.SecurityGroup(this, "rdsSg", {
      vpc,
      allowAllOutbound: true,
      description: "security group for a RDS"
    });
    rdsSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3306), 'allow MySQL access from the world');

    const rdsInstance = new rds.DatabaseInstance(this, "RDS", {
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_28, }),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      databaseName: 'kc_db',
      vpc: vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      securityGroups: [rdsSg],
      credentials: rds.Credentials.fromGeneratedSecret('dbSecret'),
      publiclyAccessible: false,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      }
    });

    const secretsmanager = rdsInstance.secret!;

    // Namespace, Service Discovery
    const kcNamespace = new cloudmap.PrivateDnsNamespace(this, 'kc-namespace', {
      vpc,
      name: 'kc-ns',
    });

    // Iam Role for ECS
    const ecsExecutionRole = new iam.Role(this, 'EcsTaskExecutionRole', {
      roleName: 'ecs-task-execution-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    })

    ecsExecutionRole.attachInlinePolicy(new iam.Policy(this, 'SecretsManagerAccess', {
      statements: [new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [secretsmanager.secretArn],
      })],
    }))

    ecsExecutionRole.attachInlinePolicy(new iam.Policy(this, 'PullThroughCachePolicy', {
      statements: [new iam.PolicyStatement({
        actions: ['ecr:CreateRepository', "ecr:BatchImportUpstreamImage"],
        resources: [`arn:aws:ecr:${this.region}:${this.account}:repository/${repoPrefix}/*`],
      })],
    }))

    const ecsServiceTaskRole = new iam.Role(this, 'EcsServiceTaskRole', {
      roleName: 'ecs-service-task-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    })

    // ECS
    const image = ecs.ContainerImage.fromRegistry(kcImageUrl);

    const kcCluster = new ecs.Cluster(this, 'kcCluster', {
      clusterName: 'kc-cluster',
      vpc: vpc,
    })

    const kcTaskDef = new ecs.FargateTaskDefinition(this, 'KeyCloakTask', {
      cpu: 1024,
      memoryLimitMiB: 2048,
      executionRole: ecsExecutionRole,
      taskRole: ecsServiceTaskRole,
    })

    kcTaskDef.addContainer('serviceTaskContainerDefinition', {
      image,
      cpu: 0,
      command: ['start'],
      environment: {
        'KC_HOSTNAME': alb.loadBalancerDnsName,
        'KC_HOSTNAME_ADMIN_URL': 'https://' + alb.loadBalancerDnsName,
        'KC_PROXY': 'edge',
        'KC_DB_URL_DATABASE': 'kc_db',
        'KC_DB_URL_PORT': '3306',
        'KC_DB_URL': 'jdbc:mysql://${KC_DB_URL_HOST}:${KC_DB_URL_PORT}/${KC_DB_URL_DATABASE}',
        'KC_DB': 'mysql',
        'KC_HTTP_ENABLED': 'true',
        'KC_HOSTNAME_STRICT': 'false',
        'KC_HOSTNAME_STRICT_HTTPS': 'false',
        'KC_CACHE': 'ispn',
        'KC_CACHE_STACK': 'kubernetes',
        'KEYCLOAK_ADMIN': 'admin',
        'KEYCLOAK_ADMIN_PASSWORD': 'admin',
        'JAVA_OPTS_APPEND': '-Djgroups.dns.query=' + record + '.' + kcNamespace.namespaceName,
      },
      secrets: {
        'KC_DB_URL_HOST': ecs.Secret.fromSecretsManager(secretsmanager, 'host'),
        'KC_DB_USERNAME': ecs.Secret.fromSecretsManager(secretsmanager, 'username'),
        'KC_DB_PASSWORD': ecs.Secret.fromSecretsManager(secretsmanager, 'password'),
      },
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: "kc-service",
      }),
    }).addPortMappings({
      name: 'kc-8080-tcp',
      containerPort: 8080,
      protocol: ecs.Protocol.TCP,
      appProtocol: ecs.AppProtocol.http,
      hostPort: 8080,
    })

    const ecsSg = new ec2.SecurityGroup(this, "ecsSg", {
      vpc,
      allowAllOutbound: true,
      description: "security group for a Fargate"
    });
    ecsSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allTraffic(), 'allow access to Fargate');

    const kcService = new ecsp.ApplicationLoadBalancedFargateService(this, 'KeyCloakService', {
      serviceName: 'kc-service',
      loadBalancer: alb,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificate: certificate,
      taskDefinition: kcTaskDef,
      enableExecuteCommand: true,
      cluster: kcCluster,
      assignPublicIp: false,
      taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [ecsSg],
      desiredCount: 2,
      cloudMapOptions: {
        name: record,
        cloudMapNamespace: kcNamespace,
        containerPort: 8080,
        dnsRecordType: cloudmap.DnsRecordType.A,
        dnsTtl: cdk.Duration.seconds(30),
      }
    })
  }
};
