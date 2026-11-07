// =============================================================
// slides-deck.mjs - de quoi est fait le deck d'une leçon
//
// L'assemblage d'un deck, sorti de build-slides.mjs pour être partagé
// avec l'aperçu des slides de l'admin : une slide de titre fabriquée
// depuis l'en-tête, le corps (le fichier « .slides.md » s'il existe,
// sinon les slidePoints), puis la slide de fin. Deux endroits qui
// assembleraient chacun leur deck finiraient par ne plus montrer la
// même chose - et l'aperçu mentirait.
//
// Ce module ne copie ni n'écrit rien. Là où un deck cite une image,
// c'est l'appelant qui dit comment la désigner (`stage`) : build-slides
// la copie dans slides/assets/, l'admin la sert par son API.
// =============================================================

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import matter from 'gray-matter';
import { author, site } from './config.mjs';
import { rewriteImages } from './stage-images.mjs';

/**
 * Image du bandeau des slides de titre, pour les leçons SANS `cover:`.
 * Se règle dans socle.config.json :
 *
 *   "slides": { "band": "src/assets/mon-bandeau.png" }
 *
 * Chemin relatif à la racine du projet. Absente, le bandeau reste un aplat de
 * la couleur principale (c'est layouts/_lead.scss qui le décide).
 *
 * @param {string} [root]
 * @returns {string | null}
 */
export function defaultBand(root = process.cwd()) {
  const configPath = join(root, 'socle.config.json');
  if (!existsSync(configPath)) return null;
  try {
    const band = JSON.parse(readFileSync(configPath, 'utf8'))?.slides?.band;
    if (!band) return null;
    const abs = resolve(root, String(band));
    if (!existsSync(abs)) {
      console.warn(`  ⚠ slides.band introuvable : ${band} (bandeau laissé en aplat)`);
      return null;
    }
    return abs;
  } catch {
    return null;
  }
}

// Échappe une valeur pour le frontmatter YAML (guillemets).
const yamlString = (/** @type {unknown} */ s) => `"${String(s).replace(/"/g, '\\"')}"`;

/**
 * L'en-tête Marp d'un deck : les mêmes réglages pour tous, plus le surtitre
 * et le pied de page de ses slides.
 *
 *   header  le module, en surtitre au-dessus du titre de chaque slide ;
 *   footer  le cours et la leçon, dans la bande de pied, à gauche de la
 *           pagination.
 *
 * Ce sont des directives GLOBALES : elles valent pour toutes les slides du
 * deck. Le thème les masque là où la mise en page se suffit à elle-même
 * (slide de titre, intercalaire, citation, image plein cadre, fin).
 *
 * @param {unknown} title
 * @param {{ header?: string | null, footer?: string | null }} [options]
 */
export function marpHeader(title, { header, footer } = {}) {
  let head = '---\n';
  head += 'marp: true\n';
  head += 'theme: socle\n';
  head += 'paginate: true\n';
  if (title) head += `title: ${yamlString(title)}\n`;
  if (header) head += `header: ${yamlString(header)}\n`;
  if (footer) head += `footer: ${yamlString(footer)}\n`;
  head += '---\n\n';
  return head;
}

/**
 * Le libellé d'un module en surtitre : « Module 1 - Prendre le template en
 * main » devient « Module 1 · Prendre le template en main ». Le point médian
 * est celui des surtitres du site ; un libellé d'une autre forme passe tel
 * quel.
 *
 * @param {unknown} label
 */
export const moduleEyebrow = (label) => String(label).replace(/^(module\s+\d+)\s*[-–—:]\s*/i, '$1 · ');

/**
 * « Module 1 - Prendre le template en main » → « Prendre le template en main ».
 *
 * @param {unknown} label
 */
export const moduleShortName = (label) =>
  String(label).replace(/^module\s+\d+\s*[-–—:·.]\s*/i, '').trim() || String(label);

/**
 * Le pied de page d'une leçon : « Socle — Ce que fait ce template ».
 *
 * @param {unknown} title
 */
export const lessonFooter = (title) => `${site().title} — ${title}`;

/**
 * L'en-tête Marp du deck d'UNE leçon : son titre, son module en surtitre,
 * le cours et la leçon en pied de page. Partagé par build-slides et par
 * l'aperçu de l'admin, qui montrent ainsi les mêmes slides.
 *
 * @param {Record<string, any>} data L'en-tête de la leçon.
 * @param {string} id
 */
export function lessonHead(data, id) {
  return marpHeader(data.title, {
    header: data.module ? moduleEyebrow(data.module) : null,
    footer: lessonFooter(data.title ?? id),
  });
}

/**
 * La slide de fin, commune à tous les decks : un remerciement, le logo
 * (peint par layouts/_end.scss), puis le nom et les liens de l'auteur, lus
 * dans « author.name » et « author.links » de socle.config.json. Sans eux,
 * la slide garde son « Merci ! » et son logo.
 *
 * Les crochets d'un libellé sont échappés : « [Blog] » casserait la
 * syntaxe du lien markdown.
 */
export function endSlide() {
  let slide = '\n---\n\n<!-- _class: end -->\n<!-- _paginate: false -->\n\n# Merci !\n';
  const { name, links } = author();
  if (name) slide += `\n${name}\n`;
  if (links.length) {
    slide += '\n';
    for (const { label, url } of links) {
      slide += `- [${label.replace(/[[\]]/g, '\\$&')}](<${url}>)\n`;
    }
  }
  return slide;
}

/**
 * Le dossier de module d'une leçon, ou null si elle est à la racine.
 *
 * @param {string} rel
 */
export function moduleDirOf(rel) {
  return rel.includes('/') || rel.includes('\\') ? rel.split(/[/\\]/)[0] : null;
}

