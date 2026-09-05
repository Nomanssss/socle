// =============================================================
// bundle-dist.mjs — assemble le paquet livrable dans dist/
//
// Astro construit le site dans dist/, mais vide le dossier à chaque
// build : ce script passe donc APRÈS, et y ajoute les présentations.
//
//   dist/
//     index.html, lecons/…        ← le site (Astro)
//     _astro/, fonts/             ← ses assets
//     slides/
//       index.html                ← sommaire des présentations
//       lecons/
//         module-1-lecon-1.html   ← deck projetable (double-clic)
//         module-1-lecon-1.pdf    ← même deck, imprimable
//         assets/                 ← images des decks HTML
//       modules/
//         module-1.html           ← tout le module, projetable
//         module-1.pdf            ← même chose, le « PDF résumé » du site
//         assets/                 ← images du HTML de module (chemins relatifs)
//     LISEZ-MOI.txt               ← comment ouvrir le paquet
//
// Prérequis : dist/ construit (npm run build) et les decks générés
// aux deux formats (npm run slides:pdf && npm run slides:html).
//
// Usage : node scripts/bundle-dist.mjs
// =============================================================

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SLIDES_DIR = join(ROOT, 'slides');
const DIST = join(ROOT, 'dist');
const DIST_SLIDES = join(DIST, 'slides');
// Deux rangements distincts, parce que ce sont deux usages : les decks de
// leçon se projettent en cours, le PDF de module se donne à l'apprenant.
// À plat, les 25 fichiers du cours de démonstration se mélangeaient.
const DIST_LESSONS = join(DIST_SLIDES, 'lecons');
const DIST_MODULES = join(DIST_SLIDES, 'modules');
const MANIFEST = join(SLIDES_DIR, 'manifest.json');

const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.warn(`  ⚠ ${m}`);
const fail = (m) => {
  console.error(`\n✗ ${m}\n`);
  process.exit(1);
};

