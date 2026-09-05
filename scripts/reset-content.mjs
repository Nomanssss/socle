// =============================================================
// reset-content.mjs - vide le cours de démonstration
//
// Socle est livré avec un cours complet : il sert de vitrine (tous
// les composants pédagogiques y passent) et de documentation par
// l'exemple. Quand on démarre son VRAI cours, il faut l'enlever -
// à la main, c'est une douzaine de fichiers et un verrou oublié
// dans socle.config.json qui fait râler le build.
//
// Ce script :
//   1. supprime tout src/content/lecons/ (leçons .mdx et decks .slides.md) ;
//   2. y écrit une leçon vierge, valide au regard du schéma Zod ;
//   3. remet « locked » à [] dans socle.config.json - sinon il désigne
//      une leçon qui n'existe plus, et chaque build le signale ;
//   4. efface slides/, qui contient encore les decks de la démo.
//
// Ce qu'il NE touche PAS : l'identité du site et la charte
// (socle.config.json reste à vous), les composants, les styles, et
// src/assets/couverture.jpg - le banc d'essai du thème
// (slides.demo.md) s'en sert, il ne fait pas partie du cours.
//
// Usage :
//   npm run reset          → demande confirmation
//   npm run reset -- --yes → sans confirmation (CI, script d'amorçage)
// =============================================================

import { readdirSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LESSONS = join(ROOT, 'src/content/lecons');
const SLIDES = join(ROOT, 'slides');
const CONFIG = join(ROOT, 'socle.config.json');

const YES = process.argv.includes('--yes') || process.argv.includes('-y');

const ok = (m) => console.log(`  ✓ ${m}`);
const info = (m) => console.log(`  · ${m}`);
const fail = (m) => {
  console.error(`\n✗ ${m}\n`);
  process.exit(1);
};

// -------------------------------------------------------------
// 1. Inventaire - on annonce avant de détruire
// -------------------------------------------------------------

/** Tous les fichiers sous `dir`, en chemins relatifs à la racine du projet. */
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [relative(ROOT, path)];
  });
}

const doomed = walk(LESSONS);
const decks = existsSync(SLIDES) ? walk(SLIDES).length : 0;

if (doomed.length === 0) {
  info('src/content/lecons/ est déjà vide - rien à supprimer.');
} else {
  console.log(`\nÀ supprimer (${doomed.length} fichier${doomed.length > 1 ? 's' : ''}) :`);
  for (const file of doomed) console.log(`  − ${file}`);
  if (decks > 0) console.log(`  − slides/ (${decks} fichier${decks > 1 ? 's' : ''} généré${decks > 1 ? 's' : ''})`);
  console.log('\nÀ leur place : src/content/lecons/module-1/lecon-1.mdx, vierge.');
}

// -------------------------------------------------------------
// 2. Confirmation
// -------------------------------------------------------------
if (doomed.length > 0 && !YES) {
  const rl = createInterface({ input: stdin, output: stdout });
  // Pas de « [O/n] » : sur une suppression, le défaut doit être « non ».
  // On exige le mot entier, pour qu'un Entrée distrait n'efface rien.
  const answer = await rl.question('\nTapez « oui » pour confirmer : ');
  rl.close();
  if (answer.trim().toLowerCase() !== 'oui') fail('Annulé. Rien n’a été supprimé.');
}

console.log('');

// -------------------------------------------------------------
// 3. Table rase
// -------------------------------------------------------------
if (existsSync(LESSONS)) {
  for (const entry of readdirSync(LESSONS)) rmSync(join(LESSONS, entry), { recursive: true, force: true });
  ok('src/content/lecons/ vidé');
}

if (existsSync(SLIDES)) {
  rmSync(SLIDES, { recursive: true, force: true });
  ok('slides/ effacé (regénéré par npm run slides)');
}

// -------------------------------------------------------------
// 4. Une leçon vierge, qui doit passer le schéma Zod du premier coup
// -------------------------------------------------------------
const SKELETON = `---
title: "Ma première leçon"
module: "Module 1"
moduleOrder: 1
order: 1
description: "Un résumé d'une ligne, affiché sur la page d'accueil."
# Image de bandeau, optionnelle - chemin relatif à CE fichier :
# cover: ../../../assets/ma-couverture.jpg
# coverAlt: "Ce que montre l'image (vide si purement décorative)."
# Points-clés, optionnels : ils suffisent à produire un jeu de slides.
# slidePoints:
#   - "Le premier point à retenir"
#   - "Le deuxième"
---

Écrivez votre leçon ici, en markdown.

## Un titre de section

Les composants pédagogiques (quiz, flashcards, frise, glisser-déposer,
vidéo, podcast, CodePen) s'importent en haut du fichier :

\`\`\`mdx
import Quiz from '@components/Quiz.astro';
\`\`\`

Le README les documente tous, avec leurs paramètres.
`;

mkdirSync(join(LESSONS, 'module-1'), { recursive: true });
writeFileSync(join(LESSONS, 'module-1/lecon-1.mdx'), SKELETON, 'utf8');
ok('src/content/lecons/module-1/lecon-1.mdx créé');

// -------------------------------------------------------------
// 5. Le verrou de démonstration
//
// On réécrit la seule ligne « locked », pas le fichier entier : un
// JSON.stringify effacerait les lignes vides et les clés « _lisez-moi »
// qui font de socle.config.json un document lisible.
// -------------------------------------------------------------
if (existsSync(CONFIG)) {
  const before = readFileSync(CONFIG, 'utf8');
  const after = before.replace(/("locked"\s*:\s*)\[[^\]]*\]/, '$1[]');
  if (after !== before) {
    writeFileSync(CONFIG, after, 'utf8');
    ok('socle.config.json → « locked » remis à []');
  } else {
    info('socle.config.json → « locked » était déjà vide');
  }
}

console.log(`
Le template est prêt pour votre cours.

  1. socle.config.json  → titre, accroche, mentions légales, couleurs, polices
  2. npm run brand      → applique la charte (couleurs + polices)
  3. npm run dev        → http://localhost:4321
`);
