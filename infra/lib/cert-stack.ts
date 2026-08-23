import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { HOSTED_ZONE_ID, ZONE_NAME, SiteEnv } from './site-config';

export interface CertStackProps extends cdk.StackProps {
  site: SiteEnv;
}

/**
 * CloudFront only accepts ACM certificates issued in us-east-1, so each environment's
 * certificate lives in this thin edge-region stack and is handed to the site stack in the
 * home region via CDK cross-region references.
 */
export class CertStack extends cdk.Stack {
  public readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: CertStackProps) {
    super(scope, id, props);
    const { site } = props;

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: HOSTED_ZONE_ID,
      zoneName: ZONE_NAME,
    });

    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: site.domainName,
      subjectAlternativeNames: site.includeWww ? [`www.${ZONE_NAME}`] : undefined,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    new cdk.CfnOutput(this, 'CertificateArn', { value: this.certificate.certificateArn });
  }
}
