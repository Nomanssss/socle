// =============================================================
// config.mjs — lecture de socle.config.json
//
// Point d'accès unique au fichier de configuration, partagé par les
// scripts Node (build-slides, bundle-dist) ET par les pages Astro
// (index.astro, LessonLayout.astro). Une seule source de vérité :
// une leçon verrouillée doit disparaître du site, de la navigation
// ET des slides, sans que trois fichiers en décident séparément.
//
// C'est volontairement du .mjs et non du .ts : les scripts Node
// l'importent directement, sans étape de compilation.
// =============================================================

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * La version du TEMPLATE, affichée dans les mentions légales et dans la
 * balise <meta name="generator"> de chaque page.
 *
 * ⚠ Elle n'est délibérément PAS lue depuis package.json. Une fois Socle
 * cloné, ce package.json appartient à l'auteur du cours : il y met le nom
 * et le numéro de SON projet, et la mention « propulsé par Socle » se
 * mettrait alors à afficher la version du cours. Un numéro écrit ici ne
 * bouge que lorsqu'on publie une version de Socle.
 *
 * À mettre à jour à chaque release, en même temps que « version » dans
 * package.json - les deux disent la même chose au moment du clone, puis
 * suivent chacun leur vie.
 */
export const SOCLE_VERSION = '1.0.0';

/**
 * Où est socle.config.json ?
 *
 * ⚠ Ne PAS se contenter de `import.meta.url` : ce module est aussi
 * importé par les pages Astro, et Vite le regroupe alors dans
 * « dist/.prerender/ ». La racine déduite du chemin du module y
 * désigne donc le dossier de build, pas le projet - le fichier de
 * config est introuvable et toutes les leçons se retrouvent
 * déverrouillées, sans le moindre message. C'est exactement le genre
 * de panne qu'on ne veut pas sur un verrou.
 *
 * On essaie donc les deux racines plausibles et on garde celle qui
 * contient vraiment le fichier : le dossier parent du module (cas des
 * scripts lancés par node) et le répertoire courant (cas d'Astro, qui
 * construit toujours depuis la racine du projet).
 */
const CANDIDATES = [
  join(dirname(fileURLToPath(import.meta.url)), '..', 'socle.config.json'),
  join(process.cwd(), 'socle.config.json'),
];

const CONFIG_PATH = CANDIDATES.find((path) => existsSync(path));

/** Le contenu brut de socle.config.json. */
export function readConfig() {
  if (!CONFIG_PATH) {
    // Bruyant, et volontairement : renvoyer un objet vide ferait passer
    // un verrou inopérant pour un verrou en place.
    throw new Error(
      `socle.config.json est introuvable. Cherché dans :\n  - ${CANDIDATES.join('\n  - ')}`
    );
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    throw new Error(`socle.config.json est mal formé (${e.message}).`);
  }
}

/**
 * Normalise un identifiant de leçon vers la forme utilisée par Astro,
 * « module-3/lecon-4 ». On tolère ce qu'un humain écrit à la main :
 * les antislashs de Windows, les slashs en trop, un « .mdx » oublié et
 * un préfixe « src/content/lecons/ » collé depuis l'explorateur.
 */
export function normalizeId(value) {
  return String(value)
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/^src\/content\/lecons\//, '')
    .replace(/\.mdx$/i, '')
    .replace(/^\/+|\/+$/g, '');
}

/**
 * Les identifiants des leçons verrouillées, en Set pour le test
 * d'appartenance. Une entrée vide est ignorée : « locked: [""] »
 * ne doit pas verrouiller quoi que ce soit par accident.
 */
export function lockedIds() {
  const raw = readConfig().locked;
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.map(normalizeId).filter(Boolean));
}

/** La leçon `id` est-elle verrouillée ? */
export function isLocked(id) {
  return lockedIds().has(normalizeId(id));
}

/**
 * Les identifiants verrouillés qui ne correspondent à AUCUNE leçon.
 * Une faute de frappe dans « locked » ne verrouille rien et ne dit
 * rien : sans ce contrôle, on croit une leçon protégée alors qu'elle
 * est en ligne. Les appelants s'en servent pour avertir au build.
 */
export function unknownLocked(existingIds) {
  const known = new Set([...existingIds].map(normalizeId));
  return [...lockedIds()].filter((id) => !known.has(id));
}

/**
 * Les champs des mentions légales : leur clé dans socle.config.json, le
 * libellé affiché, et la rubrique de la page qui les accueille. La liste
 * vit ICI et pas dans la page : le même tableau sert à afficher les
 * mentions et à avertir au build de celles qui manquent - deux listes
 * finiraient par diverger.
 */
export const LEGAL_FIELDS = [
  { key: 'editor', label: 'Éditeur du site', section: 'editor' },
  { key: 'address', label: 'Adresse', section: 'editor' },
  { key: 'email', label: 'Contact', section: 'editor' },
  { key: 'publisher', label: 'Directeur de la publication', section: 'editor' },
  { key: 'host', label: 'Hébergeur', section: 'host' },
];

/**
 * L'identité du site : le titre et l'accroche de l'accueil, plus les
 * mentions légales. Tout est optionnel dans socle.config.json - un
 * champ absent ou vide revient à une chaîne vide, et le titre retombe
 * sur « Socle » pour qu'une page ne s'affiche jamais sans nom.
 */
export function site() {
  const raw = readConfig().site ?? {};
  const legal = raw.legal ?? {};
  const clean = (value) => String(value ?? '').trim();

  return {
    title: clean(raw.title) || 'Socle',
    tagline: clean(raw.tagline),
    legal: Object.fromEntries(LEGAL_FIELDS.map(({ key }) => [key, clean(legal[key])])),
  };
}

/**
 * Les mentions renseignées d'une rubrique, prêtes à afficher :
 * { label, value } dans l'ordre de LEGAL_FIELDS, les champs vides
 * écartés. Sans argument, toutes rubriques confondues.
 */
export function legalEntries(section = null) {
  const { legal } = site();
  return LEGAL_FIELDS.filter(
    (field) => legal[field.key] && (section === null || field.section === section)
  ).map(({ key, label }) => ({ label, value: legal[key] }));
}

/** Les libellés des mentions légales encore vides, pour l'alerte au build. */
export function missingLegal() {
  const { legal } = site();
  return LEGAL_FIELDS.filter(({ key }) => !legal[key]).map(({ label }) => label);
}
