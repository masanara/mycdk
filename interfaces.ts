import { IpAddresses } from "aws-cdk-lib/aws-ec2";
//import { IIpAddresses } from "aws-cdk-lib/aws-ec2";

export interface IGroupDef {
    "groupName": string,
    "srcIp": IpAddresses[],
    "policies": string[],
    "userNames": string[],
};

export interface IInfraDef {
    "namePrefix": string,
    "bgpAsn": number,
    "vpcCidr": string,
    "tgwCidr": string,
    "trustAccounts": string[],
    "zoneNames": string[],
    "srcIps": string[],
};