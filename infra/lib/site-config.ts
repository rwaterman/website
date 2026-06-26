function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

export const ACCOUNT = process.env.CDK_DEFAULT_ACCOUNT ?? requireEnv('AWS_ACCOUNT_ID');
export const REGION = 'us-east-1';

export const HOSTED_ZONE_ID = requireEnv('HOSTED_ZONE_ID');
export const ZONE_NAME = 'rickgwaterman.com';

export const GITHUB_REPO = 'rwaterman/website';

export interface SiteEnv {
  /** PascalCase suffix used in stack/construct ids, e.g. "Dev" -> WebsiteSiteDev. */
  id: string;
  /** Lowercase environment key used in role names and SSM paths, e.g. "dev". */
  envName: string;
  /** Primary domain served, e.g. "dev.rickgwaterman.com". */
  domainName: string;
  /** Git branch whose pushes deploy this environment. */
  branch: string;
  /** When true, also serve www.<apex> and 301-redirect it to the apex. */
  includeWww: boolean;
  /** When true, deploy the contact form (Lambda + HTTP API + DynamoDB). Parked off by default. */
  enableContactForm: boolean;
}

export const SITE_ENVS: SiteEnv[] = [
  {
    id: 'Dev',
    envName: 'dev',
    domainName: 'dev.rickgwaterman.com',
    branch: 'develop',
    includeWww: false,
    enableContactForm: false,
  },
  {
    id: 'Prod',
    envName: 'prod',
    domainName: ZONE_NAME,
    branch: 'develop',
    includeWww: true,
    enableContactForm: false,
  },
];
