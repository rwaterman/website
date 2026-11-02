import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import type { StageConfig } from './site-config.ts';

export interface CertStackProps extends cdk.StackProps {
  stage: StageConfig;
}

/** One stage's CloudFront certificate (us-east-1). */
export class CertStack extends cdk.Stack {
  public readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: CertStackProps) {
    super(scope, id, props);
    const { stage } = props;

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: stage.hostedZoneId,
      zoneName: stage.zoneName,
    });

    // Keyed on the domain: a domain change must produce a new cross-region export, because
    // CDK's export writer never rewrites an existing export's value. RETAIN because the
    // distribution still references the old certificate during this stack's cleanup;
    // delete the orphan by hand afterwards.
    const certificate = new acm.Certificate(this, `Certificate ${stage.domainName}`, {
      domainName: stage.domainName,
      subjectAlternativeNames: stage.includeWww ? [`www.${stage.zoneName}`] : undefined,
      validation: acm.CertificateValidation.fromDns(zone),
    });
    certificate.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    this.certificate = certificate;

    new cdk.CfnOutput(this, 'CertificateArn', { value: certificate.certificateArn });
  }
}
