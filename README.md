# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Stacks

* cdk synth IamStack
* cdk synth KeyCloakStack
* cdk synth InfraStack


## Store parameter to config files

- config/users.json

```
[
  {
    "groupName": "TKY_DEV",
    "srcIp": [
      "192.168.0.21/32",
      "192.168.0.22/32"
    ],
    "policies": [
      "IAMUserChangePassword",
      "IAMSelfManageServiceSpecificCredentials",
      "IAMReadOnlyAccess"
    ],
    "userNames": [
      "TKY_user1",
      "TKY_user2"
    ]
  },
  {
    "groupName": "BIZ_DEV",
    "srcIp": [
      "192.168.2.0/24"
    ],
    "policies": [
      "IAMUserChangePassword",
      "IAMSelfManageServiceSpecificCredentials",
      "IAMReadOnlyAccess"
    ],
    "userNames": [
      "BIZ_user3",
      "BIZ_user4"
    ]
  },
  {
    "groupName": "SE_OPE",
    "srcIp": [
      "192.168.2.0/24",
      "192.168.3.0/24"
    ],
    "policies": [
      "IAMUserChangePassword",
      "IAMSelfManageServiceSpecificCredentials",
      "IAMReadOnlyAccess"
    ],
    "userNames": [
      "SE_user5",
      "SE_user6"
    ]
  }
]
```

- config/infra.json

```
{
  "namePrefix": "test-prefix",
  "bgpAsn": 64513,
  "vpcCidr": "192.168.0.0/22",
  "tgwCidr": "172.18.1.0/24",
  "trustAccounts": [
    "012345678901",
    "001234567890"
  ],
  "srcIps": [
    "192.168.1.1/32",
    "192.168.2.1/32",
    "192.168.40.0/24"
  ],
  "zoneName": "awscloud.local"
}
```
