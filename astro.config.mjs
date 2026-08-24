// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
// `site` is provided per environment at build time (https://dev.rickwaterman.com
// vs https://rickwaterman.com) so canonical URLs and sitemaps are correct.
export default defineConfig({
  site: process.env.SITE,
  // /fun is built but unlinked for now (no nav item), so keep it out of the sitemap too.
  integrations: [sitemap({ filter: (page) => !page.endsWith('/fun/') })],
  vite: {
    plugins: [tailwindcss()],
  },
});
