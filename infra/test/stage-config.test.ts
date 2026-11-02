import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cdk from 'aws-cdk-lib';
import { resolveStage, STAGES } from '../lib/site-config.ts';

const DEV_ACCOUNT = '690084476262';
const PROD_ACCOUNT = '582621605246';

test('throws when -c stage is missing', () => {
  const app = new cdk.App();
  assert.throws(() => resolveStage(app, { CDK_DEFAULT_ACCOUNT: DEV_ACCOUNT }), /Pass -c stage=dev or -c stage=prod/);
});

test('throws when -c stage is not dev or prod', () => {
  const app = new cdk.App({ context: { stage: 'staging' } });
  assert.throws(() => resolveStage(app, { CDK_DEFAULT_ACCOUNT: DEV_ACCOUNT }), /Pass -c stage=dev or -c stage=prod/);
});

test('throws when credentials are for another account', () => {
  const app = new cdk.App({ context: { stage: 'dev' } });
  assert.throws(
    () => resolveStage(app, { CDK_DEFAULT_ACCOUNT: '349324301382' }),
    new Error(`Stage dev targets ${DEV_ACCOUNT}, but credentials are for 349324301382`),
  );
});

test('throws when CDK_DEFAULT_ACCOUNT is unset', () => {
  const app = new cdk.App({ context: { stage: 'prod' } });
  assert.throws(() => resolveStage(app, {}), /CDK_DEFAULT_ACCOUNT/);
});

test('returns the dev stage when credentials match', () => {
  const app = new cdk.App({ context: { stage: 'dev' } });
  const stage = resolveStage(app, { CDK_DEFAULT_ACCOUNT: DEV_ACCOUNT });
  assert.equal(stage, STAGES.dev);
  assert.equal(stage.account, DEV_ACCOUNT);
  assert.equal(stage.hostedZoneId, 'Z02783752H850YJ2Z0LST');
  assert.equal(stage.zoneName, 'dev.rickwaterman.com');
  assert.equal(stage.domainName, 'dev.rickwaterman.com');
  assert.equal(stage.githubEnvironment, 'dev');
  assert.equal(stage.webAcl, false);
  assert.equal(stage.includeWww, false);
  assert.equal(stage.redirectHostedZoneId, undefined);
});

test('returns the prod stage when credentials match', () => {
  const app = new cdk.App({ context: { stage: 'prod' } });
  const stage = resolveStage(app, { CDK_DEFAULT_ACCOUNT: PROD_ACCOUNT });
  assert.equal(stage.account, PROD_ACCOUNT);
  assert.equal(stage.hostedZoneId, 'Z050080263SGEDSJA265');
  assert.equal(stage.redirectHostedZoneId, 'Z020082913XRFVMF1P8GK');
  assert.equal(stage.zoneName, 'rickwaterman.com');
  assert.equal(stage.githubEnvironment, 'prod');
  assert.equal(stage.webAcl, true);
  assert.equal(stage.includeWww, true);
});
