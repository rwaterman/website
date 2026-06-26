import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { ACCOUNT, REGION, GITHUB_REPO } from './site-config';

/**
 * Account-global singletons shared by every environment (and by the sibling blog/notes
 * repos, which import these by ARN):
 *  - the GitHub Actions OIDC provider (one per account; cannot live in the per-env stack)
 *  - the infra-deploy role assumed by CI to run `cdk deploy`
 *  - the shared CloudFront WebACL (one WAF for the apex and every subdomain distribution)
 */
export class SharedStack extends cdk.Stack {
  public readonly oidcProvider: iam.IOpenIdConnectProvider;
  public readonly webAclArn: string;

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

    // One shared CloudFront WebACL — a "blanket" for the apex and every subdomain. A single
    // CLOUDFRONT-scoped WebACL can be associated with many distributions, so website, blog,
    // and notes all point their distributions at this one ARN instead of each defining their
    // own. Rules: a site-wide per-IP rate limit and the AWS IP-reputation managed group.
    const webAcl = new wafv2.CfnWebACL(this, 'SharedSiteWebAcl', {
      defaultAction: { allow: {} },
      scope: 'CLOUDFRONT',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'shared-site',
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'SiteWideRateLimit',
          priority: 0,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              aggregateKeyType: 'IP',
              evaluationWindowSec: 600,
              limit: 1000,
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'shared-site-rate',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AmazonIpReputationList',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'shared-ip-reputation',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });
    this.webAclArn = webAcl.attrArn;

    // Published for the sibling blog/notes repos (separate CDK apps) to read at deploy time.
    new ssm.StringParameter(this, 'SharedWebAclArnParam', {
      parameterName: '/website/shared/cloudfront-webacl-arn',
      stringValue: webAcl.attrArn,
    });

    new cdk.CfnOutput(this, 'OidcProviderArn', { value: provider.openIdConnectProviderArn });
    new cdk.CfnOutput(this, 'InfraDeployRoleArn', { value: infraRole.roleArn });
    new cdk.CfnOutput(this, 'SharedWebAclArn', { value: webAcl.attrArn });
  }
}
