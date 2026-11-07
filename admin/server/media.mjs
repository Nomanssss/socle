// =============================================================
// media.mjs - la médiathèque : les images de src/assets/
//
// Les images d'un cours vivent dans src/assets/ et non dans public/ :
// c'est l'import qui permet à Astro de les redimensionner et de les
// convertir (voir la leçon « Images, vidéo, audio et code »). La
// médiathèque n'est donc qu'une vue sur ce dossier - aucun index à
// tenir à jour, aucun fichier en plus.
//
// Une image envoyée n'écrase jamais une image existante : un nom déjà
// pris reçoit un suffixe. Et une image n'est supprimée que si rien ne
// la cite, ni leçon, ni deck de slides, ni config.
// =============================================================

import { readFile, writeFile, readdir, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, relative, extname, basename, sep } from 'node:path';
import { AdminError, LESSONS_DIR } from './lessons.mjs';

export const ASSETS_DIR = resolve(process.cwd(), 'src/assets');
const CONFIG = resolve(process.cwd(), 'socle.config.json');

export const MAX_UPLOAD = 20 * 1024 * 1024;

// Les formats qu'Astro sait importer et optimiser, et ce qu'ils
// annoncent au navigateur.
const TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

/**
 * Ramène un chemin reçu (« schemas/cycle.png ») à un fichier image de
 * src/assets/, ou le refuse.
 *
 * @param {unknown} raw
 */
export function mediaPath(raw) {
  const rel = String(raw ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  const file = resolve(ASSETS_DIR, rel);
  if (!rel || !file.startsWith(ASSETS_DIR + sep) || !(extname(file).toLowerCase() in TYPES)) {
    throw new AdminError(400, `Image invalide : « ${raw} ».`);
  }
  return { rel: relative(ASSETS_DIR, file).split(sep).join('/'), file };
}

/** Toutes les images, les plus récentes d'abord, avec leurs utilisations. */
export async function listMedia() {
  if (!existsSync(ASSETS_DIR)) return [];
  const texts = await citingTexts();
  const entries = (await readdir(ASSETS_DIR, { recursive: true }))
    .map((entry) => String(entry).split(sep).join('/'))
    .filter((entry) => extname(entry).toLowerCase() in TYPES);

  const media = await Promise.all(
    entries.map(async (rel) => {
      const info = await stat(join(ASSETS_DIR, rel));
      return { path: rel, name: basename(rel), size: info.size, modified: info.mtimeMs, usages: usagesOf(rel, texts) };
    })
  );
  return media.sort((a, b) => b.modified - a.modified);
}

/** @param {unknown} raw */
export async function readMedia(raw) {
  const { file } = mediaPath(raw);
  try {
    return { content: await readFile(file), type: TYPES[extname(file).toLowerCase()] };
  } catch {
    throw new AdminError(404, `Image introuvable : « ${raw} ».`);
  }
}

/**
 * @param {unknown} rawName Le nom du fichier envoyé, tel que l'auteur l'a nommé.
 * @param {Buffer} content
 */
export async function uploadMedia(rawName, content) {
  const ext = extname(String(rawName ?? '')).toLowerCase();
  if (!(ext in TYPES)) {
    throw new AdminError(415, `Format non pris en charge : ${ext || 'inconnu'}. Formats acceptés : ${Object.keys(TYPES).join(', ')}.`);
  }
  if (!content.length) throw new AdminError(400, 'Fichier vide.');
  if (!looksLike(ext, content)) {
    throw new AdminError(415, `Ce fichier ne contient pas une image ${ext} valide.`);
  }

  const name = uniqueName(cleanName(basename(String(rawName), extname(String(rawName)))), ext === '.jpeg' ? '.jpg' : ext);
  await writeFile(join(ASSETS_DIR, name), content, { flag: 'wx' });
  return (await listMedia()).find((m) => m.path === name);
}

/** @param {unknown} raw */
export async function deleteMedia(raw) {
  const { rel, file } = mediaPath(raw);
  const usages = usagesOf(rel, await citingTexts());
  if (usages.length) {
    throw new AdminError(409, `« ${rel} » est encore utilisée (${usages.map((u) => u.label).join(', ')}).`, { usages });
  }
  await unlink(file);
  return { deleted: rel };
}

/**
 * Un nom de fichier lisible ET sûr dans une URL ou un import : sans
 * accent, sans espace, en minuscules. « Schéma n°2 (v3).PNG » devient
 * « schema-n-2-v3.png ».
 *
 * @param {string} base
 */
export function cleanName(base) {
  const clean = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return clean || 'image';
}

/**
 * @param {string} base
 * @param {string} ext
 */
function uniqueName(base, ext) {
  let name = `${base}${ext}`;
  for (let n = 2; existsSync(join(ASSETS_DIR, name)); n++) name = `${base}-${n}${ext}`;
  return name;
}

/**
 * L'extension promet un format ; les premiers octets disent si c'est
 * vrai. Un .jpg qui n'en est pas un ferait échouer le build d'Astro,
 * loin de l'envoi qui l'a causé.
 *
 * @param {string} ext
 * @param {Buffer} b
 */
function looksLike(ext, b) {
  const ascii = (/** @type {number} */ start, /** @type {number} */ end) => b.subarray(start, end).toString('latin1');
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return b[0] === 0xff && b[1] === 0xd8;
    case '.png':
      return ascii(1, 4) === 'PNG';
    case '.gif':
      return ascii(0, 4) === 'GIF8';
    case '.webp':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    case '.avif':
      return ascii(4, 8) === 'ftyp' && /avi[fs]/.test(ascii(8, 12));
    case '.svg':
      return /<svg[\s>]/i.test(b.subarray(0, 4096).toString('utf8'));
  }
  return false;
}

