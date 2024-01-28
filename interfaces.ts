import { IIpAddresses } from "aws-cdk-lib/aws-ec2";

export interface IGroupDef {
    "groupName": string,
    "srcIp": IIpAddresses[],
    "policies": string[],
    "userNames": string[],
};