// -------------------------------------------------------------
// 1. Prérequis
// -------------------------------------------------------------
if (!existsSync(DIST)) fail('dist/ est absent. Lance d’abord : npm run build');
if (!existsSync(join(DIST, 'index.html'))) {
  fail('dist/index.html est absent : le site n’a pas été construit. Lance : npm run build');
}
if (!existsSync(MANIFEST)) {
  fail('slides/manifest.json est absent. Lance d’abord : npm run slides:pdf');
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
if (!Array.isArray(manifest) || manifest.length === 0) {
  fail('slides/manifest.json est vide : aucun deck à livrer.');
}

// -------------------------------------------------------------
// 2. Copie des decks
// -------------------------------------------------------------
// On repart d'un dossier propre : un deck supprimé d'un build à l'autre
// ne doit pas survivre dans le paquet livré.
rmSync(DIST_SLIDES, { recursive: true, force: true });
mkdirSync(DIST_LESSONS, { recursive: true });
mkdirSync(DIST_MODULES, { recursive: true });

console.log('\nPrésentations');

const decks = [];
let missing = 0;

for (const entry of manifest) {
  const formats = {};

  for (const ext of ['html', 'pdf']) {
    const src = join(SLIDES_DIR, `${entry.slug}.${ext}`);
    if (existsSync(src)) {
      copyFileSync(src, join(DIST_LESSONS, `${entry.slug}.${ext}`));
      formats[ext] = `lecons/${entry.slug}.${ext}`;
    }
  }

  if (!formats.html && !formats.pdf) {
    warn(`${entry.slug} : aucun fichier rendu, deck ignoré`);
    missing += 1;
    continue;
  }
  if (!formats.html) warn(`${entry.slug} : HTML manquant (npm run slides:html)`);
  if (!formats.pdf) warn(`${entry.slug} : PDF manquant (npm run slides:pdf)`);

  decks.push({ ...entry, formats });
}

if (decks.length === 0) fail('Aucun deck rendu trouvé dans slides/.');
ok(`${decks.length} deck(s) copié(s) dans dist/slides/${missing ? ` (${missing} ignoré(s))` : ''}`);

// -------------------------------------------------------------
// 2 bis. Les decks de module
//
// Un deck par dossier de leçons (« module-1.pdf ») : c'est le « PDF
// résumé » que la dernière leçon du module propose au téléchargement.
// Il n'a pas d'entrée au manifeste - celui-ci décrit les leçons, et le
// nom du fichier se déduit de leur identifiant : « module-1/lecon-2 »
// appartient à « module-1 ». Une liste de plus finirait par diverger.
// -------------------------------------------------------------
const moduleDecks = new Map(); // libellé du module → { slug, formats }

for (const entry of manifest) {
  const slug = String(entry.id).split('/')[0];
  const key = entry.module ?? 'Présentations';
  if (!slug || !String(entry.id).includes('/') || moduleDecks.has(key)) continue;

  const formats = {};
  for (const ext of ['html', 'pdf']) {
    const src = join(SLIDES_DIR, `${slug}.${ext}`);
    if (existsSync(src)) {
      copyFileSync(src, join(DIST_MODULES, `${slug}.${ext}`));
      formats[ext] = `modules/${slug}.${ext}`;
    }
  }
  if (!formats.html && !formats.pdf) continue;
  if (!formats.pdf) warn(`${slug} : PDF de module manquant (npm run slides)`);
  moduleDecks.set(key, { slug, formats });
}

if (moduleDecks.size > 0) {
  ok(`${moduleDecks.size} deck(s) de module copié(s) dans dist/slides/`);
} else {
  // Le bouton « Télécharger le PDF résumé » du site pointe dessus :
  // absents, les pages de fin de module n'afficheront rien.
  warn('aucun deck de module trouvé dans slides/ (npm run slides)');
}

// -------------------------------------------------------------
// 2 bis. Images des decks HTML
// -------------------------------------------------------------
// Contrairement aux polices (embarquées en base64 par marp/_fonts.scss),
// Marp laisse les images du contenu en chemin RELATIF - « assets/x.png ».
// Un .html livré sans ce dossier perd donc ses images. On ne copie que les
// fichiers réellement cités par les decks livrés : le banc d'essai du thème
// (00-modeles) a ses propres images, qui n'ont rien à faire dans le paquet.
//
// On scanne du HTML rendu, où la PROSE peut ressembler à un chemin : une
// phrase finissant par « … dans slides/assets/. » a suffi à faire capturer
// « . » comme nom de fichier, et à tenter de copier le dossier lui-même.
// D'où deux exigences : une extension de fichier dans le motif, et une
// vérification que la cible est bien un fichier avant de la copier.
const ASSET_REF = /assets\/([A-Za-z0-9][A-Za-z0-9._-]*\.[A-Za-z0-9]{2,5})(?![A-Za-z0-9])/g;

/**
 * Copie, à côté des HTML donnés, les images qu'ils citent.
 *
 * Un dossier d'images PAR dossier de decks : Marp écrit « assets/x.png »
 * relativement au fichier HTML, or lecons/ et modules/ sont deux niveaux
 * distincts. Un seul « slides/assets/ » partagé casserait les deux.
 */
function copyAssetsFor(htmlPaths, targetDir, label) {
  const referenced = new Set();
  for (const rel of htmlPaths) {
    const html = readFileSync(join(DIST_SLIDES, rel), 'utf8');
    for (const m of html.matchAll(ASSET_REF)) referenced.add(m[1]);
  }
  if (referenced.size === 0) return;

  mkdirSync(join(targetDir, 'assets'), { recursive: true });
  let copied = 0;
  for (const name of referenced) {
    const src = join(SLIDES_DIR, 'assets', name);
    if (!existsSync(src) || !statSync(src).isFile()) {
      warn(`image citée mais introuvable : slides/assets/${name}`);
      continue;
    }
    copyFileSync(src, join(targetDir, 'assets', name));
    copied += 1;
  }
  if (copied > 0) ok(`${copied} image(s) copiée(s) dans ${label}`);
}

copyAssetsFor(
  decks.filter((d) => d.formats.html).map((d) => d.formats.html),
  DIST_LESSONS,
  'dist/slides/lecons/assets/'
);
copyAssetsFor(
  [...moduleDecks.values()].filter((d) => d.formats.html).map((d) => d.formats.html),
  DIST_MODULES,
  'dist/slides/modules/assets/'
);



// -------------------------------------------------------------
// 3. Sommaire des présentations
// -------------------------------------------------------------
// La page reprend les couleurs et les polices de la marque, lues dans
// socle.config.json : le sommaire suit la charte comme le reste, sans
// dépendre du CSS du site (dont le nom de fichier est haché).
const brand = JSON.parse(readFileSync(join(ROOT, 'socle.config.json'), 'utf8'));
const { primary, text, page } = brand.colors;
const { heading, body } = brand.fonts;

// Mêmes calculs que settings/_colors.scss, pour que le sommaire ne
// dérive pas de la palette du site.
const mix = (a, b, ratio) => {
  const ch = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) => Math.round(ch(a, i) * ratio + ch(b, i) * (1 - ratio)));
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};
const softColor = mix(primary, page, 0.12);
const borderColor = mix(primary, page, 0.3);
const mutedColor = mix(text, page, 0.72);

