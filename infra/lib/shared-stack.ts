import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ACCOUNT, REGION, GITHUB_REPO } from './site-config';

/**
 * Account-global singletons shared by every environment:
 *  - the GitHub Actions OIDC provider (one per account; cannot live in the per-env stack)
 *  - the infra-deploy role assumed by CI to run `cdk deploy`
 */
export class SharedStack extends cdk.Stack {
  public readonly oidcProvider: iam.IOpenIdConnectProvider;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
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
        resources: [`arn:aws:iam::${ACCOUNT}:role/cdk-hnb659fds-*-${ACCOUNT}-${REGION}`],
      }),
    );

    new cdk.CfnOutput(this, 'OidcProviderArn', { value: provider.openIdConnectProviderArn });
    new cdk.CfnOutput(this, 'InfraDeployRoleArn', { value: infraRole.roleArn });
  }
}
