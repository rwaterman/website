/**
 * Minimal OPML reader for /feeds. OPML is flat, attribute-only <outline> elements,
 * so a tag scanner with a folder stack covers it without an XML dependency.
 * Malformed input throws so the build fails instead of rendering a partial list.
 */

export interface Feed {
  title: string;
  xmlUrl: string;
  htmlUrl?: string;
}

export interface FeedGroup {
  title: string;
  feeds: Feed[];
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const UNGROUPED = 'Other';
/** Stack marker for a feed element that closes with an explicit </outline>. */
const FEED = Symbol('feed');

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
    const named = NAMED_ENTITIES[body.toLowerCase()];
    if (named === undefined) throw new Error(`Unknown entity ${entity} in OPML`);
    return named;
  });
}

function parseAttrs(text: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [, name, value] of text.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    if (name !== undefined && value !== undefined) attrs[name] = decodeEntities(value);
  }
  return attrs;
}

/** Groups feeds by their top-level folder; nested folders flatten into the top-level one. */
export function parseOpml(xml: string): FeedGroup[] {
  if (!/<opml\b/i.test(xml)) throw new Error('Not an OPML document: missing <opml> root');

  const groups = new Map<string, Feed[]>();
  const stack: Array<string | typeof FEED> = [];

  for (const match of xml.matchAll(/<outline\b([^>]*?)(\/?)>|<\/outline>/g)) {
    if (match[0] === '</outline>') {
      if (stack.pop() === undefined) throw new Error('Unbalanced </outline> in OPML');
      continue;
    }
    const attrs = parseAttrs(match[1] ?? '');
    const selfClosing = match[2] === '/';
    const title = (attrs.title ?? attrs.text ?? '').trim();
    if (!title) throw new Error(`OPML outline without title or text: ${match[0]}`);

    if (attrs.xmlUrl) {
      const folder = stack[0];
      const group = typeof folder === 'string' ? folder : UNGROUPED;
      const feeds = groups.get(group) ?? [];
      feeds.push({ title, xmlUrl: attrs.xmlUrl, htmlUrl: attrs.htmlUrl || undefined });
      groups.set(group, feeds);
      if (!selfClosing) stack.push(FEED);
    } else if (!selfClosing) {
      stack.push(title);
    }
  }

  if (stack.length > 0) throw new Error('Unbalanced <outline> in OPML: missing close tags');
  const result = [...groups].map(([title, feeds]) => ({ title, feeds }));
  if (result.length === 0) throw new Error('No feeds found in OPML');
  return result;
}
