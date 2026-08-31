import * as cdk from 'aws-cdk-lib';
import { SharedStack } from '../lib/shared-stack';
import { EdgeStack } from '../lib/edge-stack';
import { CertStack } from '../lib/cert-stack';
import { SiteStack } from '../lib/site-stack';
import { RedirectStack } from '../lib/redirect-stack';
import { ACCOUNT, REGION, EDGE_REGION, SITE_ENVS } from '../lib/site-config';

const app = new cdk.App();
const env = { account: ACCOUNT, region: REGION };
const edgeEnv = { account: ACCOUNT, region: EDGE_REGION };

const edge = new EdgeStack(app, 'WebsiteEdge', { env: edgeEnv, crossRegionReferences: true });
new RedirectStack(app, 'WebsiteRedirect', { env: edgeEnv, webAclArn: edge.webAclArn });

const shared = new SharedStack(app, 'WebsiteShared', {
  env,
  crossRegionReferences: true,
  webAclArn: edge.webAclArn,
});

for (const site of SITE_ENVS) {
  const cert = new CertStack(app, `WebsiteCert${site.id}`, {
    env: edgeEnv,
    crossRegionReferences: true,
    site,
  });
  new SiteStack(app, `WebsiteSite${site.id}`, {
    env,
    crossRegionReferences: true,
    site,
    oidcProvider: shared.oidcProvider,
    webAclArn: edge.webAclArn,
    certificate: cert.certificate,
  });
}
