/**
 * Image galleries for /fun. Drop files into src/assets/memes or src/assets/cats;
 * the alt text is derived from the filename ("sleepy-cat.jpg" → "sleepy cat").
 */
import type { ImageMetadata } from 'astro';

export interface GalleryImage {
  src: ImageMetadata;
  alt: string;
}

function gallery(modules: Record<string, ImageMetadata>): GalleryImage[] {
  return Object.entries(modules)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, src]) => {
      const filename = path.slice(path.lastIndexOf('/') + 1);
      return { src, alt: filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') };
    });
}

export const memes: GalleryImage[] = gallery(
  import.meta.glob<ImageMetadata>('../assets/memes/*.{jpg,jpeg,png,webp,gif}', { eager: true, import: 'default' }),
);

export const cats: GalleryImage[] = gallery(
  import.meta.glob<ImageMetadata>('../assets/cats/*.{jpg,jpeg,png,webp,gif}', { eager: true, import: 'default' }),
);
