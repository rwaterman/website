import * as cdk from 'aws-cdk-lib';
import { SharedStack } from '../lib/shared-stack.ts';
import { CertStack } from '../lib/cert-stack.ts';
import { SiteStack } from '../lib/site-stack.ts';
import { RedirectStack } from '../lib/redirect-stack.ts';
import { REGION, EDGE_REGION, resolveStage } from '../lib/site-config.ts';

const app = new cdk.App();
const stage = resolveStage(app, process.env);
const attachDomains = app.node.tryGetContext('attachDomains') !== 'false';
const env = { account: stage.account, region: REGION };
const edgeEnv = { account: stage.account, region: EDGE_REGION };

const shared = new SharedStack(app, `WebsiteShared${stage.id}`, {
  env,
  crossRegionReferences: true,
  stage,
});

const cert = new CertStack(app, `WebsiteCert${stage.id}`, {
  env: edgeEnv,
  crossRegionReferences: true,
  stage,
});

new SiteStack(app, `WebsiteSite${stage.id}`, {
  env,
  crossRegionReferences: true,
  stage,
  certificate: cert.certificate,
  attachDomains,
});

if (stage.redirectHostedZoneId) {
  if (!shared.webAclArn) {
    throw new Error(`Stage ${stage.envName} deploys the redirect stack, which requires webAcl: true`);
  }
  new RedirectStack(app, 'WebsiteRedirect', {
    env: edgeEnv,
    crossRegionReferences: true,
    stage,
    webAclArn: shared.webAclArn,
    attachDomains,
  });
}
