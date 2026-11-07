// =============================================================
// store.mjs - où l'admin lit et écrit les fichiers du cours
//
// L'admin ne touche jamais le disque directement : elle passe par un
// « stockage », qui sait faire quatre choses sur les fichiers du
// projet, désignés par leur chemin depuis la racine
// (« src/content/lecons/module-1/lecon-1.mdx ») :
//
//   read(path)        le texte d'un fichier, ou null s'il n'existe pas
//   readBytes(path)   son contenu brut (une image), ou null
//   list(dir)         les fichiers d'un dossier, sous-dossiers compris
//   commit(changes)   écrire, créer ou supprimer plusieurs fichiers
//                     d'un coup : TOUS, ou AUCUN
//
// En local (`npm run dev`), c'est le disque : LocalStore. En ligne,
// ce sera une branche GitHub, où un commit est par nature tout-ou-rien.
// Les modules de l'admin (leçons, médiathèque, slides, réglages) ne
// savent pas lequel ils utilisent - c'est ce qui permet à l'admin en
// ligne d'être la même que l'admin locale.
// =============================================================

import { readFile, writeFile, readdir, stat, rename, unlink, mkdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

/** Le dossier des leçons, depuis la racine du projet. */
export const LESSONS = 'src/content/lecons';
/** Le dossier de la médiathèque. */
export const ASSETS = 'src/assets';
/** Le fichier de réglages. */
export const CONFIG = 'socle.config.json';

/**
 * @typedef {{ path: string, content: string | Buffer | null }} Change
 *   `content: null` supprime le fichier.
 *
 * @typedef {{ path: string, size: number, modified: number }} Entry
 *
 * @typedef {{
 *   kind: 'local' | 'github',
 *   read(path: string): Promise<string | null>,
 *   readBytes(path: string): Promise<Buffer | null>,
 *   list(dir: string): Promise<Entry[]>,
 *   commit(changes: Change[], message: string): Promise<void>,
 * }} Store
 */

/** Un chemin relatif sûr : pas de « .. », pas de racine, des « / ». */
function clean(/** @type {string} */ path) {
  const posix = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!posix || posix.split('/').some((part) => part === '..' || part === '')) {
    throw new Error(`Chemin refusé : « ${path} ».`);
  }
  return posix;
}

/**
 * Le disque. La racine est relue à chaque appel (process.cwd()) : les
 * tests changent de dossier pour travailler sur un cours jetable.
 *
 * @returns {Store}
 */
export function localStore() {
  const root = () => process.cwd();
  const abs = (/** @type {string} */ path) => {
    const file = resolve(root(), clean(path));
    if (!file.startsWith(root() + sep)) throw new Error(`Chemin refusé : « ${path} ».`);
    return file;
  };
  const missing = (/** @type {any} */ error) => error?.code === 'ENOENT' || error?.code === 'ENOTDIR';

  return {
    kind: 'local',

    async read(path) {
      try {
        return await readFile(abs(path), 'utf8');
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },

    async readBytes(path) {
      try {
        return await readFile(abs(path));
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },

    async list(dir) {
      const base = abs(dir);
      let entries;
      try {
        entries = await readdir(base, { recursive: true, withFileTypes: true });
      } catch (error) {
        if (missing(error)) return [];
        throw error;
      }
      const files = entries.filter((entry) => entry.isFile());
      return Promise.all(
        files.map(async (entry) => {
          const file = join(entry.parentPath ?? entry.path, entry.name);
          const info = await stat(file);
          return {
            path: file.slice(root().length + 1).split(sep).join('/'),
            size: info.size,
            modified: info.mtimeMs,
          };
        })
      );
    },

    /**
     * Plusieurs fichiers comme une seule opération : toutes, ou aucune.
     *
     * 1. chaque nouveau contenu est d'abord écrit À CÔTÉ de son fichier,
     *    dans un temporaire - un échec ici n'a encore rien touché ;
     * 2. puis chaque temporaire remplace son fichier (un renommage, que
     *    le système fait d'un bloc), et les suppressions suivent ;
     * 3. si une étape échoue, les fichiers déjà remplacés ou supprimés
     *    retrouvent leur contenu d'origine, gardé en mémoire.
     *
     * Sans cela, un module renommé à moitié - une interruption au milieu
     * de la boucle - se couperait en deux sur l'accueil.
     */
    async commit(changes) {
      const plans = await Promise.all(
        changes.map(async (change) => {
          const file = abs(change.path);
          let before = null;
          try {
            before = await readFile(file);
          } catch (error) {
            if (!missing(error)) throw error;
          }
          return { file, content: change.content, before, temp: `${file}.admin-${process.pid}.tmp` };
        })
      );

      const writes = plans.filter((plan) => plan.content !== null);
      try {
        for (const plan of writes) {
          await mkdir(dirname(plan.file), { recursive: true });
          await writeFile(plan.temp, /** @type {string | Buffer} */ (plan.content));
        }
      } catch (error) {
        await Promise.all(writes.map((plan) => unlink(plan.temp).catch(() => {})));
        throw error;
      }

      const done = [];
      try {
        for (const plan of plans) {
          if (plan.content === null) {
            if (plan.before !== null) await unlink(plan.file);
          } else {
            await rename(plan.temp, plan.file);
          }
          done.push(plan);
        }
      } catch (error) {
        for (const plan of done) {
          if (plan.before === null) await unlink(plan.file).catch(() => {});
          else await writeFile(plan.file, plan.before).catch(() => {});
        }
        await Promise.all(writes.map((plan) => unlink(plan.temp).catch(() => {})));
        throw error;
      }
    },
  };
}

/** @type {Store} */
let current = localStore();

/** Le stockage en service. */
export function store() {
  return current;
}

/**
 * Change de stockage : l'admin en ligne y branche GitHub au démarrage de
 * la fonction, les tests un faux stockage.
 *
 * @param {Store} next
 */
export function useStore(next) {
  current = next;
}

/**
 * Les réglages du cours, lus DANS le stockage - et non sur le disque du
 * serveur : en ligne, la vérité est sur la branche de brouillon, pas
 * dans les fichiers déployés avec la fonction.
 *
 * @returns {Promise<Record<string, any>>}
 */
export async function readConfig() {
  const text = await store().read(CONFIG);
  if (text === null) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`socle.config.json est mal formé (${/** @type {Error} */ (error).message}).`);
  }
}
