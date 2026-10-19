// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';

// The dragon easter egg (footer glyph and header tag, src/lib/dragon) ships in every build,
// prod included. DRAGON=off leaves it out of a build without a code change.
const dragonEnabled = process.env.DRAGON !== 'off';

// https://astro.build/config
// `site` is provided per environment at build time (https://dev.rickwaterman.com
// vs https://rickwaterman.com) so canonical URLs and sitemaps are correct.
export default defineConfig({
  site: process.env.SITE,
  integrations: [sitemap(), react()],
  // The dev toolbar floats over the footer in local previews; set to true to bring it back.
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
    // A build-time constant, so a disabled build drops the dragon code instead of hiding it.
    define: { __DRAGON_ENABLED__: JSON.stringify(dragonEnabled) },
    // src/lib/tracker.worklet.ts is bundled as a worker and loaded as an AudioWorklet. The default
    // 'iife' format rewrites import.meta.url to self.location, and worklets have no `self`.
    // libopenmpt's Emscripten glue imports node:module on a branch only Node takes.
    worker: { format: 'es', rolldownOptions: { external: ['node:module'] } },
    // The dev server only meets that import when the worklet first loads; pre-bundling it then
    // forces a page reload mid-play, and the file is a single ES module already.
    // three.js is only reached through the dragon's dynamic import, so the dev server would discover it
    // on the first click, re-optimise, and fail that click with a 504. Pre-bundle it up front instead.
    optimizeDeps: {
      exclude: ['chiptune3'],
      include: [
        'three',
        'three/addons/postprocessing/EffectComposer.js',
        'three/addons/postprocessing/OutputPass.js',
        'three/addons/postprocessing/RenderPass.js',
        'three/addons/postprocessing/UnrealBloomPass.js',
      ],
    },
  },
});
