// =============================================================
// stage-images.mjs — met les images à portée des decks
//
// Un deck Marp est rendu de deux façons qui ne résolvent pas les
// chemins pareil : le PDF (relatif au dossier slides/) et le serveur
// d'aperçu (relatif à une URL). Un chemin absolu sur le disque
// fonctionne pour le premier et pas pour le second.
//
// La parade : copier chaque image référencée dans slides/assets/ et
// réécrire le markdown avec un chemin RELATIF au deck, qui marche
// dans les deux cas.
//
// Partagé par build-slides.mjs (les vraies leçons) et
// preview-slides.mjs (le deck de démonstration), pour que les deux
// se comportent exactement pareil.
// =============================================================

import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Copie une image dans <outDir>/assets/ et renvoie son chemin relatif au deck.
 * Le nom reçoit une empreinte du chemin source : deux leçons peuvent avoir
 * chacune leur « couverture.jpg » sans que l'une écrase l'autre.
 */
export function stageImage(absPath, outDir) {
  if (!existsSync(absPath)) {
    console.warn(`  ⚠ image introuvable, ignorée : ${absPath}`);
    return null;
  }
  const hash = createHash('sha1').update(absPath).digest('hex').slice(0, 8);
  const name = `${hash}-${basename(absPath)}`;
  mkdirSync(join(outDir, 'assets'), { recursive: true });
  copyFileSync(absPath, join(outDir, 'assets', name));
  return `assets/${name}`;
}

const rewrite = (baseDir, outDir) => (match, pre, src, post) => {
  const s = src.trim().replace(/^['"]|['"]$/g, '');
  if (/^(https?:|data:|\/)/.test(s)) return match;
  const staged = stageImage(resolve(baseDir, s), outDir);
  return staged ? pre + staged + post : match;
};

/**
 * Réécrit toutes les images d'un markdown. Les URL et data: sont laissées.
 *
 * Deux formes sont couvertes : la syntaxe markdown `![](x.png)`, et les
 * directives de fond `<!-- _backgroundImage: url('x.png') -->` - qu'un auteur
 * écrit à la main pour les mises en page à panneau d'image.
 */
export const stageImages = (markdown, baseDir, outDir) =>
  markdown
    .replace(/(!\[[^\]]*\]\()([^)]+)(\))/g, rewrite(baseDir, outDir))
    .replace(/(_backgroundImage:\s*url\()([^)]+)(\))/g, rewrite(baseDir, outDir));
