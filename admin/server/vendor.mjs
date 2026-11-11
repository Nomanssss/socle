// =============================================================
// vendor.mjs - CodeMirror, empaqueté pour le navigateur
//
// L'interface de l'admin est du JavaScript natif, servi tel quel.
// CodeMirror, lui, est publié en paquets npm qui s'importent par leur
// nom : un navigateur ne sait pas les trouver. esbuild (déjà là, c'est
// le moteur de Vite) les assemble en un module unique, une fois, à la
// première demande - environ un dixième de seconde - puis le garde en
// mémoire jusqu'à l'arrêt du serveur.
//
// En local, rien n'est écrit sur le disque. En ligne, le module est
// empaqueté d'avance pendant la construction (PREBUILT, ci-dessous).
// =============================================================

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const VENDOR = join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'vendor');
const ENTRY = join(VENDOR, 'codemirror.entry.js');

/**
 * Le module empaqueté d'avance pour l'admin en ligne (scripts/admin-vendor.mjs,
 * lancé par `npm run vercel-build`). Présent, il est servi tel quel : la
 * fonction Vercel n'a pas à faire tourner esbuild.
 */
export const PREBUILT = join(VENDOR, 'codemirror.js');

/** @type {Promise<string> | null} */
let bundle = null;

/**
 * Le module CodeMirror, empaqueté et minifié.
 *
 * @param {{ prebuilt?: boolean, fresh?: boolean }} [options]
 *   `prebuilt` : servir le module empaqueté d'avance s'il existe (l'admin
 *   en ligne). En local, on réempaquette toujours : un module d'avance
 *   resté sur le disque après un `vercel-build` serait peut-être périmé.
 *   `fresh` : ne rien garder en cache (c'est le script qui le fabrique).
 */
export function codemirrorBundle({ prebuilt = false, fresh = false } = {}) {
  if (fresh) return pack();
  bundle ??= (prebuilt ? readFile(PREBUILT, 'utf8').catch(() => pack()) : pack()).catch((error) => {
    // Un échec ne doit pas rester en cache : la prochaine demande réessaie.
    bundle = null;
    throw error;
  });
  return bundle;
}

/** @returns {Promise<string>} */
function pack() {
  // esbuild n'est chargé qu'ici : en ligne, avec le module d'avance, il
  // n'est jamais importé.
  return import('esbuild').then(({ build }) => build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'esm',
    minify: true,
    write: false,
    target: 'es2022',
    legalComments: 'none',
  })).then((result) => result.outputFiles[0].text);
}
