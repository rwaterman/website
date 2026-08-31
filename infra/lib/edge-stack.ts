import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';

// US comprehensively sanctioned jurisdictions (OFAC: CU, IR, KP, SY) plus RU and BY.
const BLOCKED_COUNTRY_CODES = ['CU', 'IR', 'KP', 'SY', 'RU', 'BY'];

/**
 * One shared CLOUDFRONT-scoped WebACL (us-east-1 only) — a "blanket" for the apex and every
 * subdomain. Website, blog, and notes all point their distributions at this one ARN instead
 * of each defining their own. Rules: a sanctioned-country geo block, a site-wide per-IP
 * rate limit, the AWS IP-reputation managed group, and a silent JS challenge on the
 * contact-form API path.
 */
export class EdgeStack extends cdk.Stack {
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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
          name: 'BlockSanctionedCountries',
          priority: 0,
          action: { block: {} },
          statement: {
            geoMatchStatement: { countryCodes: BLOCKED_COUNTRY_CODES },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'shared-geo-block',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'SiteWideRateLimit',
          priority: 1,
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
          priority: 2,
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
        {
          // Browsers get a token from the WAF SDK the contact page loads (no interstitial);
          // scripted POSTs without one are stopped here, before the Lambda's own limits.
          name: 'ChallengeContactApi',
          priority: 3,
          action: { challenge: {} },
          statement: {
            byteMatchStatement: {
              fieldToMatch: { uriPath: {} },
              positionalConstraint: 'EXACTLY',
              searchString: '/api/contact',
              textTransformations: [{ priority: 0, type: 'LOWERCASE' }],
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'shared-contact-challenge',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });
    this.webAclArn = webAcl.attrArn;

    new cdk.CfnOutput(this, 'SharedWebAclArn', { value: webAcl.attrArn });
  }
}
