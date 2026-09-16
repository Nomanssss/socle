// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
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
    '\n⚠ socle.config.json → « site.url » est vide. Les liens canoniques, le ' +
      'plan du site (sitemap.xml) et les balises OpenGraph d’URL ne seront ' +
      'pas générés.\n'
  );
}

// https://astro.build/config
export default defineConfig({
  site: siteUrl || undefined,
  // Le plan du site ne s'ajoute QUE si l'adresse publique est connue : un
  // sitemap est une liste d'URL absolues, il n'y a rien à écrire dedans
  // sans elle. Le générateur s'en plaindrait d'ailleurs au build - autant
  // ne pas le brancher, le site se construit alors sans lui.
  //
  // Les leçons verrouillées n'ont pas à en être exclues : leur page n'est
  // jamais générée, elle ne peut donc pas s'y retrouver. Seule la page 404
  // le mérite - elle existe dans dist/, mais n'est l'adresse de rien.
  integrations: [
    mdx(),
    ...(siteUrl ? [sitemap({ filter: (page) => !page.includes('/404') })] : []),
  ],
  markdown: {
    // Les tableaux trop larges défilent dans leur propre conteneur au lieu
    // d'élargir la page. La config markdown s'applique aussi aux .mdx :
    // @astrojs/mdx en hérite par défaut.
    rehypePlugins: [rehypeScrollableTables],
  },
});
