// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import rehypeScrollableTables from './scripts/rehype-scrollable-tables.mjs';
import { site } from './scripts/config.mjs';

// L'adresse publique du cours, réglée dans socle.config.json. Elle est ce
// qui permet à Astro de composer des URL absolues - liens canoniques et
// balises de partage. Absente, le site se construit très bien, mais une
// page partagée n'a pas d'URL à annoncer : on le dit une fois, ici, plutôt
// qu'à chaque page.
const { url: siteUrl } = site();

if (!siteUrl) {
  console.warn(
    '\n⚠ socle.config.json → « site.url » est vide. Les liens canoniques et ' +
      'les balises OpenGraph d’URL ne seront pas générés.\n'
  );
}

// https://astro.build/config
export default defineConfig({
  site: siteUrl || undefined,
  integrations: [mdx()],
  markdown: {
    // Les tableaux trop larges défilent dans leur propre conteneur au lieu
    // d'élargir la page. La config markdown s'applique aussi aux .mdx :
    // @astrojs/mdx en hérite par défaut.
    rehypePlugins: [rehypeScrollableTables],
  },
});
