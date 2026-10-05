// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
// `site` is provided per environment at build time (https://dev.rickwaterman.com
// vs https://rickwaterman.com) so canonical URLs and sitemaps are correct.
export default defineConfig({
  site: process.env.SITE,
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
    // src/lib/tracker.worklet.ts is bundled as a worker and loaded as an AudioWorklet. The default
    // 'iife' format rewrites import.meta.url to self.location, and worklets have no `self`.
    // libopenmpt's Emscripten glue imports node:module on a branch only Node takes.
    worker: { format: 'es', rolldownOptions: { external: ['node:module'] } },
    // The dev server only meets that import when the worklet first loads; pre-bundling it then
    // forces a page reload mid-play, and the file is a single ES module already.
    optimizeDeps: { exclude: ['chiptune3'] },
  },
});
