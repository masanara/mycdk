import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as fs from 'fs';
import { IGroupDef } from '../interfaces';

const path=('../config/users.json');
const policyDocument = JSON.parse(fs.readFileSync('./policy/IamUserMfaAndSwitchRolePolicy.json','utf-8'));
const usersDef: IGroupDef[] = require(path);

export class IamStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const customPolicy = new iam.ManagedPolicy(this, 'IamUserMfaAndSwitchRolePolicy', {
        managedPolicyName: 'IamUserMfaAndSwitchRolePolicy',
        document: iam.PolicyDocument.fromJson(policyDocument),
    });

    for (const userGroup of usersDef) {
        var iamUsers: any[] = [];
        const group = new iam.Group(this, `${userGroup.groupName}_Group`, {
            groupName: `${userGroup.groupName}_G`,
        });
        for (const userName of userGroup.userNames) {
            const user = new iam.User(this, `${userName}_User`, {
                userName,
                groups: [group],
                password: cdk.SecretValue.unsafePlainText(userName),
                passwordResetRequired: true,
            });
            iamUsers.push(user.userArn);
        };
        for (const policy of userGroup.policies) {
            group.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName(policy));
        }
        group.addManagedPolicy(customPolicy);

        // Reference https://stackoverflow.com/questions/68313128/aws-cdk-how-to-create-an-iam-role-that-can-be-assumed-by-multiple-principals
        const role = new iam.Role(this, `${userGroup.groupName}_Role`, {
            roleName: `${userGroup.groupName}_R`,
            managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess')],
            assumedBy: new iam.CompositePrincipal(
                ...iamUsers.map((userArns) => new iam.ArnPrincipal(userArns).withConditions(
                    { 'IpAddress': { 'aws:SourceIp': userGroup.srcIp } }
                ))
            ),
        });
    }};
}
