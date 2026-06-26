import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { HOSTED_ZONE_ID, ZONE_NAME, GITHUB_REPO, SiteEnv } from './site-config';

export interface SiteStackProps extends cdk.StackProps {
  site: SiteEnv;
  oidcProvider: iam.IOpenIdConnectProvider;
  /** ARN of the shared account-wide CloudFront WebACL, owned by SharedStack. */
  webAclArn: string;
}

/**
 * One static-site environment: private S3 bucket behind a CloudFront distribution
 * (Origin Access Control), an in-region ACM certificate, Route53 alias records, a
 * directory-index CloudFront Function, and a branch-scoped OIDC role for content deploys.
 */
export class SiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props);
    const { site, oidcProvider, webAclArn } = props;
    const isProd = site.envName === 'prod';
    const wwwDomain = `www.${ZONE_NAME}`;

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: HOSTED_ZONE_ID,
      zoneName: ZONE_NAME,
    });

    const domainNames = site.includeWww ? [site.domainName, wwwDomain] : [site.domainName];

    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: site.domainName,
      subjectAlternativeNames: site.includeWww ? [wwwDomain] : undefined,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    const rewriteFunction = new cloudfront.Function(this, 'RewriteFunction', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(buildFunctionCode(site.includeWww, ZONE_NAME)),
    });

    // Contact form (Lambda + HTTP API + DynamoDB rate-limiter). Parked behind a per-env
    // flag: the code stays in the repo but nothing deploys until enableContactForm is set.
    // Functional prerequisites when enabling: a verified SES sending identity and the
    // SecureString SSM parameter `/website/<env>/contact-recipient`.
    let contactApi: apigwv2.HttpApi | undefined;
    let contactRecipientParameterName: string | undefined;
    if (site.enableContactForm) {
      contactRecipientParameterName = `/website/${site.envName}/contact-recipient`;
      const contactRateLimitTable = new dynamodb.Table(this, 'ContactRateLimitTable', {
        partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        encryption: dynamodb.TableEncryption.AWS_MANAGED,
        timeToLiveAttribute: 'expiresAt',
        removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      });
      const contactLogGroup = new logs.LogGroup(this, 'ContactFunctionLogGroup', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      });
      const contactFunction = new lambda.Function(this, 'ContactFunction', {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline(buildContactFunctionCode()),
        memorySize: 128,
        timeout: cdk.Duration.seconds(10),
        logGroup: contactLogGroup,
        environment: {
          ALLOWED_ORIGIN: `https://${site.domainName}`,
          RECIPIENT_PARAMETER_NAME: contactRecipientParameterName,
          RATE_LIMIT_TABLE_NAME: contactRateLimitTable.tableName,
          RATE_LIMIT_WINDOW_SECONDS: '3600',
          MAX_MESSAGES_GLOBAL: '20',
          MAX_MESSAGES_PER_IP: '5',
          MAX_MESSAGES_PER_REPLY_TO: '3',
        },
      });
      contactRateLimitTable.grantReadWriteData(contactFunction);
      contactFunction.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['ssm:GetParameter'],
          resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter${contactRecipientParameterName}`],
        }),
      );
      contactFunction.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['ses:SendEmail'],
          resources: [`arn:aws:ses:${this.region}:${this.account}:identity/*`],
        }),
      );

      contactApi = new apigwv2.HttpApi(this, 'ContactApi', {
        apiName: `website-contact-${site.envName}`,
        description: `Contact form endpoint for ${site.domainName}`,
        createDefaultStage: false,
      });
      contactApi.addRoutes({
        path: '/api/contact',
        methods: [apigwv2.HttpMethod.POST],
        integration: new integrations.HttpLambdaIntegration('ContactIntegration', contactFunction),
      });
      new apigwv2.HttpStage(this, 'ContactApiDefaultStage', {
        httpApi: contactApi,
        stageName: '$default',
        autoDeploy: true,
        throttle: {
          burstLimit: 3,
          rateLimit: 0.2,
        },
      });
    }

    const additionalBehaviors: Record<string, cloudfront.BehaviorOptions> = {};
    if (contactApi) {
      additionalBehaviors['api/contact'] = {
        origin: new origins.HttpOrigin(`${contactApi.apiId}.execute-api.${this.region}.amazonaws.com`, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      };
    }

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      domainNames,
      certificate,
      webAclId: webAclArn,
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        functionAssociations: [
          { function: rewriteFunction, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors,
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: '/404.html', ttl: cdk.Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: '/404.html', ttl: cdk.Duration.minutes(5) },
      ],
    });

    const aliasTarget = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
    new route53.ARecord(this, 'AliasA', { zone, recordName: site.domainName, target: aliasTarget });
    new route53.AaaaRecord(this, 'AliasAAAA', { zone, recordName: site.domainName, target: aliasTarget });
    if (site.includeWww) {
      new route53.ARecord(this, 'WwwAliasA', { zone, recordName: wwwDomain, target: aliasTarget });
      new route53.AaaaRecord(this, 'WwwAliasAAAA', { zone, recordName: wwwDomain, target: aliasTarget });
    }

    // Branch-scoped CI role: only this env's branch can assume it, and it can only touch
    // this env's bucket, distribution, and SSM parameters.
    const contentRole = new iam.Role(this, 'ContentDeployRole', {
      roleName: `website-content-${site.envName}`,
      description: `GitHub Actions role to deploy ${site.envName} site content`,
      assumedBy: new iam.OpenIdConnectPrincipal(oidcProvider, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${GITHUB_REPO}:ref:refs/heads/${site.branch}`,
        },
      }),
    });
    bucket.grantReadWrite(contentRole);
    contentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation'],
        resources: [`arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`],
      }),
    );
    contentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/website/${site.envName}/*`],
      }),
    );

    new ssm.StringParameter(this, 'BucketNameParam', {
      parameterName: `/website/${site.envName}/bucket-name`,
      stringValue: bucket.bucketName,
    });
    new ssm.StringParameter(this, 'DistributionIdParam', {
      parameterName: `/website/${site.envName}/distribution-id`,
      stringValue: distribution.distributionId,
    });

    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${site.domainName}` });
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new cdk.CfnOutput(this, 'DistributionDomain', { value: distribution.distributionDomainName });
    if (contactRecipientParameterName) {
      new cdk.CfnOutput(this, 'ContactRecipientParameterName', { value: contactRecipientParameterName });
    }
    new cdk.CfnOutput(this, 'ContentRoleArn', { value: contentRole.roleArn });
  }
}

/**
 * CloudFront viewer-request function (cloudfront-js-2.0, ES5.1-safe):
 *  - rewrites directory-style URLs to their index.html (OAC uses the S3 REST origin, which
 *    does no index resolution)
 *  - for prod, 301-redirects www.<apex> to the bare apex
 */
