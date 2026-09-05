// =============================================================
// build-slides.mjs - génère un deck Marp par leçon, et un par module
//
// Pour chaque leçon (src/content/lecons/**/*.mdx) :
//   1. lit le frontmatter (title, module, duration, cover, slidePoints) ;
//   2. construit une slide de titre automatique ;
//   3. ajoute le contenu du fichier compagnon « <leçon>.slides.md »
//      s'il existe (markdown Marp complet, slides séparées par ---),
//      sinon un deck minimal depuis slidePoints ;
//   4. écrit le .md assemblé dans slides/ puis le rend avec Marp.
//
// Puis, pour chaque module (= un dossier de src/content/lecons/) :
// un deck « module-1.pdf » qui enchaîne les leçons du dossier, dans
// l'ordre. C'est le « PDF résumé » que la dernière leçon du module
// propose au téléchargement, verrouillées exclues.
//
// Il suit le format demandé, comme les decks de leçon : PDF pour le
// bouton du site, HTML pour le projeter. Seul le PDF passe en plus
// dans public/ - c'est le seul format que le site propose.
//
// Prérequis : le thème doit être compilé (npm run slides:theme).
//
// Deux réglages indépendants : le FORMAT produit, et la PORTÉE - ce qu'on
// régénère. Régénérer les quatre decks de module quand on vient de
// retoucher une seule leçon coûte plusieurs minutes pour rien.
//
// Usage :
//   node scripts/build-slides.mjs                  → PDF, tout
//   node scripts/build-slides.mjs --format=html    → HTML (ou pptx)
//   node scripts/build-slides.mjs --only=lecons    → les leçons seules
//   node scripts/build-slides.mjs --only=modules   → les modules seuls
//   (SLIDES_FORMAT et SLIDES_ONLY font la même chose en variables)
//
// Les deux se combinent : --format=html --only=modules.
//
// Écrit aussi « slides/manifest.json » : la liste des decks avec leur
// titre et leur module, dont « bundle-dist.mjs » se sert pour fabriquer
// le sommaire des slides livré dans dist/.
//
// Note : les formats pdf/pptx nécessitent Chrome/Chromium installé
// (Marp s'appuie dessus). Le format html n'en a pas besoin.
// =============================================================

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import matter from 'gray-matter';
import { stageImage, stageImages } from './stage-images.mjs';
import { isLocked, unknownLocked } from './config.mjs';

const ROOT = process.cwd();
const LESSONS_DIR = join(ROOT, 'src/content/lecons');
const OUT_DIR = join(ROOT, 'slides');
// Le site LIE les PDF de module (bouton « Télécharger le PDF résumé ») :
// ils doivent donc être servis par Astro, ce que slides/ n'est pas - c'est
// un dossier de travail à la racine, qu'Astro ignore en dev comme au build.
// public/ est le seul endroit dont le contenu est servi tel quel dans les
// deux cas. Les decks de LEÇON, eux, n'y vont pas : rien ne les lie depuis
// le site, et bundle-dist les met dans le paquet livré.
//
// Le sous-dossier « modules » reproduit le rangement de dist/slides/, pour
// que l'URL soit la même en dev et dans le paquet : /slides/modules/…
const PUBLIC_SLIDES = join(ROOT, 'public/slides/modules');
const THEME = join(OUT_DIR, 'theme.css');

/**
 * Image du bandeau des slides de titre, pour les leçons SANS `cover:`.
 * Se règle dans socle.config.json :
 *
 *   "slides": { "band": "src/assets/mon-bandeau.png" }
 *
 * Chemin relatif à la racine du projet. Absente, le bandeau reste un aplat de
 * la couleur principale (c'est layouts/_lead.scss qui le décide).
 */
const DEFAULT_BAND = (() => {
  const configPath = join(ROOT, 'socle.config.json');
  if (!existsSync(configPath)) return null;
  try {
    const band = JSON.parse(readFileSync(configPath, 'utf8'))?.slides?.band;
    if (!band) return null;
    const abs = resolve(ROOT, String(band));
    if (!existsSync(abs)) {
      console.warn(`  ⚠ slides.band introuvable : ${band} (bandeau laissé en aplat)`);
      return null;
    }
    return abs;
  } catch {
    return null;
  }
})();
const MARP_BIN = join(ROOT, 'node_modules/.bin/marp');

