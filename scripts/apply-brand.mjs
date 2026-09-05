// =============================================================
// apply-brand.mjs - applique socle.config.json à tout le projet
//
// Lit les 4 couleurs et les 2 polices Google Fonts de
// « socle.config.json », puis :
//   1. vérifie que les couleurs sont lisibles entre elles (contraste WCAG) ;
//   2. vérifie que les polices existent bien sur Google Fonts ;
//   3. télécharge leurs fichiers .woff2 dans public/fonts/ ;
//   4. écrit src/styles/settings/_brand.scss  (couleurs + familles) ;
//   5. écrit src/styles/generic/_fonts.scss   (déclarations @font-face).
//
// Les deux fichiers .scss générés ne doivent pas être édités à la main :
// tout se règle dans socle.config.json. Ils sont malgré tout versionnés,
// pour qu'un clone du dépôt compile sans accès réseau.
//
// Usage :
//   npm run brand           → n'agit que si la configuration a changé
//   npm run brand -- --force  → retélécharge les polices dans tous les cas
// =============================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(ROOT, 'socle.config.json');
const FONTS_DIR = join(ROOT, 'public/fonts');
// À la racine, à côté de la config : dans public/ il finirait servi au visiteur.
const LOCK = join(ROOT, 'fonts.lock.json');
const BRAND_SCSS = join(ROOT, 'src/styles/settings/_brand.scss');
const FONTS_SCSS = join(ROOT, 'src/styles/generic/_fonts.scss');
// Le thème Marp reçoit les mêmes fontes, mais embarquées : voir plus bas.
const MARP_FONTS_SCSS = join(ROOT, 'src/styles/marp/_fonts.scss');

const FORCE = process.argv.includes('--force');
const METADATA_URL = 'https://fonts.google.com/metadata/fonts';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Sous-ensembles de caractères conservés. « latin » suffit au français ;
// « latin-ext » n'est téléchargé par le navigateur que s'il croise un
// caractère qui l'exige (grâce à unicode-range).
const SUBSETS = ['latin', 'latin-ext'];

const ok = (m) => console.log(`  ✓ ${m}`);
const info = (m) => console.log(`  · ${m}`);
const warn = (m) => console.warn(`  ⚠ ${m}`);
const fail = (m) => {
  console.error(`\n✗ ${m}\n`);
  process.exit(1);
};

// -------------------------------------------------------------
// 1. Configuration
// -------------------------------------------------------------
const COLOR_KEYS = ['primary', 'text', 'page'];
const FONT_KEYS = ['heading', 'body'];

if (!existsSync(CONFIG)) fail(`Fichier de configuration introuvable : ${CONFIG}`);

let config;
try {
  config = JSON.parse(readFileSync(CONFIG, 'utf8'));
} catch (e) {
  fail(`socle.config.json est mal formé (${e.message}).`);
}

const colors = config.colors ?? {};
const fonts = config.fonts ?? {};

for (const key of COLOR_KEYS) {
  const value = colors[key];
  if (!value) fail(`Couleur manquante dans socle.config.json : « ${key} ».`);
  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    fail(`La couleur « ${key} » doit être un hexadécimal à 6 chiffres (ex. #4b5694), reçu « ${value} ».`);
  }
}
for (const key of FONT_KEYS) {
  if (!fonts[key] || typeof fonts[key] !== 'string') {
    fail(`Police manquante dans socle.config.json : « ${key} ».`);
  }
}

// « locked » ne concerne pas la marque, mais c'est ici qu'on valide la
// forme du fichier de config, et ce script tourne avant chaque build
// (predev, prebuild). Une faute de FORME est bloquée tout de suite ;
// une faute de FRAPPE dans un identifiant, elle, ne peut être détectée
// qu'en face de la liste des leçons - c'est le rôle de config.mjs
// (unknownLocked), appelé par index.astro et build-slides.
if ('locked' in config) {
  if (!Array.isArray(config.locked)) {
    fail('« locked » doit être un tableau dans socle.config.json (ex. : ["module-3/lecon-4"]).');
  }
  const bad = config.locked.filter((v) => typeof v !== 'string');
  if (bad.length > 0) {
    fail(`« locked » ne doit contenir que des identifiants de leçon en texte, reçu ${JSON.stringify(bad[0])}.`);
  }
}

// -------------------------------------------------------------
// 2. Contraste (WCAG 2.1) - un novice ne doit pas pouvoir
//    fabriquer une palette illisible sans être averti.
// -------------------------------------------------------------
const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const linear = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const [r, g, b] = toRgb(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [la, lb] = [luminance(a) + 0.05, luminance(b) + 0.05];
  return Math.round((Math.max(la, lb) / Math.min(la, lb)) * 100) / 100;
};

