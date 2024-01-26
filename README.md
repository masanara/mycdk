# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template


## Store parameter to Systems Manager Parameter Store

```
aws ssm put-parameter --name '/cdk-tgw/namePrefix' --type String --value 'testprefix'
aws ssm put-parameter --name '/cdk-tgw/bgpAsn' --type String --value '64513'
aws ssm put-parameter --name '/cdk-tgw/vpcCidr' --type String --value '192.168.0.0/16'
aws ssm put-parameter --name '/cdk-tgw/tgwCidr' --type String --value '172.18.1.0/24'
aws ssm put-parameter --name '/cdk-tgw/zoneName' --type String --value 'awscloud.local'  
aws ssm put-parameter --name '/cdk-tgw/trustAccounts' --type StringList --value '012345678901,123456789012'
aws ssm put-parameter --name '/cdk-tgw/srcAddresses' --type StringList --value '192.168.1.1/32,192.168.2.1/32,192.168.40.0/24'
```
