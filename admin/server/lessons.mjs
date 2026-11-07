// =============================================================
// lessons.mjs - lire et écrire les leçons sur le disque
//
// Une leçon, pour l'admin, c'est trois choses : son en-tête (les
// données du frontmatter), son texte (tout ce qui suit), et l'empreinte
// du fichier au moment de sa lecture. L'empreinte sert à ne pas écraser
// une modification faite entre-temps dans un éditeur de code : si le
// fichier a changé depuis que l'admin l'a lu, l'enregistrement est
// refusé, et c'est à l'auteur de choisir.
//
// Le parti pris central est de ne réécrire QUE ce qui a changé. Un
// en-tête dont les valeurs n'ont pas bougé est recopié à l'octet près ;
// le texte est écrit tel que l'admin l'a reçu. Un passage par l'admin
// ne doit pas produire un diff que personne n'a demandé.
// =============================================================

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, relative, sep } from 'node:path';
import matter from 'gray-matter';
import { isLocked, normalizeId } from '../../scripts/config.mjs';

export const LESSONS_DIR = resolve(process.cwd(), 'src/content/lecons');

// L'en-tête d'un fichier : deux lignes de trois tirets, et ce qu'il y a
// entre. Le texte commence juste après le saut de ligne qui ferme.
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

// L'ordre des champs pour une clé qui n'existait pas encore dans le
// fichier : celui des leçons du cours de démonstration.
const FIELD_ORDER = [
  'title',
  'module',
  'moduleOrder',
  'order',
  'description',
  'cover',
  'coverAlt',
  'slidePoints',
  'sources',
];

/** Une erreur destinée à l'interface : un statut HTTP et un message lisible. */
export class AdminError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Ramène un identifiant reçu (« module-1/lecon-1 ») à un fichier de
 * src/content/lecons/, ou le refuse. On ne fait aucune confiance à ce
 * qui arrive : pas de « .. », pas de chemin absolu, et le fichier
 * résolu doit rester DANS le dossier des leçons.
 *
 * @param {unknown} raw
 */
export function lessonPath(raw) {
  const id = normalizeId(String(raw ?? ''));
  if (!/^[\w-]+(\/[\w-]+)*$/.test(id)) {
    throw new AdminError(400, `Identifiant de leçon invalide : « ${raw} ».`);
  }
  const file = resolve(LESSONS_DIR, `${id}.mdx`);
  if (!file.startsWith(LESSONS_DIR + sep)) {
    throw new AdminError(400, `Identifiant de leçon invalide : « ${raw} ».`);
  }
  return { id, file };
}

/** Toutes les leçons, triées comme sur l'accueil : modules, puis ordre. */
export async function listLessons() {
  const entries = await readdir(LESSONS_DIR, { recursive: true });
  const files = entries.filter((entry) => entry.endsWith('.mdx'));

  const lessons = await Promise.all(
    files.map(async (entry) => {
      const id = normalizeId(relative(LESSONS_DIR, join(LESSONS_DIR, entry)));
      const { data } = matter(await readFile(join(LESSONS_DIR, entry), 'utf8'), {});
      return {
        id,
        title: String(data.title ?? id),
        module: String(data.module ?? 'Sans module'),
        moduleOrder: typeof data.moduleOrder === 'number' ? data.moduleOrder : null,
        order: typeof data.order === 'number' ? data.order : null,
        locked: isLocked(id),
      };
    })
  );

  // Même règle que l'accueil : moduleOrder d'abord, à défaut le nom du
  // module, puis l'ordre de la leçon dans son module.
  return lessons.sort(
    (a, b) =>
      (a.moduleOrder ?? Infinity) - (b.moduleOrder ?? Infinity) ||
      a.module.localeCompare(b.module, 'fr') ||
      (a.order ?? Infinity) - (b.order ?? Infinity) ||
      a.id.localeCompare(b.id)
  );
}

/** @param {unknown} rawId */
export async function readLesson(rawId) {
  const { id, file } = lessonPath(rawId);
  const source = await readSource(file, id);
  const { frontmatter, body } = split(source);
  return {
    id,
    data: parseFrontmatter(frontmatter, id),
    body,
    hash: hash(source),
    locked: isLocked(id),
  };
}

/**
 * @param {{ id: unknown, data: unknown, body: unknown, hash?: unknown, force?: unknown }} input
 */
export async function writeLesson({ id: rawId, data, body, hash: expected, force }) {
  const { id, file } = lessonPath(rawId);
  const source = await readSource(file, id);

  if (!force && expected !== hash(source)) {
    throw new AdminError(409, 'Ce fichier a été modifié en dehors de l’admin depuis son ouverture.', {
      conflict: true,
    });
  }

  const clean = validate(data);
  const current = split(source);
  const before = parseFrontmatter(current.frontmatter, id);

  const frontmatterChanged = !sameValue(before, clean);
  const frontmatter = frontmatterChanged ? printFrontmatter(clean, Object.keys(before)) : current.frontmatter;
  const text = typeof body === 'string' ? body : current.body;

  const next = `---\n${frontmatter}\n---\n${text}`;
  if (next !== source) await writeFile(file, next, 'utf8');

  return {
    id,
    hash: hash(next),
    changed: { frontmatter: frontmatterChanged, body: text !== current.body },
  };
}

