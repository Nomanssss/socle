// =============================================================
// slides.mjs - le deck d'une leçon : le lire, l'écrire, le montrer
//
// Le deck écrit à la main d'une leçon est le fichier « .slides.md »
// posé à côté de son .mdx. L'admin le lit et l'écrit comme une leçon :
// avec une empreinte, pour ne pas écraser une modification faite
// ailleurs entre-temps.
//
// L'aperçu, lui, rend le deck tel qu'il SERAIT généré, sans attendre
// l'enregistrement : même assemblage que `npm run slides`
// (scripts/slides-deck.mjs), même moteur (Marp Core, celui de
// marp-cli), même thème - compilé depuis src/styles/marp/, comme le
// fait `npm run slides:theme`. Seules les images diffèrent : au lieu
// d'être copiées à côté du deck, elles sont servies par l'API.
// =============================================================

import { readFile, writeFile, readdir, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, relative, extname, sep } from 'node:path';
import * as sass from 'sass';
import { Marp } from '@marp-team/marp-core';
import { AdminError, LESSONS_DIR, lessonPath } from './lessons.mjs';
import { defaultBand, marpHeader, endSlide, moduleCovers, lessonParts, slidesFileOf } from '../../scripts/slides-deck.mjs';
import { isLocked, normalizeId } from '../../scripts/config.mjs';

const ROOT = process.cwd();
const STYLES_DIR = resolve(ROOT, 'src/styles');
const THEME = resolve(STYLES_DIR, 'marp/theme.scss');

const IMAGE_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

/** @param {unknown} rawId */
export async function readSlides(rawId) {
  const { id, file } = lessonPath(rawId);
  const slidesFile = slidesFileOf(file);
  if (!existsSync(slidesFile)) return { id, exists: false, markdown: '', hash: null };
  const markdown = await readFile(slidesFile, 'utf8');
  return { id, exists: true, markdown, hash: hash(markdown) };
}

/**
 * Écrit le deck d'une leçon, ou le supprime (`markdown: null`) : la
 * leçon revient alors à ses points-clés.
 *
 * @param {{ id: unknown, markdown: unknown, hash?: unknown, force?: unknown }} input
 */
export async function writeSlides({ id: rawId, markdown, hash: expected, force }) {
  const { id, file } = lessonPath(rawId);
  if (!existsSync(file)) throw new AdminError(404, `La leçon « ${id} » n’existe pas.`);
  const slidesFile = slidesFileOf(file);
  const current = existsSync(slidesFile) ? await readFile(slidesFile, 'utf8') : null;

  if (!force && (current === null ? expected !== null && expected !== undefined : expected !== hash(current))) {
    throw new AdminError(409, 'Les slides ont été modifiées en dehors de l’admin depuis leur ouverture.', { conflict: true });
  }

  if (markdown === null) {
    if (current !== null) await unlink(slidesFile);
    return { id, exists: false, hash: null };
  }
  if (typeof markdown !== 'string') throw new AdminError(400, 'Texte des slides manquant.');
  // Un fichier texte se termine par un saut de ligne, comme ceux écrits à la main.
  const text = markdown.endsWith('\n') ? markdown : `${markdown}\n`;
  if (text !== current) await writeFile(slidesFile, text, 'utf8');
  return { id, exists: true, hash: hash(text) };
}

/**
 * Le deck d'une leçon, rendu en HTML par Marp.
 *
 * `data` est l'en-tête tel qu'il est dans le formulaire - titre,
 * couverture et points-clés non enregistrés compris. `slides` est le
 * texte du deck, ou null pour une leçon qui s'en tient à ses
 * points-clés. `knownCss` est l'empreinte du CSS que l'interface a déjà :
 * le thème embarque ses polices et pèse lourd, inutile de le renvoyer
 * à chaque frappe.
 *
 * @param {{ id: unknown, data: unknown, slides: unknown, knownCss?: unknown }} input
 */
