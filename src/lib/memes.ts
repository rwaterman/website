import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import exifr from 'exifr';

// Source directory of the meme files, read at build time for EXIF/git dates.
// Anchored to the project root (cwd) because the glob keys resolve against the
// bundled module location at build, not the original source.
const MEMES_DIR = join(process.cwd(), 'src', 'memes');

export interface Meme {
  /** Hashed asset URL emitted by the build. */
  src: string;
  width: number;
  height: number;
  name: string;
  date: Date;
}

type ImageModule = { default: { src: string; width: number; height: number } };

// Every image dropped into src/memes/ is picked up automatically at build time.
const images = import.meta.glob<ImageModule>('../memes/*.{jpg,jpeg,png,gif,webp,avif}', {
  eager: true,
});

// EXIF capture date — present on real photos, almost never on screenshots/downloads.
async function exifDate(absPath: string): Promise<Date | null> {
  try {
    const data = await exifr.parse(absPath, ['DateTimeOriginal', 'CreateDate']);
    const value = data?.DateTimeOriginal ?? data?.CreateDate;
    return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
  } catch {
    return null;
  }
}

// Date the file was first committed — stable across clones and CI checkouts,
// where file mtimes are reset to checkout time. Requires full git history
// (deploy workflow uses fetch-depth: 0).
function gitAddedDate(absPath: string): Date | null {
  try {
    const out = execFileSync(
      'git',
      ['log', '--follow', '--diff-filter=A', '--format=%aI', '-1', '--', absPath],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return out ? new Date(out) : null;
  } catch {
    return null;
  }
}

export async function getMemes(): Promise<Meme[]> {
  const memes = await Promise.all(
    Object.entries(images).map(async ([path, mod]) => {
      const name = path.split('/').pop() ?? path;
      const absPath = join(MEMES_DIR, name);
      const date = (await exifDate(absPath)) ?? gitAddedDate(absPath) ?? statSync(absPath).mtime;
      const { src, width, height } = mod.default;
      return { src, width, height, name, date };
    }),
  );

  return memes.sort((a, b) => b.date.getTime() - a.date.getTime());
}
