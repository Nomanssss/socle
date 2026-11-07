// =============================================================
// deck-assets.mjs - les images d'un deck HTML, à recopier avec lui
//
// Contrairement aux polices (embarquées en base64 par marp/_fonts.scss),
// Marp laisse les images du contenu en chemin RELATIF - « assets/x.png ».
// Un .html déplacé sans ce dossier perd donc ses images.
//
// Deux scripts déplacent des decks HTML : build-slides (vers public/,
// pour que le site les serve) et bundle-dist (vers le paquet livré).
// Ils partagent cette copie : deux versions finiraient par diverger.
// =============================================================

import { readFileSync, copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * On scanne du HTML rendu, où la PROSE peut ressembler à un chemin : une
 * phrase finissant par « … dans slides/assets/. » a suffi à faire capturer
 * « . » comme nom de fichier, et à tenter de copier le dossier lui-même.
 * D'où deux exigences : une extension de fichier dans le motif, et une
 * vérification que la cible est bien un fichier avant de la copier.
 */
const ASSET_REF = /assets\/([A-Za-z0-9][A-Za-z0-9._-]*\.[A-Za-z0-9]{2,5})(?![A-Za-z0-9])/g;

/**
 * Copie, dans `<targetDir>/assets/`, les images citées par les HTML donnés.
 *
 * On ne copie que les fichiers réellement cités : le banc d'essai du thème
 * (00-modeles) a ses propres images, qui n'ont rien à faire à côté des decks
 * du cours.
 *
 * Un dossier d'images PAR dossier de decks : Marp écrit « assets/x.png »
 * relativement au fichier HTML, or lecons/ et modules/ sont deux niveaux
 * distincts. Un seul dossier partagé casserait les deux.
 *
 * @param {string[]} htmlFiles  chemins absolus des HTML à scanner
 * @param {string} sourceDir    le dossier d'où viennent les images (slides/assets)
 * @param {string} targetDir    le dossier des HTML copiés
 * @returns {{ copied: number, missing: string[] }}
 */
export function copyDeckAssets(htmlFiles, sourceDir, targetDir) {
  const referenced = new Set();
  for (const file of htmlFiles) {
    for (const m of readFileSync(file, 'utf8').matchAll(ASSET_REF)) referenced.add(m[1]);
  }

  const missing = [];
  let copied = 0;
  if (referenced.size === 0) return { copied, missing };

  mkdirSync(join(targetDir, 'assets'), { recursive: true });
  for (const name of referenced) {
    const src = join(sourceDir, name);
    if (!existsSync(src) || !statSync(src).isFile()) {
      missing.push(name);
      continue;
    }
    copyFileSync(src, join(targetDir, 'assets', name));
    copied += 1;
  }
  return { copied, missing };
}