export async function previewSlides({ id: rawId, data, slides, knownCss }) {
  const { id, file } = lessonPath(rawId);
  if (!data || typeof data !== 'object') throw new AdminError(400, 'En-tête manquant.');
  if (slides !== null && typeof slides !== 'string') throw new AdminError(400, 'Texte des slides manquant.');

  const rels = (await readdir(LESSONS_DIR, { recursive: true }))
    .map((entry) => String(entry).split(sep).join('/'))
    .filter((entry) => entry.endsWith('.mdx') && !isLocked(normalizeId(entry)));

  const { lead, content } = lessonParts({
    rel: `${id}.mdx`,
    file,
    data: /** @type {Record<string, any>} */ (data),
    covers: moduleCovers(LESSONS_DIR, rels),
    band: defaultBand(ROOT),
    stage: imageUrl,
    slides,
  });

  const markdown = marpHeader(/** @type {any} */ (data).title) + lead + content + endSlide();
  const theme = await themeCss();
  // `script: false` : Marp ajoute sinon au HTML un script pour les
  // navigateurs, que l'aperçu - sans droit d'exécuter quoi que ce soit -
  // bloquerait de toute façon.
  const marp = new Marp({ inlineSVG: true, script: false });
  marp.themeSet.add(theme);
  const { html, css } = marp.render(markdown);
  const cssHash = hash(css);

  return {
    html,
    css: cssHash === knownCss ? null : css,
    cssHash,
    count: (html.match(/<svg data-marpit-svg/g) ?? []).length,
  };
}

/**
 * Une image citée par un deck, désignée par une adresse de l'API. Le
 * chemin doit rester dans le projet et désigner une image : l'aperçu ne
 * doit pas devenir un moyen de lire n'importe quel fichier.
 *
 * @param {string} absPath
 */
function imageUrl(absPath) {
  const rel = relative(ROOT, absPath);
  if (rel.startsWith('..') || !(extname(absPath).toLowerCase() in IMAGE_TYPES) || !existsSync(absPath)) return null;
  return `/admin/api/slides/image?path=${encodeURIComponent(rel.split(sep).join('/'))}`;
}

/** @param {unknown} raw */
export async function readSlideImage(raw) {
  const file = resolve(ROOT, String(raw ?? ''));
  const type = IMAGE_TYPES[extname(file).toLowerCase()];
  if (!file.startsWith(ROOT + sep) || !type || file.includes(`${sep}node_modules${sep}`)) {
    throw new AdminError(400, `Image invalide : « ${raw} ».`);
  }
  try {
    return { content: await readFile(file), type };
  } catch {
    throw new AdminError(404, `Image introuvable : « ${raw} ».`);
  }
}

/** @type {{ stamp: number, css: string } | null} */
let themeCache = null;

/**
 * Le thème Marp, compilé depuis ses sources. Il n'est recompilé que si
 * un fichier de src/styles/ a changé depuis la dernière fois : c'est là
 * qu'écrivent aussi `npm run brand` (couleurs, polices) et l'auteur qui
 * retouche une mise en page.
 */
async function themeCss() {
  const stamp = await latestChange(STYLES_DIR);
  if (themeCache?.stamp === stamp) return themeCache.css;
  try {
    const { css } = sass.compile(THEME, { loadPaths: [resolve(ROOT, 'node_modules')], style: 'expanded' });
    themeCache = { stamp, css };
    return css;
  } catch (error) {
    throw new AdminError(500, `Le thème des slides ne compile pas : ${error.message}`);
  }
}

/** @param {string} dir */
async function latestChange(dir) {
  const entries = await readdir(dir, { recursive: true });
  const stamps = await Promise.all(entries.map(async (entry) => (await stat(join(dir, String(entry)))).mtimeMs));
  return Math.max(0, ...stamps);
}

/** @param {string} text */
function hash(text) {
  return createHash('sha1').update(text).digest('hex');
}
