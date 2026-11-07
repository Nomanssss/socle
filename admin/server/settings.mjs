// =============================================================
// settings.mjs - écrire dans socle.config.json
//
// Le fichier de réglages est aussi un fichier qu'on lit : ses clés
// « _… » expliquent chaque section, et sa mise en forme (une liste
// sur une ligne, des lignes vides entre les sections) est celle d'un
// humain. JSON.stringify sur l'objet entier la jetterait.
//
// Deux façons d'écrire, selon l'ampleur du changement :
//
//   - replaceTopLevel() ne remplace que la VALEUR d'une clé, dans le
//     texte (le verrou d'une leçon). Le reste est recopié à l'octet près ;
//   - printConfig() réécrit le fichier entier, dans SON style : clés
//     « _… » à leur place, une ligne vide avant chaque section, listes
//     de textes sur une ligne, liens en objets d'une ligne. Relu puis
//     réécrit sans changement, le fichier ressort identique - c'est ce
//     que vérifie le test, et ce qui garde les diffs lisibles.
// =============================================================

import { resolve, join, basename } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { normalizeId } from '../../scripts/config.mjs';
import { AdminError, lessonPath } from './lessons.mjs';
import { mediaPath } from './media.mjs';
import { store, CONFIG } from './store.mjs';

// Le fichier sur le disque : c'est lui que le serveur de dev surveille
// (integration.mjs). Lire et écrire passent par le stockage.
export const CONFIG_FILE = resolve(process.cwd(), CONFIG);

/** Le texte de socle.config.json, tel que le stockage le donne. */
async function configText() {
  const text = await store().read(CONFIG);
  if (text === null) throw new AdminError(500, 'socle.config.json est introuvable.');
  return text;
}

/**
 * Réécrit la valeur d'UNE clé de premier niveau, sur une ligne.
 *
 * La clé est cherchée au premier niveau seulement : « "locked": » dans
 * le texte d'une clé « _… » ne doit pas être pris pour elle. D'où le
 * motif ancré en début de ligne, avec l'indentation de deux espaces du
 * fichier.
 *
 * @param {string} text
 * @param {string} key
 * @param {unknown} value Une valeur JSON courte (liste de textes…).
 */
export function replaceTopLevel(text, key, value) {
  const printed = JSON.stringify(value).replace(/","/g, '", "');
  const pattern = new RegExp(`^(  "${key}"\\s*:\\s*)(\\[[^\\]]*\\]|"(?:[^"\\\\]|\\\\.)*"|[^,\\n}]+)`, 'm');

  let next;
  if (pattern.test(text)) {
    next = text.replace(pattern, (_, start) => `${start}${printed}`);
  } else {
    // Clé absente : ajoutée en dernière position, après une ligne vide,
    // comme les autres sections du fichier.
    const end = text.lastIndexOf('}');
    if (end === -1) throw new AdminError(500, 'socle.config.json est mal formé.');
    const before = text.slice(0, end).replace(/\s*$/, '');
    next = `${before},\n\n  "${key}": ${printed}\n${text.slice(end)}`;
  }

  // Le garde-fou : même objet qu'avant, à cette clé près.
  let before;
  let after;
  try {
    before = JSON.parse(text);
    after = JSON.parse(next);
  } catch {
    throw new AdminError(500, 'socle.config.json n’a pas pu être réécrit sans l’abîmer : il est resté tel quel.');
  }
  const { [key]: _old, ...restBefore } = before;
  const { [key]: newValue, ...restAfter } = after;
  if (!isDeepStrictEqual(restBefore, restAfter) || !isDeepStrictEqual(newValue, value)) {
    throw new AdminError(500, 'socle.config.json n’a pas pu être réécrit sans l’abîmer : il est resté tel quel.');
  }
  return next;
}

/**
 * Verrouille ou déverrouille une leçon : l'ajoute à « locked », ou l'en
 * retire. Les autres entrées gardent leur ordre et leur écriture.
 *
 * Une leçon verrouillée n'a plus de page (404), plus de slides, et reste
 * annoncée au sommaire du site, grisée. Le serveur de dev le voit tout de
 * suite : config.mjs relit le fichier à chaque appel.
 *
 * @param {{ id: unknown, locked: unknown }} input
 */
export async function setLocked({ id: rawId, locked }) {
  if (typeof locked !== 'boolean') throw new AdminError(400, 'État de verrou manquant.');
  const { id, path } = lessonPath(rawId);
  // On ne verrouille que ce qui existe : une entrée sans leçon ne
  // verrouille rien, et le build s'en plaindrait.
  if ((await store().read(path)) === null) throw new AdminError(404, `Aucune leçon « ${id} ».`);

  const text = await configText();
  const config = JSON.parse(text);
  const current = Array.isArray(config.locked) ? config.locked.map(String) : [];
  const has = current.some((entry) => normalizeId(entry) === id);

  if (has === locked) return { id, locked };

  const next = locked ? [...current, id] : current.filter((entry) => normalizeId(entry) !== id);
  await store().commit(
    [{ path: CONFIG, content: replaceTopLevel(text, 'locked', next) }],
    `Admin : « ${id} » ${locked ? 'verrouillée' : 'rouverte'}`
  );
  return { id, locked };
}

