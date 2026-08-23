import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { HOSTED_ZONE_ID, ZONE_NAME, SiteEnv } from './site-config';

export interface CertStackProps extends cdk.StackProps {
  site: SiteEnv;
}

/** One environment's CloudFront certificate (us-east-1). */
export class CertStack extends cdk.Stack {
  public readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: CertStackProps) {
    super(scope, id, props);
    const { site } = props;

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: HOSTED_ZONE_ID,
      zoneName: ZONE_NAME,
    });

    // Keyed on the domain: a domain change must produce a new cross-region export, because
    // CDK's export writer never rewrites an existing export's value. RETAIN because the
    // distribution still references the old certificate during this stack's cleanup;
    // delete the orphan by hand afterwards.
    const certificate = new acm.Certificate(this, `Certificate ${site.domainName}`, {
      domainName: site.domainName,
      subjectAlternativeNames: site.includeWww ? [`www.${ZONE_NAME}`] : undefined,
      validation: acm.CertificateValidation.fromDns(zone),
    });
    certificate.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    this.certificate = certificate;

    new cdk.CfnOutput(this, 'CertificateArn', { value: certificate.certificateArn });
  }
}
