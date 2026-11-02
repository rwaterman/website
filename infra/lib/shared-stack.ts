import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { REGION, EDGE_REGION, GITHUB_REPO, WEB_ACL_ARN_PARAMETER, type StageConfig } from './site-config.ts';
import { importGitHubOidcProvider } from './oidc.ts';

export interface SharedStackProps extends cdk.StackProps {
  stage: StageConfig;
}

/**
 * The infra-deploy role assumed by CI to run `cdk deploy` for one stage. The account
 * baseline (aws-orgs) owns the GitHub OIDC provider, hosted zones, SES identity and web ACL.
 */
export class SharedStack extends cdk.Stack {
  /** The account's CloudFront web ACL ARN, read in this stack's region; undefined when the stage has none. */
  public readonly webAclArn?: string;

  constructor(scope: Construct, id: string, props: SharedStackProps) {
    super(scope, id, props);
    const { stage } = props;

    const infraRole = new iam.Role(this, 'InfraDeployRole', {
      roleName: 'website-infra-deploy',
      description: 'GitHub Actions role to run cdk deploy (assumes CDK bootstrap roles only)',
      assumedBy: new iam.OpenIdConnectPrincipal(importGitHubOidcProvider(this, stage.account), {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${GITHUB_REPO}:environment:${stage.githubEnvironment}`,
        },
      }),
    });
    infraRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [REGION, EDGE_REGION].map(
          (region) => `arn:aws:iam::${stage.account}:role/cdk-hnb659fds-*-${stage.account}-${region}`,
        ),
      }),
    );

    if (stage.webAcl) {
      this.webAclArn = ssm.StringParameter.valueForStringParameter(this, WEB_ACL_ARN_PARAMETER);
    }

    new cdk.CfnOutput(this, 'InfraDeployRoleArn', { value: infraRole.roleArn });
  }
}
