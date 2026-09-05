// =============================================================
// preview-slides.mjs — prévisualisation en direct du thème Marp
//
// Lance deux surveillances en parallèle :
//   1. sass --watch : recompile slides/theme.css à chaque
//      enregistrement dans src/styles/ ;
//   2. marp -s : sert le dossier slides/ sur http://localhost:8080
//      et recharge le navigateur à chaque changement.
//
// Le deck de démonstration (slides.demo.md) est copié dans slides/
// pour apparaître dans la liste : il montre toutes les mises en page
// sur une seule série, ce qui évite de modifier un modèle à l'aveugle.
//
// Ctrl+C arrête les deux processus.
// =============================================================

import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync, watch, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageImages } from './stage-images.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'slides');
const THEME_SRC = join(ROOT, 'src/styles/marp/theme.scss');
const THEME_OUT = join(OUT, 'theme.css');
const DEMO = join(ROOT, 'slides.demo.md');
const bin = (name) => join(ROOT, 'node_modules/.bin', name);

mkdirSync(OUT, { recursive: true });

// La marque d'abord : c'est elle qui écrit settings/_brand.scss et les
// partiels de fontes dont la compilation du thème a besoin.
execFileSync('node', [join(ROOT, 'scripts/apply-brand.mjs')], { cwd: ROOT, stdio: 'inherit' });

// Première compilation, en bloquant : marp doit trouver le thème au démarrage.
execFileSync(bin('sass'), [
  `${THEME_SRC}:${THEME_OUT}`,
  '--load-path=node_modules',
  '--style=expanded',
  '--no-source-map',
], { cwd: ROOT, stdio: 'inherit' });

/**
 * Le deck de démonstration passe par la même mise en scène des images que les
 * vraies leçons : il peut donc écrire `![](src/assets/x.png)`, un chemin
 * relatif à la racine du projet, comme n'importe quel .slides.md.
 */
const stageDemo = () => {
  if (!existsSync(DEMO)) return;
  writeFileSync(join(OUT, '00-modeles.md'), stageImages(readFileSync(DEMO, 'utf8'), ROOT, OUT));
};
stageDemo();

console.log(`
  Aperçu du thème  →  http://localhost:8080
  « 00-modeles »   →  toutes les mises en page sur une seule série

  Éditez src/styles/marp/ : le thème se recompile et la page se recharge.
  Ctrl+C pour arrêter.
`);

const children = [
  spawn(bin('sass'), [
    '--watch',
    `${THEME_SRC}:${THEME_OUT}`,
    '--load-path=node_modules',
    '--style=expanded',
    '--no-source-map',
  ], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] }),

  spawn(bin('marp'), [
    '--server', OUT,
    '--theme', THEME_OUT,
    '--allow-local-files',
  ], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] }),
];

/**
 * Le deck de démonstration est une COPIE dans slides/ : sans cette
 * surveillance, l'éditer pendant que l'aperçu tourne ne changerait rien à
 * l'écran, et on chercherait longtemps pourquoi.
**/
if (existsSync(DEMO)) {
  watch(DEMO, stageDemo);
}

/**
 * `sass --watch` ne voit que les fichiers .scss. Or les couleurs et les
 * polices viennent de socle.config.json, qui doit d'abord être traduit en
 * settings/_brand.scss par apply-brand. On surveille donc la config à part.
**/
let pending = null;
watch(join(ROOT, 'socle.config.json'), () => {
  clearTimeout(pending);
  pending = setTimeout(() => {
    console.log('\n  socle.config.json a changé, application…\n');
    try {
      execFileSync('node', [join(ROOT, 'scripts/apply-brand.mjs')], { cwd: ROOT, stdio: 'inherit' });
    } catch {
      // apply-brand a déjà expliqué ce qui n'allait pas : on laisse tourner.
    }
  }, 150);
});

const stop = () => {
  for (const child of children) child.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', stop);
