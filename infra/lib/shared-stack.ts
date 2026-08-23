import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { ACCOUNT, REGION, EDGE_REGION, GITHUB_REPO } from './site-config';

export interface SharedStackProps extends cdk.StackProps {
  /** ARN of the shared CloudFront WebACL, owned by EdgeStack. */
  webAclArn: string;
}

/**
 * Account-global singletons shared by every environment (and by the sibling blog/notes
 * repos, which import these by ARN):
 *  - the GitHub Actions OIDC provider (one per account; cannot live in the per-env stack)
 *  - the infra-deploy role assumed by CI to run `cdk deploy`
 *  - the SSM parameter publishing the shared WebACL ARN
 */
export class SharedStack extends cdk.Stack {
  public readonly oidcProvider: iam.IOpenIdConnectProvider;

  constructor(scope: Construct, id: string, props: SharedStackProps) {
    super(scope, id, props);

    const provider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });
    this.oidcProvider = provider;

    // CI role for `cdk deploy`. It holds no service permissions of its own — it can only
    // assume the CDK bootstrap roles, which carry the actual provisioning permissions.
    const infraRole = new iam.Role(this, 'InfraDeployRole', {
      roleName: 'website-infra-deploy',
      description: 'GitHub Actions role to run cdk deploy (assumes CDK bootstrap roles only)',
      assumedBy: new iam.OpenIdConnectPrincipal(provider, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${GITHUB_REPO}:ref:refs/heads/develop`,
        },
      }),
    });
    infraRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [REGION, EDGE_REGION].map(
          (region) => `arn:aws:iam::${ACCOUNT}:role/cdk-hnb659fds-*-${ACCOUNT}-${region}`,
        ),
      }),
    );

    // Published for the sibling blog/notes repos (separate CDK apps) to read at deploy time.
    new ssm.StringParameter(this, 'SharedWebAclArnParam', {
      parameterName: '/website/shared/cloudfront-webacl-arn',
      stringValue: props.webAclArn,
    });

    new cdk.CfnOutput(this, 'OidcProviderArn', { value: provider.openIdConnectProviderArn });
    new cdk.CfnOutput(this, 'InfraDeployRoleArn', { value: infraRole.roleArn });
  }
}
