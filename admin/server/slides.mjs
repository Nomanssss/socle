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

import { readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, relative, extname, dirname, sep } from 'node:path';
import matter from 'gray-matter';
import * as sass from 'sass';
import { Marp } from '@marp-team/marp-core';
import { AdminError, lessonPath, lockedIds } from './lessons.mjs';
import { store, readConfig, LESSONS } from './store.mjs';
import { lessonHead, endSlide, lessonParts, moduleDirOf } from '../../scripts/slides-deck.mjs';
import { normalizeId } from '../../scripts/config.mjs';

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

/** Le deck écrit à la main d'une leçon : « lecon-2.mdx » → « lecon-2.slides.md ». */
const slidesPathOf = (/** @type {string} */ id) => `${LESSONS}/${id}.slides.md`;

/** @param {unknown} rawId */
export async function readSlides(rawId) {
  const { id } = lessonPath(rawId);
  const markdown = await store().read(slidesPathOf(id));
  if (markdown === null) return { id, exists: false, markdown: '', hash: null };
  return { id, exists: true, markdown, hash: hash(markdown) };
}

/**
 * Écrit le deck d'une leçon, ou le supprime (`markdown: null`) : la
 * leçon revient alors à ses points-clés.
 *
 * @param {{ id: unknown, markdown: unknown, hash?: unknown, force?: unknown }} input
 */
export async function writeSlides({ id: rawId, markdown, hash: expected, force }) {
  const { id, path } = lessonPath(rawId);
  if ((await store().read(path)) === null) throw new AdminError(404, `La leçon « ${id} » n’existe pas.`);
  const slidesPath = slidesPathOf(id);
  const current = await store().read(slidesPath);

  if (!force && (current === null ? expected !== null && expected !== undefined : expected !== hash(current))) {
    throw new AdminError(409, 'Les slides ont été modifiées en dehors de l’admin depuis leur ouverture.', { conflict: true });
  }

  if (markdown === null) {
    if (current !== null) await store().commit([{ path: slidesPath, content: null }], `Admin : slides de « ${id} » retirées`);
    return { id, exists: false, hash: null };
  }
  if (typeof markdown !== 'string') throw new AdminError(400, 'Texte des slides manquant.');
  // Un fichier texte se termine par un saut de ligne, comme ceux écrits à la main.
  const text = markdown.endsWith('\n') ? markdown : `${markdown}\n`;
  if (text !== current) await store().commit([{ path: slidesPath, content: text }], `Admin : slides de « ${id} »`);
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

  const { lead, content } = lessonParts({
    rel: `${id}.mdx`,
    file,
    data: /** @type {Record<string, any>} */ (data),
    covers: await moduleCovers(),
    band: await defaultBand(),
    stage: imageUrl,
    slides,
  });

  const markdown = lessonHead(/** @type {Record<string, any>} */ (data), id) + lead + content + endSlide();
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
 * La couverture de chaque module : celle de sa PREMIÈRE leçon ouverte qui
 * en déclare une (même règle que build-slides, voir slides-deck.mjs), lue
 * dans le stockage.
 *
 * @returns {Promise<Map<string, { order: number, path: string }>>}
 */
async function moduleCovers() {
  const locked = await lockedIds();
  const files = (await store().list(LESSONS)).filter((entry) => entry.path.endsWith('.mdx'));
  /** @type {Map<string, { order: number, path: string }>} */
  const covers = new Map();
  for (const entry of files) {
    const rel = entry.path.slice(LESSONS.length + 1);
    if (locked.has(normalizeId(rel))) continue;
    const dir = moduleDirOf(rel);
    if (!dir) continue;
    const { data } = matter((await store().read(entry.path)) ?? '', {});
    if (!data.cover) continue;
    const order = Number.isFinite(Number(data.order)) ? Number(data.order) : Infinity;
    const known = covers.get(dir);
    if (!known || order < known.order) {
      covers.set(dir, { order, path: resolve(ROOT, dirname(entry.path), String(data.cover)) });
    }
  }
  return covers;
}

/** Le bandeau des leçons sans couverture (« slides.band »), lu dans le stockage. */
async function defaultBand() {
  const band = (await readConfig())?.slides?.band;
  return band ? resolve(ROOT, String(band)) : null;
}

/**
 * Une image citée par un deck, désignée par une adresse de l'API. Le
 * chemin doit rester dans le projet et désigner une image : l'aperçu ne
 * doit pas devenir un moyen de lire n'importe quel fichier. Une image
 * absente est signalée à sa lecture (404), dans l'aperçu.
 *
 * @param {string} absPath
 */
function imageUrl(absPath) {
  const rel = relative(ROOT, absPath);
  if (rel.startsWith('..') || !(extname(absPath).toLowerCase() in IMAGE_TYPES)) return null;
  return `/admin/api/slides/image?path=${encodeURIComponent(rel.split(sep).join('/'))}`;
}

/** @param {unknown} raw */
export async function readSlideImage(raw) {
  const file = resolve(ROOT, String(raw ?? ''));
  const type = IMAGE_TYPES[extname(file).toLowerCase()];
  if (!file.startsWith(ROOT + sep) || !type || file.includes(`${sep}node_modules${sep}`)) {
    throw new AdminError(400, `Image invalide : « ${raw} ».`);
  }
  const content = await store().readBytes(relative(ROOT, file).split(sep).join('/'));
  if (content === null) throw new AdminError(404, `Image introuvable : « ${raw} ».`);
  return { content, type };
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