// Format de sortie → drapeau Marp. Accepté en drapeau (--format=html) ou
// en variable d'environnement : le drapeau garde package.json portable,
// la variable reste pratique en ligne de commande.
const formatArg = process.argv.slice(2).find((a) => a.startsWith('--format='));
const FORMAT = (formatArg ? formatArg.slice('--format='.length) : process.env.SLIDES_FORMAT) || 'pdf';
const FORMAT_FLAG = { pdf: '--pdf', pptx: '--pptx', html: null };
if (!(FORMAT in FORMAT_FLAG)) {
  console.error(`Format inconnu : "${FORMAT}" (attendu : pdf, html, pptx).`);
  process.exit(1);
}

// Portée : ce qu'on régénère. « tout » par défaut - le cas courant, et
// celui que npm run bundle utilise.
const onlyArg = process.argv.slice(2).find((a) => a.startsWith('--only='));
const ONLY = (onlyArg ? onlyArg.slice('--only='.length) : process.env.SLIDES_ONLY) || 'tout';
if (!['tout', 'lecons', 'modules'].includes(ONLY)) {
  console.error(`Portée inconnue : "${ONLY}" (attendu : tout, lecons, modules).`);
  process.exit(1);
}
const DO_LESSONS = ONLY !== 'modules';
const DO_MODULES = ONLY !== 'lecons';

if (!existsSync(THEME)) {
  console.error('Thème introuvable. Lance d’abord : npm run slides:theme');
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });

// Échappe une valeur pour le frontmatter YAML (guillemets).
const yamlString = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

