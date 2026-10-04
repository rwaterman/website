/** One post as returned by GET /api/feed. */
export interface FeedItem {
  id: string;
  createdAt: string;
  url?: string;
  title?: string;
  note?: string;
  /** Site-relative path of an uploaded image. */
  image?: string;
}

const YOUTUBE_ID = /^[\w-]{11}$/;
const YOUTUBE_PATH_PREFIXES = ['/shorts/', '/embed/', '/live/'];

/** Parses an http(s) URL; anything else (javascript:, data:, garbage) is undefined. */
export function httpUrl(value: string | undefined): URL | undefined {
  if (!value || !URL.canParse(value)) {
    return undefined;
  }
  const url = new URL(value);
  return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined;
}

/** Video id for watch, youtu.be, shorts, embed, and live links; undefined for anything else. */
export function youtubeId(value: string | undefined): string | undefined {
  const url = httpUrl(value);
  if (!url) {
    return undefined;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  const id = host === 'youtu.be' ? url.pathname.slice(1) : host === 'youtube.com' ? youtubePathId(url) : undefined;
  return id && YOUTUBE_ID.test(id) ? id : undefined;
}

function youtubePathId(url: URL): string | undefined {
  if (url.pathname === '/watch') {
    return url.searchParams.get('v') ?? undefined;
  }
  const prefix = YOUTUBE_PATH_PREFIXES.find((candidate) => url.pathname.startsWith(candidate));
  return prefix ? url.pathname.slice(prefix.length).split('/')[0] : undefined;
}