/**
 * Règle un MODULE : son nom et sa position dans le cours.
 *
 * Ces deux valeurs vivent dans l'en-tête de chacune de ses leçons
 * (« module » et « moduleOrder ») : les modifier leçon par leçon, c'est
 * risquer qu'une faute de frappe coupe le module en deux sur l'accueil.
 * On les réécrit donc toutes d'un coup, et rien d'autre dans l'en-tête.
 *
 * La position est un rang, de 1 au nombre de modules : le module visé y
 * est placé, et TOUS les modules sont renumérotés de 1 à N. Deux modules
 * ne partagent ainsi jamais le même « moduleOrder ».
 *
 * Un nom qui suit la convention du cours, « Module 3 - Les présentations »,
 * porte lui aussi le rang : il suit la renumérotation, sans quoi le module
 * passé en tête s'annoncerait « Module 3 » sur ses slides. Un nom libre
 * (« Annexes ») n'est jamais touché.
 *
 * Toutes les leçons concernées sont lues et vérifiées avant la première
 * écriture. Le dossier du module ne change pas : seul l'affichage suit.
 *
 * @param {{ from: unknown, name: unknown, position: unknown }} input
 */
export async function updateModule({ from, name, position }) {
  const current = String(from ?? '');
  const label = typeof name === 'string' ? name.trim() : '';
  if (!label) throw new AdminError(422, 'Le nom du module est obligatoire.');

  const lessons = await listLessons();
  // L'ordre des modules tel que l'accueil le montre : celui de listLessons.
  const order = [...new Set(lessons.map((lesson) => lesson.module))];
  if (!order.includes(current)) throw new AdminError(404, `Aucun module « ${current} ».`);
  if (label !== current && order.includes(label)) {
    throw new AdminError(422, `Un module s’appelle déjà « ${label} » : le renommer ainsi fusionnerait les deux.`);
  }

  const rank = Number(position);
  if (!Number.isInteger(rank) || rank < 1 || rank > order.length) {
    throw new AdminError(422, `La position doit aller de 1 à ${order.length}.`);
  }

  const moved = order.filter((module) => module !== current);
  moved.splice(rank - 1, 0, current);

  // Le nom de chaque module une fois renuméroté : le libellé choisi pour
  // celui qu'on règle, puis le numéro de convention mis à son nouveau rang.
  const NUMBERED = /^(module\s+)\d+(\s*[-–—:·]\s*)/i;
  /** @type {Map<string, string>} */
  const names = new Map(
    moved.map((module, i) => {
      const base = module === current ? label : module;
      return [module, base.replace(NUMBERED, (_, word, sep) => `${word}${i + 1}${sep}`)];
    })
  );
  const renamed = /** @type {string} */ (names.get(current));
  if ([...names].some(([module, next]) => module !== current && next === renamed)) {
    throw new AdminError(422, `Un module s’appellerait aussi « ${renamed} » : le renommer ainsi fusionnerait les deux.`);
  }

  // Ce que chaque leçon doit devenir, calculé pour toutes avant d'écrire.
  const plans = [];
  for (const lesson of lessons) {
    const { file } = lessonPath(lesson.id);
    const source = await readSource(file, lesson.id);
    const parts = split(source);
    const before = parseFrontmatter(parts.frontmatter, lesson.id);
    const after = {
      ...before,
      module: names.get(lesson.module),
      moduleOrder: moved.indexOf(lesson.module) + 1,
    };
    if (sameValue(before, after)) continue;
    const frontmatter = printFrontmatter(after, Object.keys(before));
    plans.push({ id: lesson.id, file, text: `---\n${frontmatter}\n---\n${parts.body}` });
  }

  for (const plan of plans) await writeFile(plan.file, plan.text, 'utf8');
  return { module: renamed, position: rank, changed: plans.map((plan) => plan.id) };
}

/**
 * @param {string} file
 * @param {string} id
 */
async function readSource(file, id) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
      throw new AdminError(404, `La leçon « ${id} » n’existe pas.`);
    }
    throw error;
  }
}

/** @param {string} source */
export function split(source) {
  const match = source.match(FRONTMATTER);
  if (!match) return { frontmatter: '', body: source };
  return { frontmatter: match[1], body: source.slice(match[0].length) };
}

/**
 * @param {string} frontmatter
 * @param {string} id
 */
