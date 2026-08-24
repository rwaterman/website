import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOpml } from './opml.ts';

const sample = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <head><title>Feeds</title></head>
  <body>
    <outline text=" Tech News">
      <outline type="rss" text="Ars" title="Ars &amp; Co" xmlUrl="https://a.example/rss" htmlUrl="https://a.example"></outline>
      <outline text="Nested">
        <outline type="rss" text="Deep" xmlUrl="https://d.example/rss" htmlUrl=""/>
      </outline>
    </outline>
    <outline text="Empty"></outline>
    <outline type="rss" text="Loose" xmlUrl="https://l.example/rss" htmlUrl="https://l.example"/>
  </body>
</opml>`;

test('groups by top-level folder, flattens nested folders, skips empty folders, decodes entities', () => {
  assert.deepEqual(parseOpml(sample), [
    {
      title: 'Tech News',
      feeds: [
        { title: 'Ars & Co', xmlUrl: 'https://a.example/rss', htmlUrl: 'https://a.example' },
        { title: 'Deep', xmlUrl: 'https://d.example/rss', htmlUrl: undefined },
      ],
    },
    { title: 'Other', feeds: [{ title: 'Loose', xmlUrl: 'https://l.example/rss', htmlUrl: 'https://l.example' }] },
  ]);
});

test('rejects non-OPML, unbalanced, and empty documents', () => {
  assert.throws(() => parseOpml('<html/>'), /missing <opml> root/);
  assert.throws(() => parseOpml('<opml><body><outline text="A"></body></opml>'), /missing close tags/);
  assert.throws(() => parseOpml('<opml><body></outline></body></opml>'), /Unbalanced <\/outline>/);
  assert.throws(() => parseOpml('<opml><body></body></opml>'), /No feeds found/);
});