/**
 * La couverture d'un module : celle de sa PREMIÈRE leçon qui en déclare
 * une, au sens du champ « order » et non de l'ordre alphabétique des
 * fichiers.
 *
 * Elle sert deux fois : de bandeau aux leçons du module qui n'ont pas la
 * leur, et à la slide de titre du deck de module. Sans elle, un module
 * dont une seule leçon est illustrée produisait un deck panaché - une
 * slide de titre en image, les suivantes en aplat.
 *
 * Il faut une passe séparée : la leçon 2 peut avoir besoin de la
 * couverture de la leçon 1, or la boucle principale les traite dans
 * l'ordre des fichiers, sans savoir ce qui vient après.
 *
 * @param {string} lessonsDir
 * @param {string[]} rels Les leçons à considérer, relatives à lessonsDir.
 * @returns {Map<string, { order: number, path: string }>}
 */
export function moduleCovers(lessonsDir, rels) {
  const covers = new Map();

  for (const rel of rels) {
    const dir = moduleDirOf(rel);
    if (!dir) continue;

    const file = join(lessonsDir, rel);
    const { data } = matter(readFileSync(file, 'utf8'));
    if (!data.cover) continue;

    const order = Number.isFinite(Number(data.order)) ? Number(data.order) : Infinity;
    const known = covers.get(dir);
    if (!known || order < known.order) {
      covers.set(dir, { order, path: resolve(dirname(file), String(data.cover)) });
    }
  }
  return covers;
}

/**
 * Le deck écrit à la main d'une leçon : « lecon-2.mdx » → « lecon-2.slides.md ».
 *
 * @param {string} file
 */
export function slidesFileOf(file) {
  return join(dirname(file), `${basename(file, '.mdx')}.slides.md`);
}

/**
 * Les trois morceaux du deck d'une leçon.
 *
 * `slides` permet à l'admin de montrer un deck qui n'est pas encore
 * enregistré : absent, on lit le fichier « .slides.md » s'il existe ;
 * null, on fait comme s'il n'existait pas ; un texte, on le prend tel
 * quel.
 *
 * @param {{
 *   rel: string,
 *   file: string,
 *   data: Record<string, any>,
 *   covers: Map<string, { path: string }>,
 *   band: string | null,
 *   stage: (absPath: string) => string | null,
 *   slides?: string | null,
 * }} lesson
 */
export function lessonParts({ rel, file, data, covers, band, stage, slides }) {
  const dir = dirname(file);
  const id = rel.replace(/\.mdx$/, '');

  // -- Slide de titre ------------------------------------------------------
  // Elle existe en DEUX versions, pour deux rôles : « lead » ouvre le deck
  // de la leçon, « section » n'est qu'un intercalaire dans celui du module.
  // Le corps qui suit, lui, est le même - assemblé une fois, servi deux fois.
  let lead = '<!-- _class: lead -->\n';
  lead += '<!-- _paginate: false -->\n\n';
  // La couverture alimente le panneau d'image de la slide de titre. On ne
  // passe pas par `![bg]` : cette syntaxe ne laisse pas la mise en page
  // décider du cadrage. La directive, elle, expose
  // l'image dans la variable `--background-image`, que `layouts/_lead.scss`
  // récupère pour la cadrer lui-même. Aucun réglage de taille à passer ici :
  // le cadrage appartient à la mise en page.
  const bandSource =
    (data.cover && resolve(dir, String(data.cover))) ||
    covers.get(/** @type {string} */ (moduleDirOf(rel)))?.path ||
    band;
  if (bandSource) {
    const staged = stage(bandSource);
    if (staged) lead += `<!-- _backgroundImage: url('${staged}') -->\n`;
  }
  lead += '\n';
  // Surtitre, titre, chapô. Le surtitre situe la leçon (« Module 1 · Leçon
  // 2 ») quand les deux numéros sont connus, sinon il reprend le module.
  const position =
    Number.isFinite(Number(data.moduleOrder)) && Number.isFinite(Number(data.order))
      ? `Module ${data.moduleOrder} · Leçon ${data.order}`
      : data.module;
  if (position) lead += `${position}\n\n`;
  lead += `# ${data.title ?? id}\n\n`;
  if (data.description) lead += `${data.description}\n`;

  // L'intercalaire, lui, se réduit au titre : le nom du module est déjà sur
  // la première slide du deck, et le fond plein du modèle « section » ne
  // s'accommode ni d'une couverture ni d'un sous-titre. La pagination y
  // reste active - on est au milieu d'un deck, plus à son ouverture.
  //
  // Il relance aussi le pied de page : dans le deck du module, chaque leçon
  // y inscrit son titre à partir de sa propre ouverture. Une directive sans
  // « _ » vaut pour la slide ET les suivantes, jusqu'à la prochaine.
  const section =
    `<!-- _class: section -->\n<!-- footer: ${yamlString(lessonFooter(data.title ?? id))} -->\n\n` +
    `# ${data.title ?? id}\n`;

  // -- Corps, commun aux deux versions -------------------------------------
  let markdown = slides;
  if (markdown === undefined) {
    const slidesFile = slidesFileOf(file);
    markdown = existsSync(slidesFile) ? readFileSync(slidesFile, 'utf8') : null;
  }

  let content = '';
  if (markdown !== null) {
    content += `\n---\n\n${rewriteImages(markdown.trim(), dir, stage)}\n`;
  } else if (Array.isArray(data.slidePoints) && data.slidePoints.length) {
    content += '\n---\n\n## Points clés\n\n';
    for (const point of data.slidePoints) content += `- ${point}\n`;
  } else {
    content += '\n---\n\n## Résumé\n\nRetrouvez cette leçon en ligne.\n';
  }

  return { lead, section, content };
}
