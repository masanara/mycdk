import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as Cdk from '../lib/infra';
import { IInfraDef } from '../interfaces';

const path = ('../config/infra.json');
const infraDef: IInfraDef = require(path);

test('Test InfraStack', () => {
  const app = new cdk.App();
  const stack = new Cdk.InfraStack(app, 'TestInfraStack');
  const template = Template.fromStack(stack);

  template.resourceCountIs("AWS::EC2::TransitGateway", 1);
  template.hasResourceProperties("AWS::EC2::TransitGateway", {
    AmazonSideAsn: infraDef.bgpAsn,
    TransitGatewayCidrBlocks: [ infraDef.tgwCidr ]
  });

  template.resourceCountIs("AWS::EC2::TransitGatewayRouteTable",3);
  template.resourceCountIs("AWS::RAM::ResourceShare", 1);
  template.hasResourceProperties("AWS::RAM::ResourceShare", {
    Principals: infraDef.trustAccounts,
  });

  if (infraDef.vpcCidr) {
    template.hasResourceProperties("AWS::EC2::VPC", {
      CidrBlock: infraDef.vpcCidr
    });
  };

  if (infraDef.zoneNames) {
    template.resourceCountIs("AWS::Route53::HostedZone", infraDef.zoneNames.length);
    template.resourceCountIs("AWS::Route53Resolver::ResolverEndpoint", 1);
  };

});
