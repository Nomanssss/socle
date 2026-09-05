// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import rehypeScrollableTables from './scripts/rehype-scrollable-tables.mjs';

// https://astro.build/config
export default defineConfig({
  integrations: [mdx()],
  markdown: {
    // Les tableaux trop larges défilent dans leur propre conteneur au lieu
    // d'élargir la page. La config markdown s'applique aussi aux .mdx :
    // @astrojs/mdx en hérite par défaut.
    rehypePlugins: [rehypeScrollableTables],
  },
});