console.log('\nCouleurs');
const checks = [
  ['le texte sur le fond de page', colors.text, colors.page, 4.5],
  ['la couleur principale sur le fond de page', colors.primary, colors.page, 4.5],
  ['le blanc sur la couleur principale (texte des boutons)', '#ffffff', colors.primary, 4.5],
];
for (const [label, a, b, min] of checks) {
  const ratio = contrast(a, b);
  if (ratio < min) {
    warn(`${label} : ${ratio}:1, en dessous du minimum recommandé de ${min}:1.`);
  } else {
    ok(`${label} : ${ratio}:1`);
  }
}
if (luminance(colors.page) < luminance(colors.text)) {
  warn("« page » est plus sombre que « text » : le thème est conçu pour un fond clair, l'inverse donnera des dérivés incohérents.");
}

// -------------------------------------------------------------
// 3. Polices : a-t-on quelque chose à faire ?
// -------------------------------------------------------------
const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fingerprint = JSON.stringify({ heading: fonts.heading, body: fonts.body, subsets: SUBSETS });

let lock = null;
if (existsSync(LOCK)) {
  try {
    lock = JSON.parse(readFileSync(LOCK, 'utf8'));
  } catch {
    lock = null;
  }
}

const lockValid =
  !FORCE &&
  lock?.fingerprint === fingerprint &&
  Array.isArray(lock.faces) &&
  lock.faces.length > 0 &&
  lock.faces.every((face) => existsSync(join(FONTS_DIR, face.file)));

console.log('\nPolices');

