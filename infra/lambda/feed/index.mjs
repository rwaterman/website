import { randomBytes } from 'node:crypto';
import { DynamoDBClient, PutItemCommand, QueryCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { parsePost, tokenMatches, PostError } from './post.mjs';

const dynamodb = new DynamoDBClient({});
const s3 = new S3Client({});
const ssm = new SSMClient({});

const FEED_PARTITION = 'feed';
const MEDIA_PREFIX = 'feed-media/';
// ponytail: newest 100 only, no pagination. Add a cursor when the feed outgrows one page.
const PAGE_SIZE = 100;
let cachedToken;

export async function handler(event) {
  const method = event.requestContext?.http?.method;
  try {
    if (method === 'GET') {
      return json(200, { items: await listItems() });
    }
    if (!tokenMatches(event.headers?.['x-feed-token'], await getToken())) {
      return json(401, { message: 'Unauthorized' });
    }
    if (method === 'POST') {
      return json(201, await createItem(parsePost(JSON.parse(readBody(event)))));
    }
    if (method === 'DELETE') {
      await deleteItem(event.pathParameters?.id);
      return json(200, { ok: true });
    }
    return json(405, { message: 'Method not allowed' });
  } catch (error) {
    if (error instanceof PostError || error instanceof SyntaxError) {
      return json(400, { message: error.message });
    }
    console.error(JSON.stringify({ message: 'Feed request failed', method, error: error?.name, detail: error?.message }));
    return json(500, { message: 'Feed request failed' });
  }
}

async function listItems() {
  const response = await dynamodb.send(
    new QueryCommand({
      TableName: process.env.TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': { S: FEED_PARTITION } },
      ScanIndexForward: false,
      Limit: PAGE_SIZE,
    }),
  );
  return (response.Items ?? []).map((item) => ({
    id: item.sk.S,
    createdAt: item.createdAt.S,
    url: item.url?.S,
    title: item.title?.S,
    note: item.note?.S,
    image: item.imageKey ? `/${item.imageKey.S}` : undefined,
  }));
}

async function createItem(post) {
  // Base36 milliseconds sort lexicographically as time until the year 5188.
  const id = Date.now().toString(36).padStart(9, '0') + randomBytes(4).toString('hex');
  const item = {
    pk: { S: FEED_PARTITION },
    sk: { S: id },
    createdAt: { S: new Date().toISOString() },
  };
  if (post.url) item.url = { S: post.url };
  if (post.title) item.title = { S: post.title };
  if (post.note) item.note = { S: post.note };
  if (post.image) {
    const imageKey = `${MEDIA_PREFIX}${id}.${post.image.extension}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.MEDIA_BUCKET_NAME,
        Key: imageKey,
        Body: post.image.bytes,
        ContentType: post.image.contentType,
        CacheControl: 'public,max-age=31536000,immutable',
      }),
    );
    item.imageKey = { S: imageKey };
  }
  await dynamodb.send(new PutItemCommand({ TableName: process.env.TABLE_NAME, Item: item }));
  return { id };
}

async function deleteItem(id) {
  if (!id) {
    throw new PostError('Missing id');
  }
  const response = await dynamodb.send(
    new DeleteItemCommand({
      TableName: process.env.TABLE_NAME,
      Key: { pk: { S: FEED_PARTITION }, sk: { S: id } },
      ReturnValues: 'ALL_OLD',
    }),
  );
  const imageKey = response.Attributes?.imageKey?.S;
  if (imageKey) {
    await s3.send(new DeleteObjectCommand({ Bucket: process.env.MEDIA_BUCKET_NAME, Key: imageKey }));
  }
}

async function getToken() {
  if (cachedToken) {
    return cachedToken;
  }
  const response = await ssm.send(
    new GetParameterCommand({ Name: process.env.TOKEN_PARAMETER_NAME, WithDecryption: true }),
  );
  cachedToken = response.Parameter?.Value;
  if (!cachedToken) {
    throw new Error(`Empty feed token parameter ${process.env.TOKEN_PARAMETER_NAME}`);
  }
  return cachedToken;
}

function readBody(event) {
  return event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : (event.body ?? '');
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  };
}
