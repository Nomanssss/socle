// =============================================================
// build-slides.mjs - génère un deck Marp (PDF) par leçon
//
// Pour chaque leçon (src/content/lecons/**/*.mdx) :
//   1. lit le frontmatter (title, module, duration, cover, slidePoints) ;
//   2. construit une slide de titre automatique ;
//   3. ajoute le contenu du fichier compagnon « <leçon>.slides.md »
//      s'il existe (markdown Marp complet, slides séparées par ---),
//      sinon un deck minimal depuis slidePoints ;
//   4. écrit le .md assemblé dans slides/ puis le rend avec Marp.
//
// Prérequis : le thème doit être compilé (npm run slides:theme).
//
// Usage :
//   node scripts/build-slides.mjs                  → PDF (défaut)
//   node scripts/build-slides.mjs --format=html    → HTML
//   node scripts/build-slides.mjs --format=pptx    → PPTX
//   (SLIDES_FORMAT=html node scripts/build-slides.mjs fonctionne aussi)
//
// Écrit aussi « slides/manifest.json » : la liste des decks avec leur
// titre et leur module, dont « bundle-dist.mjs » se sert pour fabriquer
// le sommaire des slides livré dans dist/.
//
// Note : les formats pdf/pptx nécessitent Chrome/Chromium installé
// (Marp s'appuie dessus). Le format html n'en a pas besoin.
// =============================================================

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import matter from 'gray-matter';
import { stageImage, stageImages } from './stage-images.mjs';
import { isLocked, unknownLocked } from './config.mjs';

const ROOT = process.cwd();
const LESSONS_DIR = join(ROOT, 'src/content/lecons');
const OUT_DIR = join(ROOT, 'slides');
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

const generated = [];
const manifest = [];

for (const rel of lessons) {
  const file = join(LESSONS_DIR, rel);
  const dir = dirname(file);
  const { data } = matter(readFileSync(file, 'utf8'));

  const id = rel.replace(/\.mdx$/, ''); // ex : module-1/lecon-1
  const slug = id.replace(/[/\\]/g, '-'); // ex : module-1-lecon-1

  // -- En-tête Marp --------------------------------------------------------
  let md = '---\n';
  md += 'marp: true\n';
  md += 'theme: socle\n';
  md += 'paginate: true\n';
  if (data.title) md += `title: ${yamlString(data.title)}\n`;
  md += '---\n\n';

  // -- Slide de titre ------------------------------------------------------
  md += '<!-- _class: lead -->\n';
  md += '<!-- _paginate: false -->\n\n';
  // La couverture alimente le bandeau haut de la slide de titre. On ne passe
  // pas par `![bg]` : cette syntaxe répartit l'image en colonnes (left/right)
  // et ne sait pas cadrer une bande en hauteur. La directive, elle, expose
  // l'image dans la variable `--background-image`, que `layouts/_lead.scss`
  // récupère pour la cadrer lui-même. Aucun réglage de taille à passer ici :
  // le cadrage appartient à la mise en page.
  const bandSource = data.cover ? resolve(dir, String(data.cover)) : DEFAULT_BAND;
  if (bandSource) {
    const staged = stageImage(bandSource, OUT_DIR);
    if (staged) md += `<!-- _backgroundImage: url('${staged}') -->\n`;
  }
  md += '\n';
  md += `# ${data.title ?? id}\n\n`;
  if (data.module) md += `**${data.module}**\n`;

  // -- Corps ---------------------------------------------------------------
  const slidesFile = join(dir, `${basename(file, '.mdx')}.slides.md`);
  if (existsSync(slidesFile)) {
    const body = stageImages(readFileSync(slidesFile, 'utf8').trim(), dir, OUT_DIR);
    md += `\n---\n\n${body}\n`;
  } else if (Array.isArray(data.slidePoints) && data.slidePoints.length) {
    md += '\n---\n\n## Points clés\n\n';
    for (const point of data.slidePoints) md += `- ${point}\n`;
  } else {
    md += '\n---\n\n## Résumé\n\nRetrouvez cette leçon en ligne.\n';
  }

  // -- Écriture + rendu ----------------------------------------------------
  const mdPath = join(OUT_DIR, `${slug}.md`);
  writeFileSync(mdPath, md);

  const ext = FORMAT === 'pptx' ? 'pptx' : FORMAT === 'html' ? 'html' : 'pdf';
  const outPath = join(OUT_DIR, `${slug}.${ext}`);
  const args = ['--no-stdin', '--theme', THEME, '--allow-local-files'];
  if (FORMAT_FLAG[FORMAT]) args.push(FORMAT_FLAG[FORMAT]);
  args.push('-o', outPath, mdPath);

  console.log(`→ ${id}  (${ext})`);
  execFileSync(MARP_BIN, args, { stdio: 'inherit' });
  generated.push(outPath);
  manifest.push({
    id,
    slug,
    title: data.title ?? id,
    module: data.module ?? null,
    moduleOrder: data.moduleOrder ?? null,
    order: data.order ?? null,
  });
}

// Le manifeste décrit les decks, pas le format : il est réécrit à
// l'identique par chaque passe (pdf, html…), ce qui le garde juste.
writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `\n✓ ${generated.length} deck(s) généré(s) dans slides/${
    lockedCount ? ` (${lockedCount} leçon(s) verrouillée(s), sans deck)` : ''
  }`
);
