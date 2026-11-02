import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CertStack } from '../lib/cert-stack.ts';
import { SharedStack } from '../lib/shared-stack.ts';
import { SiteStack } from '../lib/site-stack.ts';
import { RedirectStack } from '../lib/redirect-stack.ts';
import { STAGES, REGION, EDGE_REGION, type StageConfig } from '../lib/site-config.ts';

const WEB_ACL_ARN = 'arn:aws:wafv2:us-east-1:582621605246:global/webacl/test/00000000-0000-0000-0000-000000000000';
const SUB_KEY = 'token.actions.githubusercontent.com:sub';

function buildSiteStack(stage: StageConfig, attachDomains = true): Template {
  const app = new cdk.App();
  const { certificate } = new CertStack(app, 'Cert', {
    env: { account: stage.account, region: EDGE_REGION },
    crossRegionReferences: true,
    stage,
  });
  const stack = new SiteStack(app, 'Site', {
    env: { account: stage.account, region: REGION },
    crossRegionReferences: true,
    stage,
    certificate,
    attachDomains,
  });
  return Template.fromStack(stack);
}

function subjects(template: Template): unknown[] {
  const roles = template.findResources('AWS::IAM::Role');
  const found: unknown[] = [];
  for (const role of Object.values(roles)) {
    for (const statement of role.Properties.AssumeRolePolicyDocument.Statement) {
      if (statement.Condition?.StringEquals?.[SUB_KEY] !== undefined) {
        found.push(statement.Condition.StringEquals[SUB_KEY]);
      }
    }
  }
  return found;
}

test('content role trusts only the stage GitHub environment', () => {
  const template = buildSiteStack(STAGES.prod);
  assert.deepEqual(subjects(template), ['repo:rwaterman/website:environment:prod']);
  assert.ok(!JSON.stringify(template.toJSON()).includes('StringLike'));
});

test('dev content role trusts the dev environment', () => {
  assert.deepEqual(subjects(buildSiteStack(STAGES.dev)), ['repo:rwaterman/website:environment:dev']);
});

test('dev has no web ACL', () => {
  const template = buildSiteStack(STAGES.dev);
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({ WebACLId: Match.absent() }),
  });
  template.resourceCountIs('AWS::CloudFront::Distribution', 1);
});

test('prod reads WebACLId from /account/cloudfront-webacl-arn', () => {
  const template = buildSiteStack(STAGES.prod);
  const parameters = template.toJSON().Parameters as Record<string, { Type: string; Default: string }>;
  const [logicalId] = Object.entries(parameters)
    .filter(([, parameter]) => parameter.Default === '/account/cloudfront-webacl-arn')
    .map(([key]) => key);
  assert.ok(logicalId, 'expected an SSM parameter for the web ACL ARN');
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({ WebACLId: { Ref: logicalId } }),
  });
});

test('contact sender is contact@<zoneName>', () => {
  for (const [stage, sender] of [
    [STAGES.dev, 'contact@dev.rickwaterman.com'],
    [STAGES.prod, 'contact@rickwaterman.com'],
  ] as const) {
    buildSiteStack(stage).hasResourceProperties('AWS::Lambda::Function', {
      Environment: { Variables: Match.objectLike({ SENDER_ADDRESS: sender }) },
    });
  }
});

test('attachDomains=true attaches aliases and creates Route 53 records', () => {
  const template = buildSiteStack(STAGES.prod);
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({ Aliases: ['rickwaterman.com', 'www.rickwaterman.com'] }),
  });
  template.resourceCountIs('AWS::Route53::RecordSet', 4);
});

test('attachDomains=false yields a distribution with a certificate, no Aliases and no Route 53 records', () => {
  const template = buildSiteStack(STAGES.prod, false);
  const [distribution] = Object.values(template.findResources('AWS::CloudFront::Distribution'));
  const config = distribution.Properties.DistributionConfig;
  assert.ok(config.ViewerCertificate?.AcmCertificateArn, 'expected a certificate');
  assert.equal(config.Aliases, undefined);
  template.resourceCountIs('AWS::Route53::RecordSet', 0);
});

test('shared stack keeps only the infra deploy role, trusting the stage environment', () => {
  const app = new cdk.App();
  const stack = new SharedStack(app, 'Shared', {
    env: { account: STAGES.dev.account, region: REGION },
    crossRegionReferences: true,
    stage: STAGES.dev,
  });
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::IAM::OIDCProvider', 0);
  template.resourceCountIs('AWS::SES::EmailIdentity', 0);
  template.resourceCountIs('AWS::SSM::Parameter', 0);
  template.hasResourceProperties('AWS::IAM::Role', { RoleName: 'website-infra-deploy' });
  assert.deepEqual(subjects(template), ['repo:rwaterman/website:environment:dev']);
  assert.ok(!JSON.stringify(template.toJSON()).includes('StringLike'));
});

test('redirect stack receives the web ACL ARN it is given', () => {
  const app = new cdk.App();
  const stack = new RedirectStack(app, 'Redirect', {
    env: { account: STAGES.prod.account, region: EDGE_REGION },
    stage: STAGES.prod,
    webAclArn: WEB_ACL_ARN,
    attachDomains: true,
  });
  Template.fromStack(stack).hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      Aliases: ['rickgwaterman.com', '*.rickgwaterman.com'],
      WebACLId: WEB_ACL_ARN,
    }),
  });
});

test('redirect stack with attachDomains=false has a certificate, no Aliases and no records', () => {
  const app = new cdk.App();
  const stack = new RedirectStack(app, 'Redirect', {
    env: { account: STAGES.prod.account, region: EDGE_REGION },
    stage: STAGES.prod,
    webAclArn: WEB_ACL_ARN,
    attachDomains: false,
  });
  const template = Template.fromStack(stack);
  const [distribution] = Object.values(template.findResources('AWS::CloudFront::Distribution'));
  assert.equal(distribution.Properties.DistributionConfig.Aliases, undefined);
  assert.ok(distribution.Properties.DistributionConfig.ViewerCertificate?.AcmCertificateArn);
  template.resourceCountIs('AWS::Route53::RecordSet', 0);
});