function buildFunctionCode(redirectWww: boolean, apex: string): string {
  const redirectBlock = redirectWww
    ? `  var host = request.headers.host.value;
  if (host.indexOf('www.') === 0) {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: 'https://${apex}' + request.uri } }
    };
  }
`
    : '';
  return `function handler(event) {
  var request = event.request;
${redirectBlock}  var uri = request.uri;
  if (uri.charAt(uri.length - 1) === '/') {
    request.uri = uri + 'index.html';
  } else if (uri.lastIndexOf('.') < uri.lastIndexOf('/')) {
    request.uri = uri + '/index.html';
  }
  return request;
}`;
}

function buildContactFunctionCode(): string {
  return String.raw`
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { DynamoDBClient, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { createHash } = require('node:crypto');

const ssm = new SSMClient({});
const ses = new SESClient({});
const dynamodb = new DynamoDBClient({});
let cachedRecipient;

exports.handler = async (event) => {
  const headers = {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  };

  try {
    const origin = getHeader(event.headers, 'origin');
    if (origin && process.env.ALLOWED_ORIGIN && origin !== process.env.ALLOWED_ORIGIN) {
      return json(403, { message: 'Forbidden' }, headers);
    }

    if (event.requestContext && event.requestContext.http && event.requestContext.http.method !== 'POST') {
      return json(405, { message: 'Method not allowed' }, headers);
    }

    const contentLength = Number(getHeader(event.headers, 'content-length') || 0);
    if (contentLength > 16384) {
      return json(413, { message: 'Message is too large' }, headers);
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : event.body || '';
    const data = JSON.parse(rawBody || '{}');
    const name = clean(data.name, 120);
    const email = clean(data.email, 254);
    const message = clean(data.message, 4000);
    const honeypot = clean(data.company, 120);

    if (honeypot) {
      return json(200, { ok: true }, headers);
    }

    if (!name || !email || !message) {
      return json(400, { message: 'Name, email, and message are required' }, headers);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(400, { message: 'Enter a valid email address' }, headers);
    }

    const sourceIp = getSourceIp(event);
    const rateLimit = await checkRateLimits(sourceIp, email);
    if (!rateLimit.allowed) {
      return json(429, { message: 'Too many messages. Please try again later.' }, headers);
    }

    const recipient = await getRecipient();
    await ses.send(new SendEmailCommand({
      Source: recipient,
      Destination: { ToAddresses: [recipient] },
      ReplyToAddresses: [email],
      Message: {
        Subject: {
          Data: 'Website contact: ' + name,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: [
              'Name: ' + name,
              'Email: ' + email,
              '',
              message,
            ].join('\n'),
            Charset: 'UTF-8',
          },
        },
      },
    }));

    return json(200, { ok: true }, headers);
  } catch (error) {
    console.error('Contact form failed', error && error.name ? error.name : error);
    return json(500, { message: 'Message could not be sent' }, headers);
  }
};

async function getRecipient() {
  if (cachedRecipient) {
    return cachedRecipient;
  }

  const response = await ssm.send(new GetParameterCommand({
    Name: process.env.RECIPIENT_PARAMETER_NAME,
    WithDecryption: true,
  }));
  cachedRecipient = response.Parameter && response.Parameter.Value;
  if (!cachedRecipient) {
    throw new Error('Missing contact recipient');
  }
  return cachedRecipient;
}

async function checkRateLimits(sourceIp, email) {
  const windowSeconds = Number(process.env.RATE_LIMIT_WINDOW_SECONDS || 3600);
  const now = Math.floor(Date.now() / 1000);
  const windowId = Math.floor(now / windowSeconds);
  const expiresAt = (windowId + 2) * windowSeconds;

  const checks = [
    {
      key: 'global#' + windowId,
      max: Number(process.env.MAX_MESSAGES_GLOBAL || 20),
    },
    {
      key: 'ip#' + hash(sourceIp || 'unknown') + '#' + windowId,
      max: Number(process.env.MAX_MESSAGES_PER_IP || 5),
    },
    {
      key: 'reply#' + hash(email.toLowerCase()) + '#' + windowId,
      max: Number(process.env.MAX_MESSAGES_PER_REPLY_TO || 3),
    },
  ];

  try {
    for (const check of checks) {
      await dynamodb.send(new UpdateItemCommand({
        TableName: process.env.RATE_LIMIT_TABLE_NAME,
        Key: { pk: { S: check.key } },
        UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, expiresAt = :expiresAt',
        ConditionExpression: 'attribute_not_exists(#count) OR #count < :max',
        ExpressionAttributeNames: {
          '#count': 'count',
        },
        ExpressionAttributeValues: {
          ':zero': { N: '0' },
          ':one': { N: '1' },
          ':max': { N: String(check.max) },
          ':expiresAt': { N: String(expiresAt) },
        },
      }));
    }
  } catch (error) {
    if (error && error.name === 'ConditionalCheckFailedException') {
      return { allowed: false };
    }
    throw error;
  }

  return { allowed: true };
}

function clean(value, maxLength) {
  return String(value || '').trim().replace(/\r/g, '').slice(0, maxLength);
}

function getHeader(headers, name) {
  if (!headers) {
    return undefined;
  }
  const lowerName = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lowerName) {
      return headers[key];
    }
  }
  return undefined;
}

function getSourceIp(event) {
  const forwardedFor = getHeader(event.headers, 'x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return event.requestContext && event.requestContext.http
    ? event.requestContext.http.sourceIp
    : 'unknown';
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
}

function json(statusCode, body, headers) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}
`.trim();
}
