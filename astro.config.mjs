// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
// `site` is provided per environment at build time (https://dev.rickgwaterman.com
// vs https://rickgwaterman.com) so canonical URLs and sitemaps are correct.
export default defineConfig({
  site: process.env.SITE,
  vite: {
    plugins: [tailwindcss()],
  },
});