// =============================================================
// La page « Réglages »
// =============================================================

const ROOT = process.cwd();
const PHOTOS = 'public/photos';

/**
 * Une valeur, écrite comme dans socle.config.json. Les objets s'étalent
 * sur plusieurs lignes - sauf dans une liste, où chacun tient sur la
 * sienne (les liens de l'auteur) ; une liste de textes tient sur une ligne
 * (« locked »).
 *
 * @param {unknown} value
 * @param {string} indent
 * @param {boolean} [inline]
 * @returns {string}
 */
function printValue(value, indent, inline = false) {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every((item) => item === null || typeof item !== 'object')) {
      return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
    }
    const inner = `${indent}  `;
    return `[\n${value.map((item) => `${inner}${printValue(item, inner, true)}`).join(',\n')}\n${indent}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    if (inline) {
      return `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${printValue(v, indent, true)}`).join(', ')} }`;
    }
    const inner = `${indent}  `;
    return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${printValue(v, inner)}`).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}

/**
 * Le fichier entier, dans son style. Au premier niveau, une ligne vide
 * sépare les sections : avant chaque clé, sauf si la précédente est une
 * explication « _… » - l'explication et ce qu'elle explique restent
 * collés. Seule exception, « _lisez-moi » : elle présente le fichier
 * entier, pas la section qui la suit.
 *
 * @param {Record<string, unknown>} config
 */
export function printConfig(config) {
  const lines = [];
  let previous = null;
  for (const [key, value] of Object.entries(config)) {
    const attached = previous === null || (previous.startsWith('_') && previous !== '_lisez-moi');
    const separator = attached ? '' : '\n';
    lines.push(`${separator}  ${JSON.stringify(key)}: ${printValue(value, '  ')}`);
    previous = key;
  }
  return `{\n${lines.join(',\n')}\n}\n`;
}

/** @param {string} text */
const fingerprint = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/**
 * Les réglages, tels que la page les montre : la configuration, et
 * l'empreinte du fichier - pour ne pas écraser une modification faite
 * entre-temps dans un éditeur de code.
 */
export async function readSettings() {
  const text = await configText();
  return { config: JSON.parse(text), hash: fingerprint(text) };
}

// Les seuls champs que la page modifie, par section. Tout le reste -
// les explications « _… », « locked » (le cadenas du sommaire),
// « slides », une clé ajoutée à la main - est recopié tel quel.
const EDITABLE = {
  site: ['title', 'tagline', 'lang', 'url'],
  legal: ['editor', 'address', 'email', 'publisher', 'host'],
  author: ['name', 'bio', 'photo', 'photoAlt'],
  colors: ['primary', 'text', 'page'],
  fonts: ['heading', 'body'],
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** @param {unknown} value */
function isWebUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(String(value)).protocol);
  } catch {
    return false;
  }
}

/**
 * Fusionne les champs reçus dans la configuration lue sur le disque, et
 * rend la liste des erreurs. Rien n'est écrit ici.
 *
 * @param {Record<string, any>} current
 * @param {Record<string, any>} incoming
 */
export function mergeSettings(current, incoming) {
  const next = structuredClone(current);
  const errors = [];
  const text = (/** @type {unknown} */ v) => (typeof v === 'string' ? v.trim() : '');

  const section = (/** @type {Record<string, any>} */ target, /** @type {Record<string, any>} */ source, /** @type {string[]} */ keys) => {
    for (const key of keys) {
      if (source && key in source) target[key] = text(source[key]);
    }
  };

  next.site ??= {};
  section(next.site, incoming.site, EDITABLE.site);
  next.site.legal ??= {};
  section(next.site.legal, incoming.site?.legal, EDITABLE.legal);
  next.author ??= {};
  section(next.author, incoming.author, EDITABLE.author);
  next.colors ??= {};
  section(next.colors, incoming.colors, EDITABLE.colors);
  next.fonts ??= {};
  section(next.fonts, incoming.fonts, EDITABLE.fonts);

  if (Array.isArray(incoming.author?.links)) {
    next.author.links = incoming.author.links
      .map((/** @type {any} */ link) => ({ label: text(link?.label), url: text(link?.url) }))
      .filter((/** @type {any} */ link) => link.label || link.url);
    if (next.author.links.some((/** @type {any} */ l) => !l.label || !isWebUrl(l.url))) {
      errors.push('Chaque lien de l’auteur demande un libellé et une adresse en http:// ou https://.');
    }
  }

  if (!next.site.title) errors.push('Le nom du cours est obligatoire.');
  if (next.site.url && !isWebUrl(next.site.url)) {
    errors.push('L’adresse publique doit commencer par http:// ou https:// - ou rester vide.');
  }
  if (next.site.lang && !/^[a-z]{2,3}(-[A-Za-z]{2})?$/.test(next.site.lang)) {
    errors.push('La langue s’écrit « fr » ou « fr-FR ».');
  }
  if (next.site.legal.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.site.legal.email)) {
    errors.push('Le contact des mentions légales n’est pas une adresse e-mail.');
  }
  for (const key of EDITABLE.colors) {
    if (!HEX.test(next.colors[key] ?? '')) errors.push(`La couleur « ${key} » doit s’écrire en hexadécimal (#4647AE).`);
  }
  for (const key of EDITABLE.fonts) {
    if (!next.fonts[key]) errors.push(`La police « ${key} » est obligatoire.`);
  }
  if (next.author.photo && !/^\/[\w./-]+$/.test(next.author.photo)) {
    errors.push('La photo est un chemin dans public/, comme « /photos/auteur.jpg ».');
  }
  return { next, errors };
}

