import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53resolver from 'aws-cdk-lib/aws-route53resolver';
import { aws_ram as ram } from 'aws-cdk-lib';
import { Construct, ConstructOrder } from 'constructs';
import { IInfraDef } from '../interfaces';

const path = ('../config/infra.json');
const infraDef: IInfraDef = require(path);
const namePrefix = infraDef.namePrefix;

const app = new cdk.App()
export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create Transit Gateway and related resources
    // Reference https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.CfnTransitGateway.html
    const transitGateway = new ec2.CfnTransitGateway(this, 'transitGateway', {
      amazonSideAsn: infraDef.bgpAsn,
      autoAcceptSharedAttachments: 'disable',
      defaultRouteTableAssociation: 'disable',
      defaultRouteTablePropagation: 'disable',
      description: 'Transit Gateway',
      dnsSupport: 'enable',
      vpnEcmpSupport: 'enable',
      multicastSupport: 'disable',
      tags: [{
        key: 'Name',
        value: namePrefix + '_tgw',
      }],
      transitGatewayCidrBlocks: [infraDef.tgwCidr],
    });

    const cfnResourceShare = new ram.CfnResourceShare(this, 'ResourceShare', {
      name: 'tgwShare-ram',
      resourceArns: [
        `arn:aws:ec2:${this.region}:${this.account}:transit-gateway/${transitGateway.ref}`,
      ],
      principals: infraDef.trustAccounts
    })

    // Create Transit Gateway Route Table
    // - SharedServiceRouteTable
    // - ProdRouteTable
    // - DevRouteTable
    // Reference https://github.com/aws-samples/aws-transit-gateway-egress-vpc-pattern/blob/master/lib/egress_vpc-tg-demo-stack.ts

    const serviceRouteTable = new ec2.CfnTransitGatewayRouteTable(this, "TGRouteTableService", {
      transitGatewayId: transitGateway.ref,
      tags: [{
        key: 'Name',
        value: namePrefix + "_SharedServiceRouteDomain",
      }],
    });

    const prodRouteTable = new ec2.CfnTransitGatewayRouteTable(this, "TGRouteTableProd", {
      transitGatewayId: transitGateway.ref,
      tags: [{
        key: 'Name',
        value: namePrefix + "_ProdRouteDomain",
      }],
    });

    const devRouteTable = new ec2.CfnTransitGatewayRouteTable(this, "TGRouteTableDev", {
      transitGatewayId: transitGateway.ref,
      tags: [{
        key: 'Name',
        value: namePrefix + "_DevRouteDomain",
      }],
    });

    // IF vpcCidr is provided, Create VPC and related resources
    // Crate VPC and enable VPC flowlog
    if (infraDef.vpcCidr) {

      const vpc = new ec2.Vpc(this, 'vpc', {
        vpcName: namePrefix + '_vpc',
        maxAzs: 2,
        ipAddresses: ec2.IpAddresses.cidr(infraDef.vpcCidr),
        createInternetGateway: false,
        enableDnsHostnames: true,
        enableDnsSupport: true,
        subnetConfiguration: [{
          cidrMask: 24,
          name: namePrefix,
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }]
      });

      vpc.addFlowLog('FlowLogsToS3', {
        destination: ec2.FlowLogDestination.toS3()
      });

      // vpcSubnets
      const vpcSubnets = vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED })

      // If zoneName is provided, enable Private Hosted Zone
      if (infraDef.zoneNames.length > 0) {
        infraDef.zoneNames.forEach((zoneName) => {
          const privateHostedZone = new route53.PrivateHostedZone(this, 'HostedZone_' + zoneName, {
            zoneName: zoneName,
            vpc: vpc
          });
        });

        // Creates a Security Group for Route53 Resolver endpoint
        const route53InboundSG = new ec2.SecurityGroup(this, 'route53InboundSG', {
          vpc: vpc,
          description: 'Allow access to the DNS',
          allowAllOutbound: true,
        });

        // If srcIps for DNS is provided, add ingress rules for Security Group
        if (infraDef.srcIps) {
          for (const srcIp of infraDef.srcIps) {
            route53InboundSG.addIngressRule(ec2.Peer.ipv4(srcIp), ec2.Port.tcp(53), 'Allow TCP 53');
            route53InboundSG.addIngressRule(ec2.Peer.ipv4(srcIp), ec2.Port.udp(53), 'Allow UDP 53');
          };
        };

        // Creates a Route53 Resolver endpoint
        const resolverEndpoint = new route53resolver.CfnResolverEndpoint(this, 'resolverEndpoint', {
          direction: 'inbound',
          ipAddresses: vpcSubnets.subnetIds.map((sn) => ({ subnetId: sn })),
          securityGroupIds: [route53InboundSG.securityGroupId],
          name: namePrefix + '_endpoint',
        });

      };

      // Create Transit Gateway Attachment for private subnets
      const transitGatewayAttachment = new ec2.CfnTransitGatewayAttachment(this, 'transitGatewayAttachment', {
        transitGatewayId: transitGateway.ref,
        vpcId: vpc.vpcId,
        subnetIds: vpcSubnets.subnetIds
      });

      // Create Transit Gateway Connect
      const transitGatewayConnect = new ec2.CfnTransitGatewayConnect(this, 'transitGatewayConnect', {
        options: { protocol: 'gre', },
        transportTransitGatewayAttachmentId: transitGatewayAttachment.ref,
        tags: [{
          key: 'Name',
          value: namePrefix + '_connect',
        }],
      });

      // Associate Tgw and TgwRouteTable
      const tgwRouteTableAssociationSharedService = new ec2.CfnTransitGatewayRouteTableAssociation(this, "tgwRtbAssociationService", {
        transitGatewayAttachmentId: transitGatewayAttachment.ref,
        transitGatewayRouteTableId: serviceRouteTable.ref,
      });

      // Output
      new cdk.CfnOutput(this, 'vpcId', {
        value: vpc.vpcId,
      })
      new cdk.CfnOutput(this, 'transitGatewayId', {
        value: transitGateway.attrId,
      })

    }
  }
}