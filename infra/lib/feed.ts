import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { SiteEnv } from './site-config';

export interface FeedProps {
  site: SiteEnv;
}

/**
 * The share feed: posts sent from the phone's share sheet land in DynamoDB (images in a
 * private media bucket) and /feed reads them back. One Lambda serves a public GET and
 * token-guarded POST / DELETE; the token lives only in the SecureString parameter
 * `/website/<env>/feed-token`, created by hand.
 */
export class Feed extends Construct {
  public readonly api: apigwv2.HttpApi;
  public readonly mediaBucket: s3.Bucket;
  public readonly tokenParameterName: string;

  constructor(scope: Construct, id: string, props: FeedProps) {
    super(scope, id);
    const { site } = props;
    const stack = cdk.Stack.of(this);
    const removalPolicy = site.envName === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;
    this.tokenParameterName = `/website/${site.envName}/feed-token`;

    const table = new dynamodb.Table(this, 'Table', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: site.envName === 'prod' },
      removalPolicy,
    });

    this.mediaBucket = new s3.Bucket(this, 'MediaBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy,
      autoDeleteObjects: site.envName !== 'prod',
    });

    const feedFunction = new lambda.Function(this, 'Function', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/feed')),
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      logGroup: new logs.LogGroup(this, 'FunctionLogGroup', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy,
      }),
      environment: {
        TABLE_NAME: table.tableName,
        MEDIA_BUCKET_NAME: this.mediaBucket.bucketName,
        TOKEN_PARAMETER_NAME: this.tokenParameterName,
      },
    });
    table.grantReadWriteData(feedFunction);
    this.mediaBucket.grantPut(feedFunction);
    this.mediaBucket.grantDelete(feedFunction);
    feedFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [`arn:aws:ssm:${stack.region}:${stack.account}:parameter${this.tokenParameterName}`],
      }),
    );

    this.api = new apigwv2.HttpApi(this, 'Api', {
      apiName: `website-feed-${site.envName}`,
      description: `Share feed endpoint for ${site.domainName}`,
      createDefaultStage: false,
    });
    const integration = new integrations.HttpLambdaIntegration('FeedIntegration', feedFunction);
    this.api.addRoutes({
      path: '/api/feed',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration,
    });
    this.api.addRoutes({ path: '/api/feed/{id}', methods: [apigwv2.HttpMethod.DELETE], integration });
    new apigwv2.HttpStage(this, 'DefaultStage', {
      httpApi: this.api,
      stageName: '$default',
      autoDeploy: true,
      // ponytail: every /feed view reaches the Lambda, bounded only by this throttle and the
      // WAF per-IP limit. Add a short-TTL CloudFront cache policy for GET if traffic grows.
      throttle: { burstLimit: 20, rateLimit: 10 },
    });
  }
}