let faces;
if (lockValid) {
  faces = lock.faces;
  info('inchangées, aucun téléchargement (npm run brand -- --force pour forcer)');
} else {
  faces = await downloadFonts();
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} sur ${url}`);
  return res.text();
}

async function downloadFonts() {
  let metadata;
  try {
    const raw = await fetchText(METADATA_URL);
    metadata = JSON.parse(raw.slice(raw.indexOf('{'))).familyMetadataList ?? [];
  } catch (e) {
    fail(
      `Impossible de joindre Google Fonts (${e.message}).\n` +
        `  Les polices déjà présentes dans public/fonts/ restent utilisables :\n` +
        `  relancez « npm run brand » une fois la connexion revenue.`
    );
  }

  const resolve = (role, name) => {
    const found = metadata.find((f) => f.family.toLowerCase() === name.toLowerCase());
    if (found) return found;
    const needle = name.toLowerCase().split(/\s+/)[0];
    const near = metadata
      .filter((f) => f.family.toLowerCase().includes(needle))
      .slice(0, 6)
      .map((f) => `« ${f.family} »`);
    fail(
      `La police « ${name} » (${role}) n'existe pas sur Google Fonts.` +
        (near.length ? `\n  Vouliez-vous dire : ${near.join(', ')} ?` : '') +
        `\n  Catalogue : https://fonts.google.com`
    );
  };

  const heading = resolve('heading', fonts.heading);
  const body = resolve('body', fonts.body);
  const families = heading.family === body.family ? [heading] : [heading, body];

  // Graisses retenues : la normale, une graisse forte pour les titres et le
  // gras, et l'italique de la normale s'il existe. On prend les plus proches
  // parmi celles que la famille propose réellement.
  const pick = (item) => {
    const upright = Object.keys(item.fonts)
      .filter((k) => !k.endsWith('i'))
      .map(Number)
      .sort((a, b) => a - b);
    const closest = (target) =>
      upright.reduce((best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best), upright[0]);
    const weights = [...new Set([closest(400), closest(600), closest(700)])].sort((a, b) => a - b);
    // Italiques : les mêmes graisses, quand la famille les propose. Sans quoi
    // un « ***gras italique*** » dans une leçon serait rendu de travers.
    const italics = weights.filter((w) => `${w}i` in item.fonts);
    const wght = (item.axes ?? []).find((a) => a.tag === 'wght');
    return { weights, italics, axis: wght ? [wght.min, wght.max] : null };
  };

  const blocks = [];
  const ranges = {};
  const bytes = new Map();

  for (const item of families) {
    const { weights, italics, axis } = pick(item);
    const name = item.family.replace(/ /g, '+');
    const spec = italics.length
      ? `${name}:ital,wght@${[...weights.map((w) => `0,${w}`), ...italics.map((w) => `1,${w}`)].join(';')}`
      : `${name}:wght@${weights.join(';')}`;

    const css = await fetchText(`https://fonts.googleapis.com/css2?family=${spec}&display=swap`);
    const matches = [...css.matchAll(/\/\* ([a-z0-9-]+) \*\/\s*@font-face \{(.*?)\}/gs)];

    for (const [, subset, face] of matches) {
      if (!SUBSETS.includes(subset)) continue;
      const style = /font-style: (\w+)/.exec(face)[1];
      const weight = Number(/font-weight: (\d+)/.exec(face)[1]);
      const url = /url\((https:\/\/[^)]+)\)/.exec(face)[1];
      ranges[subset] ??= /unicode-range: ([^;]+);/.exec(face)[1].trim();

      if (!bytes.has(url)) {
        const res = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!res.ok) throw new Error(`téléchargement impossible : ${url}`);
        bytes.set(url, Buffer.from(await res.arrayBuffer()));
      }
      const data = bytes.get(url);
      blocks.push({
        family: item.family,
        slug: slugify(item.family),
        style,
        weight,
        subset,
        axis,
        data,
        hash: createHash('sha1').update(data).digest('hex').slice(0, 8),
      });
    }
  }

  // Google sert souvent une fonte VARIABLE : le même fichier pour toutes les
  // graisses demandées. On regroupe donc par contenu, et une seule
  // déclaration @font-face couvre alors une plage de graisses.
  const groups = new Map();
  for (const b of blocks) {
    const key = `${b.slug}|${b.style}|${b.subset}|${b.hash}`;
    const group = groups.get(key) ?? { ...b, weights: [] };
    group.weights.push(b.weight);
    groups.set(key, group);
  }

  const perStyleSubset = new Map();
  for (const g of groups.values()) {
    const key = `${g.slug}|${g.style}|${g.subset}`;
    perStyleSubset.set(key, (perStyleSubset.get(key) ?? 0) + 1);
  }

  mkdirSync(FONTS_DIR, { recursive: true });
  for (const file of readdirSync(FONTS_DIR)) {
    if (file.endsWith('.woff2')) unlinkSync(join(FONTS_DIR, file));
  }

  const built = [];
  for (const g of [...groups.values()].sort((a, b) => a.slug.localeCompare(b.slug) || a.weights[0] - b.weights[0])) {
    const weights = [...new Set(g.weights)].sort((a, b) => a - b);
    const multiple = perStyleSubset.get(`${g.slug}|${g.style}|${g.subset}`) > 1;
    const parts = [g.slug];
    if (multiple) parts.push(String(weights[0]));
    if (g.style === 'italic') parts.push('italic');
    parts.push(g.subset);
    const file = `${parts.join('-')}.woff2`;

    writeFileSync(join(FONTS_DIR, file), g.data);

    // Fonte variable : un seul fichier couvre toute la plage de l'axe wght, on
    // l'annonce donc en entier. Fonte statique : une graisse par fichier.
    const range = g.axis
      ? `${g.axis[0]} ${g.axis[1]}`
      : weights.length > 1
        ? `${weights[0]} ${weights.at(-1)}`
        : `${weights[0]}`;

    built.push({ family: g.family, file, style: g.style, weight: range, subset: g.subset, size: g.data.length });
  }

  writeFileSync(LOCK, `${JSON.stringify({ fingerprint, ranges, faces: built }, null, 2)}\n`);
  lock = { fingerprint, ranges, faces: built };

  const total = built.reduce((n, f) => n + f.size, 0);
  for (const f of built) ok(`${f.file} (${(f.size / 1024).toFixed(1)} Ko)`);
  info(`${built.length} fichier(s), ${(total / 1024).toFixed(1)} Ko au total`);
  return built;
}

// -------------------------------------------------------------
// 4. src/styles/settings/_brand.scss
// -------------------------------------------------------------
const banner = (name, description) => `/*******************************************************************************
 * Infos
*******************************************************************************/

/**
 * Name: ${name}
 * Type: ${name === 'Fonts' ? 'Generic' : 'Settings'}
 * Description:
 *   ⚠ FICHIER GÉNÉRÉ - ne l'éditez pas à la main : vos changements seront
 *   écrasés. Tout se règle dans « socle.config.json » à la racine du projet,
 *   puis « npm run brand ».
 *
${description}
**/
`;

writeFileSync(
  BRAND_SCSS,
  `${banner(
    'Brand',
    ` *   Ce fichier ne contient que la matière première : trois couleurs et
 *   deux familles de police. C'est \`settings/_colors.scss\` qui en déduit
 *   les rôles (survols, fonds teintés, filets, texte atténué).`
  )}
/*******************************************************************************
 * Couleurs
*******************************************************************************/

// Couleur principale : liens, boutons, titres de slides
$color-primary: ${colors.primary};

// Le texte, et les aplats les plus foncés
$color-text: ${colors.text};

// Le fond de page
$color-page: ${colors.page};

/*******************************************************************************
 * Polices
*******************************************************************************/

// Les titres
$font-heading: "${fonts.heading}";

// Le corps de texte
$font-body: "${fonts.body}";
`
);
console.log('\nFichiers générés');
ok('src/styles/settings/_brand.scss');