const escape = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Regroupement par module, dans l'ordre du frontmatter.
const byModule = new Map();
for (const deck of decks) {
  const key = deck.module ?? 'Présentations';
  if (!byModule.has(key)) byModule.set(key, { order: deck.moduleOrder ?? 99, decks: [] });
  byModule.get(key).decks.push(deck);
}
const modules = [...byModule.entries()].sort((a, b) => a[1].order - b[1].order);
for (const [, group] of modules) group.decks.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

const rows = modules
  .map(
    ([name, group]) => `      <section class="module">
        <h2>${escape(name)}</h2>
${
  moduleDecks.has(name)
    ? `        <p class="module-pdf deck-links">Tout le module :${
        moduleDecks.get(name).formats.html
          ? ` <a href="${moduleDecks.get(name).formats.html}">Présenter (HTML)</a>`
          : ''
      }${
        moduleDecks.get(name).formats.pdf
          ? ` <a href="${moduleDecks.get(name).formats.pdf}">PDF</a>`
          : ''
      }</p>\n`
    : ''
}        <ul>
${group.decks
  .map(
    (deck) => `          <li>
            <span class="deck-title">${escape(deck.title)}</span>
            <span class="deck-links">
${deck.formats.html ? `              <a href="${deck.formats.html}">Présenter (HTML)</a>\n` : ''}${
      deck.formats.pdf ? `              <a href="${deck.formats.pdf}">PDF</a>\n` : ''
    }            </span>
          </li>`
  )
  .join('\n')}
        </ul>
      </section>`
  )
  .join('\n');

const fontFace = (family, file, style = 'normal') => `    @font-face {
      font-family: "${family}";
      src: url("../fonts/${file}") format("woff2");
      font-style: ${style};
      font-display: swap;
    }`;