function parseFrontmatter(frontmatter, id) {
  try {
    // Les options passées à gray-matter ne servent qu'à une chose : sans
    // elles, il met son résultat en cache, et rend le MÊME objet à deux
    // lectures d'un même texte - de quoi se marcher dessus.
    return matter(`---\n${frontmatter}\n---\n`, {}).data;
  } catch (error) {
    throw new AdminError(422, `L’en-tête de « ${id} » est mal formé : ${error.message}`);
  }
}

/**
 * Les mêmes exigences que src/content.config.ts, vérifiées AVANT
 * d'écrire : un en-tête invalide casserait le serveur de dev à la
 * prochaine lecture de la collection, loin de la cause.
 *
 * @param {unknown} data
 */
function validate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new AdminError(400, 'En-tête manquant.');
  }
  /** @type {Record<string, unknown>} */
  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    clean[key] = value;
  }

  const errors = [];
  if (typeof clean.title !== 'string' || !clean.title.trim()) errors.push('Le titre est obligatoire.');
  if (typeof clean.module !== 'string' || !clean.module.trim()) errors.push('Le module est obligatoire.');
  if (typeof clean.order !== 'number' || !Number.isFinite(clean.order)) errors.push('L’ordre est obligatoire.');
  if ('moduleOrder' in clean && (typeof clean.moduleOrder !== 'number' || !Number.isFinite(clean.moduleOrder))) {
    errors.push('L’ordre du module doit être un nombre.');
  }
  if ('slidePoints' in clean && !isStringArray(clean.slidePoints)) {
    errors.push('Les points-clés doivent être une liste de textes.');
  }
  if ('sources' in clean) {
    const sources = Array.isArray(clean.sources) ? clean.sources : null;
    if (!sources || !sources.every((s) => s && typeof s.title === 'string' && s.title.trim())) {
      errors.push('Chaque source doit avoir un titre.');
    } else if (!sources.every((s) => s.author === undefined || typeof s.author === 'string')) {
      errors.push('L’auteur d’une source doit être un texte.');
    } else if (!sources.every((s) => s.url === undefined || isWebUrl(s.url))) {
      // Le schéma de la collection (z.url()) refuserait l'adresse au build :
      // mieux vaut le dire ici, au moment d'enregistrer.
      errors.push('L’adresse d’une source doit commencer par http:// ou https://.');
    }
  }

  if (errors.length) throw new AdminError(422, errors.join(' '), { errors });
  return clean;
}

/** Une adresse web complète, telle que la collection l'accepte. */
function isWebUrl(/** @type {unknown} */ value) {
  if (typeof value !== 'string') return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * Écrit l'en-tête dans le style des leçons existantes : textes entre
 * guillemets doubles, nombres nus, une liste par ligne. Les clés déjà
 * présentes gardent leur place ; les nouvelles suivent FIELD_ORDER.
 *
 * Les chaînes passent par JSON.stringify : une chaîne JSON est aussi
 * une chaîne YAML entre guillemets doubles valide, échappements compris.
 *
 * @param {Record<string, unknown>} data
 * @param {string[]} previousKeys
 */
export function printFrontmatter(data, previousKeys = []) {
  const keys = previousKeys.filter((key) => key in data);
  // Un champ nouveau se glisse après le dernier champ qui le précède
  // dans FIELD_ORDER : une couverture ajoutée suit la description, elle
  // ne finit pas en bas de l'en-tête.
  for (const key of FIELD_ORDER) {
    if (!(key in data) || keys.includes(key)) continue;
    const rank = FIELD_ORDER.indexOf(key);
    const after = keys.findLastIndex((other) => FIELD_ORDER.includes(other) && FIELD_ORDER.indexOf(other) < rank);
    keys.splice(after + 1, 0, key);
  }
  keys.push(...Object.keys(data).filter((key) => !keys.includes(key)));

  const lines = [];
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) {
      if (!value.length) continue;
      lines.push(`${key}:`);
      for (const item of value) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          Object.entries(item)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .forEach(([k, v], i) => lines.push(`${i === 0 ? '  - ' : '    '}${k}: ${scalar(v)}`));
        } else {
          lines.push(`  - ${scalar(item)}`);
        }
      }
    } else {
      lines.push(`${key}: ${scalar(value, key)}`);
    }
  }
  return lines.join('\n');
}

/**
 * @param {unknown} value
 * @param {string} [key]
 */
function scalar(value, key) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // La couverture est un chemin relatif, écrit sans guillemets dans les
  // leçons existantes : on garde cette forme quand elle est sûre.
  if (key === 'cover' && typeof value === 'string' && /^[\w./-]+$/.test(value)) return value;
  if (typeof value === 'string') return JSON.stringify(value);
  // Au-delà de ce que le schéma connaît : JSON est du YAML valide.
  return JSON.stringify(value);
}

/** @param {unknown} value */
function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function sameValue(a, b) {
  if (a === b) return true;
  if (a instanceof Date || b instanceof Date) return String(a) === String(b);
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => sameValue(a[k], b[k]));
}

/** @param {string} text */
function hash(text) {
  return createHash('sha1').update(text).digest('hex');
}
