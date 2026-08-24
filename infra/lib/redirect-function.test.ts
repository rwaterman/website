import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRedirectFunctionCode } from './redirect-function.ts';

const handler = new Function(`${buildRedirectFunctionCode('old.example', 'new.example')}; return handler;`)();

function location(host: string, uri: string, querystring: Record<string, unknown> = {}): string {
  const response = handler({ request: { method: 'GET', uri, querystring, headers: { host: { value: host } }, cookies: {} } });
  assert.equal(response.statusCode, 301);
  return response.headers.location.value;
}

test('apex redirects to the new apex keeping the path', () => {
  assert.equal(location('old.example', '/about/'), 'https://new.example/about/');
});

test('subdomain maps to the same subdomain', () => {
  assert.equal(location('blog.old.example', '/'), 'https://blog.new.example/');
});

test('query string survives, including repeated keys', () => {
  const querystring = { a: { value: '1' }, b: { value: 'x', multiValue: [{ value: 'x' }, { value: 'y' }] } };
  assert.equal(location('old.example', '/p', querystring), 'https://new.example/p?a=1&b=x&b=y');
});

test('unknown host falls back to the new apex', () => {
  assert.equal(location('d1.cloudfront.net', '/x'), 'https://new.example/x');
});
