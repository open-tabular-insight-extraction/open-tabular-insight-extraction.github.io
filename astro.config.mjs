// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { unified } from '@astrojs/markdown-remark';
import rehypeNumberHeadings from './src/lib/rehype-number-headings.mjs';

// GitHub Pages user/org site: served from https://open-tabular-insight-extraction.github.io/
// (the `open-tabular-insight-extraction.github.io` repo under the `open-tabular-insight-extraction`
// GitHub user), so `base` is the domain root rather than a repo subpath. Self-hosting (see
// docker-compose.yml) also serves from a domain root, so both are overridable at build time
// via SITE_ORIGIN/SITE_BASE, but the defaults already agree.
export default defineConfig({
  site: process.env.SITE_ORIGIN ?? 'https://open-tabular-insight-extraction.github.io',
  base: process.env.SITE_BASE ?? '/',
  output: 'static',
  // Trailing slash consistency keeps GitHub Pages links stable across dev and prod.
  trailingSlash: 'ignore',
  markdown: {
    // Shared by .md and .mdx (MDX inherits via extendMarkdownConfig): $inline$ and
    // $$block$$ math parsed to KaTeX at build time, so concept prose (.local/paper
    // notation) renders without a client-side typesetting pass.
    processor: unified({
      remarkPlugins: [remarkMath],
      // Heading numbering runs after KaTeX so it only ever touches heading
      // elements, not the math nodes KaTeX has already expanded within them.
      rehypePlugins: [rehypeKatex, rehypeNumberHeadings],
    }),
  },
  integrations: [svelte(), mdx(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
