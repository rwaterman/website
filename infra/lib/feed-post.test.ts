import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePost, tokenMatches, PostError } from '../lambda/feed/post.mjs';

const base64 = (bytes: number[]): string => Buffer.from(bytes).toString('base64');
const jpeg = base64([0xff, 0xd8, 0xff, 0xe0, 0x00]);

test('a link post keeps url, title, and note, trimmed', () => {
  assert.deepEqual(parsePost({ url: ' https://youtu.be/dQw4w9WgXcQ ', title: ' Video ', note: ' watch this ' }), {
    url: 'https://youtu.be/dQw4w9WgXcQ',
    title: 'Video',
    note: 'watch this',
  });
});

test('an image post is sniffed by content, whitespace in the base64 ignored', () => {
  const post = parsePost({ image: `${jpeg.slice(0, 4)}\n${jpeg.slice(4)}` });
  assert.equal(post.image.contentType, 'image/jpeg');
  assert.equal(post.image.extension, 'jpg');
  assert.equal(post.image.bytes.length, 5);

  const webp = base64([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]);
  assert.equal(parsePost({ image: webp }).image.contentType, 'image/webp');
});

test('rejects non-http urls, unknown image types, oversized images, and empty posts', () => {
  assert.throws(() => parsePost({ url: 'javascript:alert(1)' }), PostError);
  assert.throws(() => parsePost({ url: 'not a url' }), /valid URL/);
  assert.throws(() => parsePost({ image: base64([0x3c, 0x73, 0x76, 0x67]) }), /JPEG, PNG, GIF, or WebP/);
  assert.throws(() => parsePost({ image: Buffer.alloc(4 * 1024 * 1024 + 1, 0xff).toString('base64') }), /4 MB/);
  assert.throws(() => parsePost({ note: 'only a note' }), /url or an image/);
  assert.throws(() => parsePost(null), /JSON object/);
  assert.throws(() => parsePost([]), /JSON object/);
});

test('tokenMatches needs the exact token', () => {
  assert.equal(tokenMatches('secret', 'secret'), true);
  assert.equal(tokenMatches('secre', 'secret'), false);
  assert.equal(tokenMatches('', 'secret'), false);
  assert.equal(tokenMatches(undefined, 'secret'), false);
  assert.equal(tokenMatches('secret', undefined), false);
});
