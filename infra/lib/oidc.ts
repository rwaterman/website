import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export function importGitHubOidcProvider(scope: Construct, account: string): iam.IOpenIdConnectProvider {
  return iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
    scope,
    'GitHubOidcProvider',
    `arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com`,
  );
}
