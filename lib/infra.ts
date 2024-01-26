import * as cdk from 'aws-cdk-lib';
import { aws_ram as ram } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53resolver from 'aws-cdk-lib/aws-route53resolver';
import { Construct, ConstructOrder } from 'constructs';

const ssmPrefix='/cdk-tgw/'

const app = new cdk.App()
export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const namePrefix = ssm.StringParameter.valueFromLookup(this, ssmPrefix+'namePrefix');
    const zoneName = ssm.StringParameter.valueFromLookup(this, ssmPrefix+'zoneName');
    const bgpAsn = Number(ssm.StringParameter.valueFromLookup(this, ssmPrefix+'bgpAsn'));

    // Trust Accounts
    let tAccounts = ssm.StringParameter.valueFromLookup(this, ssmPrefix+'trustAccounts');
    if (tAccounts.includes('dummy-value')) {
      tAccounts = '012345678901';
    }
    let trustAccounts = [];
    if (tAccounts.includes(',')) {
      tAccounts.split(',').forEach(acct => {
        trustAccounts.push(`${acct}`);
      })
    } else {
      trustAccounts.push(`${tAccounts}`);
    }

    let vpcCidr = ssm.StringParameter.valueFromLookup(this, ssmPrefix+'vpcCidr');
    if (vpcCidr.includes('dummy-value')) {
      vpcCidr = '172.16.0.0/16';
    }

    let tgwCidr = ssm.StringParameter.valueFromLookup(this, ssmPrefix+'tgwCidr');
    if (tgwCidr.includes('dummy-value')) {
      tgwCidr = '172.16.0.0/16';
    }

    const vpc = new ec2.Vpc(this, 'vpc', {
      vpcName: namePrefix+'-vpc',
      ipAddresses: ec2.IpAddresses.cidr(vpcCidr),
      createInternetGateway: false,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: namePrefix+'-',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }
      ]
    });

    vpc.addFlowLog('FlowLogsToS3',{
      destination: ec2.FlowLogDestination.toS3()
    });

    const privateHostedZone = new route53.PrivateHostedZone(this, 'HostedZone', {
      zoneName: zoneName,
      vpc: vpc
    });

    // Reference https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.CfnTransitGateway.html
    const transitGateway = new ec2.CfnTransitGateway(this, 'transitGateway', {
      amazonSideAsn: bgpAsn,
      autoAcceptSharedAttachments: 'disable',
      defaultRouteTableAssociation: 'disable',
      defaultRouteTablePropagation: 'disable',
      description: 'Transit Gateway',
      dnsSupport: 'enable',
      vpnEcmpSupport: 'enable',
      multicastSupport: 'disable',
      tags: [{
        key: 'Name',
        value: namePrefix+'_tgw',
      }],
      transitGatewayCidrBlocks: [ tgwCidr ],
    });

    // Reference https://zenn.dev/mjxo/articles/1e76ce65c8a747
    const cfnResourceShare = new ram.CfnResourceShare(this, 'ResourceShare', {
      name: 'tgwShare-ram',
      resourceArns:[
        `arn:aws:ec2:${this.region}:${this.account}:transit-gateway/${transitGateway.ref}`,
      ],
      principals: trustAccounts,
    })

    const vpcSubnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED
    })

    const route53InboundSG = new ec2.SecurityGroup(this, 'route53InboundSG',{
      vpc: vpc,
      description: 'Allow access to the DNS',
      allowAllOutbound: true,
    });

    // StringList Loop test
    let srcs = ssm.StringParameter.valueFromLookup(this, '/cdk-tgw/srcAddresses');
    if (srcs.includes('dummy-value')) {
      srcs = '172.16.0.0/16';
    }
    let srcIps = srcs.split(",");
    for (const srcIp of srcIps) {
      route53InboundSG.addIngressRule(ec2.Peer.ipv4(srcIp), ec2.Port.tcp(53),'Allow TCP 53');
      route53InboundSG.addIngressRule(ec2.Peer.ipv4(srcIp), ec2.Port.udp(53),'Allow UDP 53');
    }

    const transitGatewayAttachment = new ec2.CfnTransitGatewayAttachment(this, 'transitGatewayAttachment', {
      transitGatewayId: transitGateway.ref,
      vpcId: vpc.vpcId,
      subnetIds: vpcSubnets.subnetIds
    });

    const transitGatewayConnect = new ec2.CfnTransitGatewayConnect(this, 'transitGatewayConnect', {
      options: { protocol: 'gre', },
      transportTransitGatewayAttachmentId: transitGatewayAttachment.ref,
      tags: [{
        key: 'key',
        value: 'value',
      }],
    });

    // Reference https://github.com/aws-samples/aws-transit-gateway-egress-vpc-pattern/blob/master/lib/egress_vpc-tg-demo-stack.ts
    const transitGatewayRouteTable = new ec2.CfnTransitGatewayRouteTable(this, "TGRouteTable", {
      transitGatewayId: transitGateway.ref,
      tags: [{
        key: 'Name',
        value: namePrefix+"-RouteDomain",
      }],
    });

    const transitGatewayRoute = new ec2.CfnTransitGatewayRoute(this, "transitGatewayToDx", {
      transitGatewayRouteTableId: transitGatewayRouteTable.ref,
      transitGatewayAttachmentId: transitGatewayAttachment.ref,
      destinationCidrBlock: "0.0.0.0/0"
    });

    const tGRouteTableAssociationEgressVPC = new ec2.CfnTransitGatewayRouteTableAssociation(this, 'Egress_TG_Association', {
      transitGatewayAttachmentId: transitGatewayAttachment.ref,
      transitGatewayRouteTableId: transitGatewayRouteTable.ref,
    });

    const tGRouteTablePropagation = new ec2.CfnTransitGatewayRouteTablePropagation(this, 'TG_RouteTablePropagation', {
      transitGatewayAttachmentId: transitGatewayAttachment.ref,
      transitGatewayRouteTableId: transitGatewayRouteTable.ref,
    });

  }
}