/**
 * Les textes qui peuvent citer une image : chaque leçon, chaque deck
 * écrit à la main, et la config du site.
 *
 * @returns {Promise<{ label: string, kind: string, id: string | null, text: string }[]>}
 */
async function citingTexts() {
  const files = (await readdir(LESSONS_DIR, { recursive: true }))
    .map((entry) => String(entry).split(sep).join('/'))
    .filter((entry) => entry.endsWith('.mdx') || entry.endsWith('.slides.md'));

  const texts = await Promise.all(
    files.map(async (entry) => {
      const text = await readFile(join(LESSONS_DIR, entry), 'utf8');
      const slides = entry.endsWith('.slides.md');
      const id = entry.replace(/\.slides\.md$|\.mdx$/, '');
      const title = text.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? id;
      return { kind: slides ? 'slides' : 'lesson', id, label: slides ? `slides de « ${title} »` : `« ${title} »`, text };
    })
  );
  // Le titre d'un deck est celui de sa leçon, que le deck ne contient pas.
  for (const deck of texts.filter((t) => t.kind === 'slides')) {
    const lesson = texts.find((t) => t.kind === 'lesson' && t.id === deck.id);
    if (lesson) deck.label = `slides de ${lesson.label}`;
  }
  if (existsSync(CONFIG)) texts.push({ kind: 'config', id: null, label: 'socle.config.json', text: await readFile(CONFIG, 'utf8') });
  return texts;
}

/**
 * Une image est citée quand « assets/<son chemin> » apparaît dans un
 * texte : c'est vrai d'un import (« @assets/x.jpg »), d'une couverture
 * (« ../../../assets/x.jpg ») comme d'un deck (« src/assets/x.jpg »).
 *
 * @param {string} rel
 * @param {{ label: string, kind: string, id: string | null, text: string }[]} texts
 */
function usagesOf(rel, texts) {
  const needle = new RegExp(`assets/${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w.-])`);
  return texts.filter((t) => needle.test(t.text)).map(({ kind, id, label }) => ({ kind, id, label }));
}
