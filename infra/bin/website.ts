import * as cdk from 'aws-cdk-lib';
import { SharedStack } from '../lib/shared-stack';
import { SiteStack } from '../lib/site-stack';
import { ACCOUNT, REGION, SITE_ENVS } from '../lib/site-config';

const app = new cdk.App();
const env = { account: ACCOUNT, region: REGION };

const shared = new SharedStack(app, 'WebsiteShared', { env });

for (const site of SITE_ENVS) {
  new SiteStack(app, `WebsiteSite${site.id}`, {
    env,
    site,
    oidcProvider: shared.oidcProvider,
  });
}