// Les polices sont celles déjà présentes dans dist/fonts/ : on les
// déclare en chemin relatif, le sommaire reste donc autonome.
const fontFiles = existsSync(join(ROOT, 'fonts.lock.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'fonts.lock.json'), 'utf8')).faces
  : [];
const faces = fontFiles
  .filter((f) => f.subset === 'latin' && f.style === 'normal')
  .map((f) => fontFace(f.family, f.file, f.style))
  .join('\n');

const indexHtml = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Présentations — ${escape(manifest[0]?.module ? 'Socle' : 'Socle')}</title>
<style>
${faces}

  :root {
    --primary: ${primary};
    --text: ${text};
    --page: ${page};
    --soft: ${softColor};
    --border: ${borderColor};
    --muted: ${mutedColor};
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    padding: 3rem 1.5rem 5rem;
    font-family: "${body}", system-ui, -apple-system, sans-serif;
    font-size: 1rem;
    line-height: 1.7;
    color: var(--text);
    background: var(--page);
  }

  .wrap { max-width: 46rem; margin: 0 auto; }

  h1 {
    margin: 0 0 0.5rem;
    font-family: "${heading}", "Trebuchet MS", system-ui, sans-serif;
    font-size: 2.25rem;
    line-height: 1.2;
  }

  .lede { margin: 0 0 1rem; color: var(--muted); }

  .back {
    display: inline-block;
    margin-bottom: 2.5rem;
    color: var(--primary);
    font-weight: 600;
    text-decoration: none;
  }
  .back:hover { text-decoration: underline; }

  .module { margin-bottom: 2.5rem; }

  .module h2 {
    margin: 0 0 0.75rem;
    padding-bottom: 0.5rem;
    font-family: "${heading}", "Trebuchet MS", system-ui, sans-serif;
    font-size: 1.25rem;
    border-bottom: 1px solid var(--border);
  }

  ul { margin: 0; padding: 0; list-style: none; }

  li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: baseline;
    justify-content: space-between;
    padding: 0.85rem 1rem;
    margin-bottom: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
  }

  .deck-title { font-weight: 600; }
  .deck-links { display: flex; gap: 0.75rem; white-space: nowrap; }
  .module-pdf { margin: -0.5rem 0 1.25rem; align-items: baseline; gap: 0.5rem; }

  .deck-links a {
    padding: 0.15rem 0.6rem;
    font-size: 0.875rem;
    color: var(--primary);
    text-decoration: none;
    background: var(--soft);
    border-radius: 0.35rem;
  }
  .deck-links a:hover { color: var(--page); background: var(--primary); }

  .note {
    padding: 1rem 1.25rem;
    margin-top: 3rem;
    font-size: 0.875rem;
    color: var(--muted);
    background: var(--soft);
    border-radius: 0.5rem;
  }
  .note code { font-family: ui-monospace, Menlo, Consolas, monospace; }
</style>
</head>
<body>
  <div class="wrap">
    <a class="back" href="../">← Retour au cours</a>
    <h1>Présentations</h1>
    <p class="lede">Une présentation par leçon, en deux formats.</p>

${rows}

    <p class="note">
      Le format <strong>HTML</strong> se projette dans le navigateur : les flèches
      changent de slide, <code>F</code> passe en plein écran. Il fonctionne hors
      ligne, par simple double-clic, à condition de garder ce dossier entier —
      les polices sont embarquées dans le fichier, mais les images vivent dans
      <code>assets/</code>. Le <strong>PDF</strong> sert à imprimer ou à transmettre
      un deck seul.
    </p>
  </div>
</body>
</html>
`;

writeFileSync(join(DIST_SLIDES, 'index.html'), indexHtml);
ok('dist/slides/index.html (sommaire)');

// -------------------------------------------------------------
// 4. Mode d'emploi du paquet
// -------------------------------------------------------------
// Le site est construit en chemins absolus (/_astro/…) et charge ses
// scripts en modules ES : il lui faut un serveur HTTP. Les décks HTML,
// eux, sont autonomes. Autant l'écrire dans le paquet, sinon le
// destinataire ouvre index.html, voit une page nue et conclut au bug.
const readme = `Socle — paquet du cours
=======================

Ce dossier contient tout le cours : le site et les présentations.

LE SITE
-------
Le site a besoin d'un serveur HTTP : il ne s'ouvre PAS par double-clic
sur index.html (les navigateurs bloquent les modules JavaScript chargés
depuis un fichier local, la progression et les quiz ne marcheraient pas).

  · Mise en ligne : déposez ce dossier chez n'importe quel hébergeur de
    site statique (Netlify, GitHub Pages, un simple dossier Apache/nginx).

  · Sur votre machine, sans rien installer :

      cd <ce dossier>
      python3 -m http.server 8000

    puis ouvrez http://localhost:8000

LES PRÉSENTATIONS
-----------------
Le sous-dossier « slides » en contient deux autres :

  slides/lecons/ — une présentation par leçon, en deux formats.

  · <leçon>.html — se projette dans le navigateur (flèches pour
    changer de slide, F pour le plein écran). S'ouvre par double-clic,
    sans serveur et sans connexion. Les polices sont embarquées dans
    le fichier ; les images sont dans « lecons/assets », donc gardez
    le dossier « lecons » entier si vous le déplacez.

  · <leçon>.pdf — un seul fichier, rien autour : c'est le format à
    envoyer si vous ne transmettez qu'une présentation.

  slides/modules/ — un module entier par fichier, mêmes deux formats.

  · <module>.pdf — toutes les leçons du module à la suite. C'est le
    « PDF résumé » que le site propose à la fin de chaque module.

  · <module>.html — le même, projetable. Ses images sont dans
    « modules/assets ».

  · slides/index.html — le sommaire, qui pointe vers les deux.

Généré par « npm run bundle ».
`;

writeFileSync(join(DIST, 'LISEZ-MOI.txt'), readme);
ok('dist/LISEZ-MOI.txt');

console.log(`\n✓ Paquet prêt dans dist/ — site + ${decks.length} présentation(s) en HTML et PDF\n`);