// -------------------------------------------------------------
// 5. src/styles/generic/_fonts.scss
// -------------------------------------------------------------
const ranges = lock?.ranges ?? {};
const subsetVar = { latin: '$latin', 'latin-ext': '$latin-ext' };

const faceLines = faces
  .map(
    (f) =>
      `@include fonts.font-face("${f.family}", "#{$folder}${f.file}", ` +
      `${f.weight}, ${f.style}, ${subsetVar[f.subset]});`
  )
  .join('\n');

writeFileSync(
  FONTS_SCSS,
  `${banner(
    'Fonts',
    ` *   Déclare les polices, **auto-hébergées** dans \`public/fonts/\` : aucune
 *   requête vers Google au chargement d'une page, donc rien à déclarer côté
 *   RGPD et une dépendance externe en moins.
 *
 *   Les \`unicode-range\` font que le navigateur ne télécharge \`latin-ext\`
 *   que s'il croise un caractère qui l'exige : une page en français ne
 *   charge que \`latin\`.
 *
 *   \`$folder\` est configurable, car les deux points d'entrée ne voient pas
 *   le dossier depuis le même endroit :
 *     - le site → "/fonts/"          (racine web, servie par public/)
 *     - Marp    → "../public/fonts/" (relatif à slides/theme.css)`
  )}
/*******************************************************************************
 * Utils
*******************************************************************************/

@use "../tools/fonts";

/*******************************************************************************
 * Variables
*******************************************************************************/

$folder: "/fonts/" !default;

/* stylelint-disable max-line-length */
$latin: ${ranges.latin};
$latin-ext: ${ranges['latin-ext']};
/* stylelint-enable max-line-length */

/*******************************************************************************
 * Déclarations
*******************************************************************************/

${faceLines}
`
);
ok('src/styles/generic/_fonts.scss');

// -------------------------------------------------------------
// 6. src/styles/marp/_fonts.scss
//
// Les slides reçoivent les MÊMES fontes, mais embarquées en base64
// plutôt que référencées par une URL. Raison : le thème Marp est
// consommé depuis deux endroits qui ne résolvent pas les chemins
// pareil - le rendu PDF (relatif au dossier slides/) et le serveur
// d'aperçu (relatif à une URL). Une donnée embarquée n'a pas de
// chemin, donc rien à résoudre : elle marche dans les deux cas, et
// un deck exporté en HTML emporte ses polices avec lui.
// -------------------------------------------------------------
const inlineLines = faces
  .map((f) => {
    const data = readFileSync(join(FONTS_DIR, f.file)).toString('base64');
    return (
      `@include fonts.font-face(\n  "${f.family}",\n  "data:font/woff2;base64,${data}",\n` +
      `  ${f.weight},\n  ${f.style},\n  ${subsetVar[f.subset]}\n);`
    );
  })
  .join('\n\n');

writeFileSync(
  MARP_FONTS_SCSS,
  `/*******************************************************************************
 * Infos
*******************************************************************************/

/**
 * Name: Fonts (Marp)
 * Type: Theme
 * Description:
 *   ⚠ FICHIER GÉNÉRÉ - ne l'éditez pas à la main. Il est réécrit par
 *   « npm run brand », à partir de socle.config.json.
 *
 *   Mêmes fontes que le site, mais **embarquées en base64**. Le thème Marp
 *   est consommé depuis deux endroits qui ne résolvent pas les chemins de la
 *   même façon - le rendu PDF (relatif au dossier slides/) et le serveur
 *   d'aperçu (relatif à une URL). Une donnée embarquée n'a pas de chemin :
 *   elle fonctionne dans les deux cas, et un deck exporté en HTML emporte
 *   ses polices avec lui.
 *
 *   Le site, lui, garde des URL (generic/_fonts.scss) : ses fichiers de
 *   police sont mis en cache par le navigateur, ce qu'une donnée inline
 *   empêcherait.
**/

/*******************************************************************************
 * Utils
*******************************************************************************/

@use "../tools/fonts";

/*******************************************************************************
 * Variables
*******************************************************************************/

/* stylelint-disable max-line-length */
$latin: ${ranges.latin};
$latin-ext: ${ranges['latin-ext']};
/* stylelint-enable max-line-length */

/*******************************************************************************
 * Déclarations
*******************************************************************************/

${inlineLines}
`
);
const inlineKo = (faces.reduce((n, f) => n + f.size, 0) * 4) / 3 / 1024;
ok(`src/styles/marp/_fonts.scss (fontes embarquées, ~${inlineKo.toFixed(0)} Ko)`);
console.log('');