// Réécrit les chemins d'images markdown (y compris ![bg](...)) en chemins
// absolus, résolus relativement au fichier source. Nécessaire car le deck
// assemblé est écrit dans slides/ : les chemins relatifs d'origine y seraient
// cassés. Les URLs (http/data) et chemins absolus sont laissés tels quels.
// Toutes les leçons .mdx, chemin relatif à LESSONS_DIR.
const allLessons = readdirSync(LESSONS_DIR, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.mdx'))
  .sort();

if (allLessons.length === 0) {
  console.error('Aucune leçon .mdx trouvée dans', LESSONS_DIR);
  process.exit(1);
}

// Une leçon verrouillée (« locked » dans socle.config.json) n'a pas de
// deck : le paquet livré ne doit pas contenir, en PDF, le cours dont la
// page web est fermée. Le manifeste les ignore donc aussi, et
// bundle-dist n'a rien à filtrer de son côté.
const strays = unknownLocked(allLessons.map((f) => f.replace(/\.mdx$/, '')));
if (strays.length > 0) {
  console.warn(
    `  ⚠ « locked » : aucune leçon ne correspond à ${strays
      .map((id) => `« ${id} »`)
      .join(', ')} - ces entrées ne verrouillent rien.`
  );
}

const lessons = allLessons.filter((f) => !isLocked(f.replace(/\.mdx$/, '')));
const lockedCount = allLessons.length - lessons.length;

if (lessons.length === 0) {
  console.error('Toutes les leçons sont verrouillées : aucun deck à générer.');
  process.exit(1);
}

// Verrouiller une leçon doit FAIRE DISPARAÎTRE son deck, pas seulement
// cesser de le régénérer : sans ce nettoyage, le .pdf produit avant le
// verrou resterait dans slides/, à portée de main. On ne supprime que
// les fichiers que ce script écrit lui-même, pour les leçons connues -
// le banc d'essai du thème (00-modeles), le thème compilé et les
// images mises en scène ne sont jamais touchés.
const slugOf = (rel) => rel.replace(/\.mdx$/, '').replace(/[/\\]/g, '-');
const keep = new Set(lessons.map(slugOf));
let cleaned = 0;

for (const rel of allLessons) {
  const slug = slugOf(rel);
  if (keep.has(slug)) continue;
  for (const ext of ['md', 'html', 'pdf', 'pptx']) {
    const stale = join(OUT_DIR, `${slug}.${ext}`);
    if (existsSync(stale)) {
      rmSync(stale);
      cleaned += 1;
    }
  }
}

if (cleaned > 0) console.log(`  · ${cleaned} fichier(s) d'une leçon verrouillée retiré(s) de slides/`);

// L'extension produite par le format demandé. Hors des boucles : les
// decks de leçon comme ceux de module s'en servent.
const ext = FORMAT === 'pptx' ? 'pptx' : FORMAT === 'html' ? 'html' : 'pdf';

/** Rend un .md assemblé avec Marp, dans le format demandé. */
function render(mdPath, outPath) {
  const args = ['--no-stdin', '--theme', THEME, '--allow-local-files'];
  if (FORMAT_FLAG[FORMAT]) args.push(FORMAT_FLAG[FORMAT]);
  args.push('-o', outPath, mdPath);
  execFileSync(MARP_BIN, args, { stdio: 'inherit' });
}

/** L'en-tête Marp d'un deck : les mêmes réglages pour tous. */
function marpHeader(title) {
  let head = '---\n';
  head += 'marp: true\n';
  head += 'theme: socle\n';
  head += 'paginate: true\n';
  if (title) head += `title: ${yamlString(title)}\n`;
  head += '---\n\n';
  return head;
}

const generated = [];
const manifest = [];

// Les corps de deck, groupés par dossier de module : de quoi enchaîner
// les leçons d'un module sans les réassembler.
const byModuleDir = new Map();

for (const rel of lessons) {
  const file = join(LESSONS_DIR, rel);
  const dir = dirname(file);
  const { data } = matter(readFileSync(file, 'utf8'));

  const id = rel.replace(/\.mdx$/, ''); // ex : module-1/lecon-1
  const slug = id.replace(/[/\\]/g, '-'); // ex : module-1-lecon-1

  // -- Slide de titre ------------------------------------------------------
  // Elle existe en DEUX versions, pour deux rôles : « lead » ouvre le deck
  // de la leçon, « section » n'est qu'un intercalaire dans celui du module.
  // Le corps qui suit, lui, est le même - assemblé une fois, servi deux fois.
  let leadSlide = '<!-- _class: lead -->\n';
  leadSlide += '<!-- _paginate: false -->\n\n';
  // La couverture alimente le bandeau haut de la slide de titre. On ne passe
  // pas par `![bg]` : cette syntaxe répartit l'image en colonnes (left/right)
  // et ne sait pas cadrer une bande en hauteur. La directive, elle, expose
  // l'image dans la variable `--background-image`, que `layouts/_lead.scss`
  // récupère pour la cadrer lui-même. Aucun réglage de taille à passer ici :
  // le cadrage appartient à la mise en page.
  const bandSource = data.cover ? resolve(dir, String(data.cover)) : DEFAULT_BAND;
  if (bandSource) {
    const staged = stageImage(bandSource, OUT_DIR);
    if (staged) leadSlide += `<!-- _backgroundImage: url('${staged}') -->\n`;
  }
  leadSlide += '\n';
  leadSlide += `# ${data.title ?? id}\n\n`;
  if (data.module) leadSlide += `**${data.module}**\n`;

  // L'intercalaire, lui, se réduit au titre : le nom du module est déjà sur
  // la première slide du deck, et le fond plein du modèle « section » ne
  // s'accommode ni d'une couverture ni d'un sous-titre. La pagination y
  // reste active - on est au milieu d'un deck, plus à son ouverture.
  const sectionSlide = `<!-- _class: section -->\n\n# ${data.title ?? id}\n`;

  // -- Corps, commun aux deux versions -------------------------------------
  let content = '';
  const slidesFile = join(dir, `${basename(file, '.mdx')}.slides.md`);
  if (existsSync(slidesFile)) {
    const lessonSlides = stageImages(readFileSync(slidesFile, 'utf8').trim(), dir, OUT_DIR);
    content += `\n---\n\n${lessonSlides}\n`;
  } else if (Array.isArray(data.slidePoints) && data.slidePoints.length) {
    content += '\n---\n\n## Points clés\n\n';
    for (const point of data.slidePoints) content += `- ${point}\n`;
  } else {
    content += '\n---\n\n## Résumé\n\nRetrouvez cette leçon en ligne.\n';
  }

  // -- Écriture + rendu ----------------------------------------------------
  // Le corps est assemblé même quand on ne rend que les modules : c'est lui
  // qui les compose. Seul le rendu Marp, qui coûte, est conditionnel.
  if (DO_LESSONS) {
    const mdPath = join(OUT_DIR, `${slug}.md`);
    writeFileSync(mdPath, marpHeader(data.title) + leadSlide + content);

    const outPath = join(OUT_DIR, `${slug}.${ext}`);
    console.log(`→ ${id}  (${ext})`);
    render(mdPath, outPath);
    generated.push(outPath);
  }

  // Le dossier fait le module : « module-1/lecon-2.mdx » → « module-1 ».
  const moduleDir = rel.includes('/') || rel.includes('\\') ? rel.split(/[/\\]/)[0] : null;
  if (moduleDir) {
    const bucket = byModuleDir.get(moduleDir) ?? { label: null, labels: new Set(), bodies: [] };
    bucket.label ??= data.module ?? null;
    if (data.module) bucket.labels.add(data.module);
    bucket.bodies.push(sectionSlide + content);
    byModuleDir.set(moduleDir, bucket);
  } else {
    console.warn(`  ⚠ ${rel} n'est pas dans un dossier de module : absente du PDF de module.`);
  }
  manifest.push({
    id,
    slug,
    title: data.title ?? id,
    module: data.module ?? null,
    moduleOrder: data.moduleOrder ?? null,
    order: data.order ?? null,
  });
}

// -------------------------------------------------------------
// Un deck par module
//
// La dernière leçon d'un module propose « Télécharger le PDF résumé » :
// c'est ce fichier. Il enchaîne les corps déjà assemblés plus haut,
// derrière une slide de titre au nom du module - donc exactement ce que
// l'apprenant a vu leçon après leçon, sans rien de recomposé. Les
// leçons verrouillées n'y sont pas : elles ne sont pas dans `lessons`.
//
// Le module, c'est le DOSSIER (« module-1/ » → « module-1.pdf »), et
// non le champ « module: » du frontmatter : il faut un nom de fichier,
// et un libellé comme « Module 1 - Prendre le template en main » n'en
// fait pas un bon. Le libellé, lui, titre la première slide.
// -------------------------------------------------------------

// Un module dont toutes les leçons sont verrouillées n'a plus de deck :
// on retire celui d'avant, même raison que pour les leçons.
let cleanedModules = 0;
for (const rel of allLessons) {
  const dir = rel.includes('/') || rel.includes('\\') ? rel.split(/[/\\]/)[0] : null;
  if (!dir || byModuleDir.has(dir)) continue;
  for (const e of ['md', 'html', 'pdf', 'pptx']) {
    const stale = join(OUT_DIR, `${dir}.${e}`);
    if (existsSync(stale)) {
      rmSync(stale);
      cleanedModules += 1;
    }
  }
  const stalePublic = join(PUBLIC_SLIDES, `${dir}.pdf`);
  if (existsSync(stalePublic)) {
    rmSync(stalePublic);
    cleanedModules += 1;
  }
}
if (cleanedModules > 0) {
  console.log(`  · ${cleanedModules} fichier(s) d'un module entièrement verrouillé retiré(s) de slides/`);
}

const moduleDecks = [];

for (const [dir, { label, labels, bodies }] of DO_MODULES ? byModuleDir : []) {
  // Deux libellés dans un même dossier : on prend le premier, mais on le
  // dit. Silencieux, le PDF s'intitulerait d'après une leçon au hasard.
  if (labels.size > 1) {
    console.warn(
      `  ⚠ ${dir}/ : plusieurs « module: » (${[...labels].join(' / ')}) - le deck retient « ${label} ».`
    );
  }

  let body = '<!-- _class: lead -->\n';
  body += '<!-- _paginate: false -->\n\n';
  if (DEFAULT_BAND) {
    const staged = stageImage(DEFAULT_BAND, OUT_DIR);
    if (staged) body += `<!-- _backgroundImage: url('${staged}') -->\n`;
  }
  body += '\n';
  body += `# ${label ?? dir}\n`;

  const md = marpHeader(label ?? dir) + body + bodies.map((b) => `\n---\n\n${b}`).join('');

  const mdPath = join(OUT_DIR, `${dir}.md`);
  writeFileSync(mdPath, md);

  const outPath = join(OUT_DIR, `${dir}.${ext}`);
  console.log(`→ ${dir}  (${ext}, module)`);
  render(mdPath, outPath);
  moduleDecks.push(outPath);

  // Seul le PDF part dans public/ : c'est ce que propose le bouton du
  // site, et lui seul (voir PUBLIC_SLIDES, plus haut). Le HTML, lui,
  // n'existe que pour le paquet livré, où bundle-dist ira le chercher.
  if (ext === 'pdf') {
    mkdirSync(PUBLIC_SLIDES, { recursive: true });
    copyFileSync(outPath, join(PUBLIC_SLIDES, `${dir}.pdf`));
  }
}

// Le manifeste décrit les decks, pas le format : il est réécrit à
// l'identique par chaque passe (pdf, html…), ce qui le garde juste.
writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const bilan = [
  DO_LESSONS ? `${generated.length} deck(s) de leçon` : null,
  DO_MODULES ? `${moduleDecks.length} de module` : null,
].filter(Boolean).join(' et ');

console.log(
  `\n✓ ${bilan} en ${ext} dans slides/${
    lockedCount ? ` (${lockedCount} leçon(s) verrouillée(s), sans deck)` : ''
  }`
);
