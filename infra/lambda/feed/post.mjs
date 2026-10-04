import { createHash, timingSafeEqual } from 'node:crypto';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const IMAGE_SIGNATURES = [
  { extension: 'jpg', contentType: 'image/jpeg', matches: (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]) },
  { extension: 'png', contentType: 'image/png', matches: (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]) },
  { extension: 'gif', contentType: 'image/gif', matches: (bytes) => startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) },
  {
    extension: 'webp',
    contentType: 'image/webp',
    matches: (bytes) => bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

/** A rejected post; `message` is safe to return to the caller. */
export class PostError extends Error {}

/**
 * Validates a share-sheet post body. Returns only the fields that were sent:
 * `{ url?, title?, note?, image?: { bytes, contentType, extension } }`.
 */
export function parsePost(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new PostError('Body must be a JSON object');
  }
  const post = {};
  const title = text(body.title, 300);
  const note = text(body.note, 500);
  if (title) post.title = title;
  if (note) post.note = note;
  if (body.url) post.url = httpUrl(body.url);
  if (body.image) post.image = image(body.image);
  if (!post.url && !post.image) {
    throw new PostError('Send a url or an image');
  }
  return post;
}

/** Constant-time comparison; hashing first makes both sides the same length. */
export function tokenMatches(presented, expected) {
  if (typeof presented !== 'string' || !presented || !expected) {
    return false;
  }
  return timingSafeEqual(sha256(presented), sha256(expected));
}

function text(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function httpUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || !URL.canParse(value.trim())) {
    throw new PostError('url is not a valid URL');
  }
  const url = new URL(value.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PostError('url must be http or https');
  }
  return url.href;
}

function image(value) {
  if (typeof value !== 'string') {
    throw new PostError('image must be a base64 string');
  }
  const bytes = Buffer.from(value.replace(/\s/g, ''), 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new PostError('image is larger than 4 MB');
  }
  const signature = IMAGE_SIGNATURES.find((candidate) => candidate.matches(bytes));
  if (!signature) {
    throw new PostError('image must be a JPEG, PNG, GIF, or WebP');
  }
  return { bytes, contentType: signature.contentType, extension: signature.extension };
}

function startsWith(bytes, prefix) {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function sha256(value) {
  return createHash('sha256').update(value).digest();
}
