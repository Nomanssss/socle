// =============================================================
// settings.mjs - écrire dans socle.config.json
//
// Le fichier de réglages est aussi un fichier qu'on lit : ses clés
// « _… » expliquent chaque section, et sa mise en forme (une liste
// sur une ligne, des lignes vides entre les sections) est celle d'un
// humain. JSON.stringify sur l'objet entier la jetterait.
//
// On ne remplace donc que la VALEUR de la clé visée, dans le texte,
// et on vérifie le résultat : il doit se relire en JSON, et ne
// différer de l'original que par cette clé. Le reste du fichier est
// recopié à l'octet près - comme l'en-tête d'une leçon.
// =============================================================

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { normalizeId } from '../../scripts/config.mjs';
import { AdminError, lessonPath } from './lessons.mjs';

export const CONFIG_FILE = resolve(process.cwd(), 'socle.config.json');

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
  const { id, file } = lessonPath(rawId);
  // On ne verrouille que ce qui existe : une entrée sans leçon ne
  // verrouille rien, et le build s'en plaindrait.
  if (!existsSync(file)) throw new AdminError(404, `Aucune leçon « ${id} ».`);

  const text = await readFile(CONFIG_FILE, 'utf8');
  const config = JSON.parse(text);
  const current = Array.isArray(config.locked) ? config.locked.map(String) : [];
  const has = current.some((entry) => normalizeId(entry) === id);

  if (has === locked) return { id, locked };

  const next = locked ? [...current, id] : current.filter((entry) => normalizeId(entry) !== id);
  await writeFile(CONFIG_FILE, replaceTopLevel(text, 'locked', next));
  return { id, locked };
}
