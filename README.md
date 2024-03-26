# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Stacks

* cdk synth IamStack
* cdk synth KeyCloakStack
* cdk synth InfraStack

## Config file for InfraStack (config/infra.json)

### Create Transit Gateway Only

- namePrefix : Name prefix for resources which are created by cdk
- bgpAsn : BGP AS number for Transit Gateway
- trustAccounts[Array] : AWS Account IDs which is shared Transit Gateway resource from this account

```
{
  "namePrefix": "test-prefix",
  "bgpAsn": 64513,
  "trustAccounts": [
    "012345678901",
    "001234567890"
  ]
}
```

### Create Transit Gateway and shared service vpc

- tgwCidrs[Array] : Transit Gateway Cidrs (option)
- vpcCidr : Shared Service VPC Cidr (option)
- zoneNames[Array] : Zone names for Route53 private hosted zone (option)
- srcIps[Array] : permit source addresses for Route53 Resolver (option)

```
{
  "namePrefix": "test-prefix",
  "bgpAsn": 64513,
  "trustAccounts": [
    "012345678901",
    "001234567890"
  ],
  "tgwCidrs": [
    "172.18.1.0/24",
    "172.18.2.0/24"
  ],
  "vpcCidr": "192.168.0.0/22",
  "zoneNames": [
    "awscloud1.local",
    "awscloud2.local"
  ],
  "srcIps": [
    "192.168.1.1/32",
    "192.168.2.1/32",
    "192.168.40.0/24"
  ]
}
```

## Config file for IamStack (config/users.json)

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
