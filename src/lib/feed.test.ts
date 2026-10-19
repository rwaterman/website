import { test } from 'node:test';
import assert from 'node:assert/strict';
import { httpUrl, youtubeId } from './feed.ts';

test('youtubeId reads every share-sheet link shape', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=abc',
    'https://youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ?feature=share',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
  ]) {
    assert.equal(youtubeId(url), 'dQw4w9WgXcQ', url);
  }
});

test('youtubeId ignores other hosts, channel pages, and malformed ids', () => {
  for (const url of [
    'https://www.reddit.com/r/aws/comments/abc/title/',
    'https://www.youtube.com/@channel',
    'https://www.youtube.com/watch?v=short',
    'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/"><script>',
    undefined,
  ]) {
    assert.equal(youtubeId(url), undefined, String(url));
  }
});

test('httpUrl accepts only http and https', () => {
  assert.equal(httpUrl('https://example.com/a')?.host, 'example.com');
  assert.equal(httpUrl('javascript:alert(1)'), undefined);
  assert.equal(httpUrl('data:text/html,x'), undefined);
  assert.equal(httpUrl('not a url'), undefined);
  assert.equal(httpUrl(undefined), undefined);
});
