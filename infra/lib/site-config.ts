function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

export const ACCOUNT = process.env.CDK_DEFAULT_ACCOUNT ?? requireEnv('AWS_ACCOUNT_ID');
export const REGION = 'us-west-2';
// CloudFront certificates and WAF must live in us-east-1.
export const EDGE_REGION = 'us-east-1';

export const HOSTED_ZONE_ID = requireEnv('HOSTED_ZONE_ID');
export const ZONE_NAME = 'rickwaterman.com';
/** Legacy domain: it and every subdomain 301 to the same host under ZONE_NAME. */
export const REDIRECT_HOSTED_ZONE_ID = requireEnv('REDIRECT_HOSTED_ZONE_ID');
export const REDIRECT_ZONE_NAME = 'rickgwaterman.com';

export const GITHUB_REPO = 'rwaterman/website';

export interface SiteEnv {
  /** PascalCase suffix used in stack/construct ids, e.g. "Dev" -> WebsiteSiteDev. */
  id: string;
  /** Lowercase environment key used in role names and SSM paths, e.g. "dev". */
  envName: string;
  /** Primary domain served, e.g. "dev.rickwaterman.com". */
  domainName: string;
  /** Git branch whose pushes deploy this environment. */
  branch: string;
  /** When true, also serve www.<apex> and 301-redirect it to the apex. */
  includeWww: boolean;
  /** When true, deploy the contact form (Lambda + HTTP API + DynamoDB). */
  enableContactForm: boolean;
}

export const SITE_ENVS: SiteEnv[] = [
  {
    id: 'Dev',
    envName: 'dev',
    domainName: 'dev.rickwaterman.com',
    branch: 'develop',
    includeWww: false,
    enableContactForm: true,
  },
  {
    id: 'Prod',
    envName: 'prod',
    domainName: ZONE_NAME,
    branch: 'main',
    includeWww: true,
    enableContactForm: true,
  },
];
