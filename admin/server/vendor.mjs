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
// Rien n'est écrit sur le disque : l'empaquetage n'existe que pendant
// `npm run dev`, et n'a aucune chance de finir dans dist/.
// =============================================================

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ENTRY = join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'vendor', 'codemirror.entry.js');

/** @type {Promise<string> | null} */
let bundle = null;

/** Le module CodeMirror, empaqueté et minifié. */
export function codemirrorBundle() {
  bundle ??= build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'esm',
    minify: true,
    write: false,
    target: 'es2022',
    legalComments: 'none',
  })
    .then((result) => result.outputFiles[0].text)
    .catch((error) => {
      // Un échec ne doit pas rester en cache : la prochaine demande réessaie.
      bundle = null;
      throw error;
    });
  return bundle;
}