/**
 * Relance `npm run brand` (scripts/apply-brand.mjs) : couleurs et polices
 * ne servent qu'à travers les fichiers qu'il génère. Il vérifie aussi les
 * contrastes et l'existence des polices - un refus de sa part est rendu tel
 * quel à l'auteur.
 *
 * @returns {Promise<{ ok: boolean, log: string }>}
 */
function runBrand() {
  return new Promise((done) => {
    execFile(
      process.execPath,
      [join(ROOT, 'scripts/apply-brand.mjs')],
      { cwd: ROOT, timeout: 120_000 },
      (error, stdout, stderr) => done({ ok: !error, log: `${stdout}${stderr}`.trim() })
    );
  });
}

/**
 * Enregistre les réglages.
 *
 * Si couleurs ou polices ont changé, la charte est régénérée dans la foulée.
 * Qu'elle échoue (contraste insuffisant, police inconnue, pas de réseau pour
 * la télécharger), et le fichier est remis dans son état d'avant : une
 * configuration que `npm run brand` refuse ne doit pas rester en place, à
 * casser le prochain `npm run dev`.
 *
 * @param {{ config: unknown, hash: unknown, force?: unknown }} input
 */
export async function writeSettings({ config: incoming, hash, force }) {
  if (!incoming || typeof incoming !== 'object') throw new AdminError(400, 'Réglages manquants.');

  const text = await configText();
  if (!force && hash !== fingerprint(text)) {
    throw new AdminError(409, 'socle.config.json a changé depuis son ouverture (dans un éditeur, ou par le cadenas d’une leçon).', {
      conflict: 'settings',
    });
  }

  const current = JSON.parse(text);
  const { next, errors } = mergeSettings(current, /** @type {Record<string, any>} */ (incoming));
  if (errors.length) throw new AdminError(422, errors.join(' '), { errors });

  if (isDeepStrictEqual(current, next)) return { hash: fingerprint(text), brand: null };

  const printed = printConfig(next);
  await store().commit([{ path: CONFIG, content: printed }], 'Admin : réglages du cours');

  const brandChanged =
    !isDeepStrictEqual(current.colors, next.colors) || !isDeepStrictEqual(current.fonts, next.fonts);
  if (!brandChanged) return { hash: fingerprint(printed), brand: null };

  // `npm run brand` écrit des fichiers sur le disque : il ne tourne qu'en
  // local. En ligne, c'est la construction du site qui le relance
  // (prebuild), à partir de la configuration enregistrée.
  if (store().kind !== 'local') return { hash: fingerprint(printed), brand: null };

  const brand = await runBrand();
  if (!brand.ok) {
    await store().commit([{ path: CONFIG, content: text }], 'Admin : réglages remis en l’état');
    throw new AdminError(422, 'La charte n’a pas pu être appliquée : rien n’a été enregistré.', { brand });
  }
  return { hash: fingerprint(printed), brand };
}

/**
 * La photo de l'auteur, choisie dans la médiathèque. Le site la sert
 * telle quelle depuis public/ (pas d'optimisation Astro pour un chemin de
 * configuration) : on l'y copie, dans public/photos/, et on rend le chemin
 * à écrire dans « author.photo ».
 *
 * @param {{ path: unknown }} input
 */
export async function pickPhoto({ path }) {
  const { file, path: source } = mediaPath(path);
  const content = await store().readBytes(source);
  if (content === null) throw new AdminError(404, 'Image introuvable dans la médiathèque.');
  const name = basename(file);
  await store().commit([{ path: `${PHOTOS}/${name}`, content }], `Admin : photo de l’auteur « ${name} »`);
  return { photo: `/photos/${name}` };
}
