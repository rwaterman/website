import type { App } from 'aws-cdk-lib';

export const REGION = 'us-west-2';
// CloudFront certificates and WAF must live in us-east-1.
export const EDGE_REGION = 'us-east-1';

export const GITHUB_REPO = 'rwaterman/website';
export const REDIRECT_ZONE_NAME = 'rickgwaterman.com';
export const WEB_ACL_ARN_PARAMETER = '/account/cloudfront-webacl-arn';

export type StageName = 'dev' | 'prod';

export interface SiteEnv {
  /** PascalCase suffix used in stack/construct ids, e.g. "Dev" -> WebsiteSiteDev. */
  id: string;
  /** Lowercase environment key used in role names and SSM paths, e.g. "dev". */
  envName: string;
  /** Primary domain served, e.g. "dev.rickwaterman.com". */
  domainName: string;
  /** When true, also serve www.<apex> and 301-redirect it to the apex. */
  includeWww: boolean;
  /** When true, deploy the contact form (Lambda + HTTP API + DynamoDB). */
  enableContactForm: boolean;
  /** When true, deploy the share feed (Lambda + HTTP API + DynamoDB + media bucket). */
  enableFeed: boolean;
}

export interface StageConfig extends SiteEnv {
  envName: StageName;
  /** The only AWS account this stage deploys to. */
  account: string;
  /** Public hosted zone that holds this stage's records. */
  hostedZoneId: string;
  zoneName: string;
  /** GitHub environment whose OIDC subject the deploy roles trust. */
  githubEnvironment: StageName;
  /** When true, attach the account's CloudFront web ACL from /account/cloudfront-webacl-arn. */
  webAcl: boolean;
  /** Legacy domain's zone; when set, the stage also deploys the redirect stack. */
  redirectHostedZoneId?: string;
}

export const STAGES: Record<StageName, StageConfig> = {
  dev: {
    id: 'Dev',
    envName: 'dev',
    account: '690084476262',
    hostedZoneId: 'Z02783752H850YJ2Z0LST',
    zoneName: 'dev.rickwaterman.com',
    domainName: 'dev.rickwaterman.com',
    githubEnvironment: 'dev',
    webAcl: false,
    includeWww: false,
    enableContactForm: true,
    enableFeed: true,
  },
  prod: {
    id: 'Prod',
    envName: 'prod',
    account: '582621605246',
    hostedZoneId: 'Z050080263SGEDSJA265',
    redirectHostedZoneId: 'Z020082913XRFVMF1P8GK',
    zoneName: 'rickwaterman.com',
    domainName: 'rickwaterman.com',
    githubEnvironment: 'prod',
    webAcl: true,
    includeWww: true,
    enableContactForm: true,
    enableFeed: true,
  },
};

function isStageName(value: unknown): value is StageName {
  return value === 'dev' || value === 'prod';
}

export function resolveStage(app: App, env: NodeJS.ProcessEnv): StageConfig {
  const requested: unknown = app.node.tryGetContext('stage');
  if (!isStageName(requested)) {
    throw new Error(`Pass -c stage=dev or -c stage=prod (got ${JSON.stringify(requested)})`);
  }
  const stage = STAGES[requested];
  const credentialAccount = env.CDK_DEFAULT_ACCOUNT;
  if (!credentialAccount) {
    throw new Error(`Stage ${requested} targets ${stage.account}, but CDK_DEFAULT_ACCOUNT is not set`);
  }
  if (credentialAccount !== stage.account) {
    throw new Error(`Stage ${requested} targets ${stage.account}, but credentials are for ${credentialAccount}`);
  }
  return stage;
}
