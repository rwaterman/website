import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { REDIRECT_ZONE_NAME, type StageConfig } from './site-config.ts';
import { buildRedirectFunctionCode } from './redirect-function.ts';

export interface RedirectStackProps extends cdk.StackProps {
  stage: StageConfig;
  /** ARN of the account's CloudFront web ACL, owned by the aws-orgs baseline. */
  webAclArn: string;
  /** When false, the distribution gets its certificate but no aliases and no DNS records. */
  attachDomains: boolean;
}

/**
 * Legacy-domain redirect: the old apex and every subdomain 301 to the same host under the
 * current apex. Nothing here is regional except the certificate, which CloudFront requires
 * in us-east-1, so the whole stack lives there.
 */
export class RedirectStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RedirectStackProps) {
    super(scope, id, props);
    const { stage } = props;
    if (!stage.redirectHostedZoneId) {
      throw new Error(`Stage ${stage.envName} has no redirectHostedZoneId`);
    }

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: stage.redirectHostedZoneId,
      zoneName: REDIRECT_ZONE_NAME,
    });
    const wildcard = `*.${REDIRECT_ZONE_NAME}`;

    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: REDIRECT_ZONE_NAME,
      subjectAlternativeNames: [wildcard],
      validation: acm.CertificateValidation.fromDns(zone),
    });

    const redirectFunction = new cloudfront.Function(this, 'RedirectFunction', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(buildRedirectFunctionCode(REDIRECT_ZONE_NAME, stage.zoneName)),
    });

    // The function answers every request itself; the origin is required but never contacted.
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      domainNames: props.attachDomains ? [REDIRECT_ZONE_NAME, wildcard] : undefined,
      certificate,
      webAclId: props.webAclArn,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: new origins.HttpOrigin(stage.zoneName),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        functionAssociations: [
          { function: redirectFunction, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
    });

    if (props.attachDomains) {
      const aliasTarget = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
      for (const [prefix, recordName] of [['Apex', REDIRECT_ZONE_NAME], ['Wildcard', wildcard]]) {
        new route53.ARecord(this, `${prefix}AliasA`, { zone, recordName, target: aliasTarget });
        new route53.AaaaRecord(this, `${prefix}AliasAAAA`, { zone, recordName, target: aliasTarget });
      }
    }

    new cdk.CfnOutput(this, 'DistributionDomain', { value: distribution.distributionDomainName });
  }
}
