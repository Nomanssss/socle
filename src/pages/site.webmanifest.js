// =============================================================
// site.webmanifest - le manifeste d'application web, généré
//
// Généré et non posé en fichier statique dans public/ : le manifeste
// porte le NOM du site et ses couleurs. Figé, il annoncerait « Socle »
// sur le cours de quelqu'un d'autre - c'est-à-dire le nom du template
// sur l'écran d'accueil de l'apprenant qui épingle la page.
//
// Tout vient donc de socle.config.json, comme le reste de l'identité.
// Les icônes, elles, sont bien des fichiers de public/ : elles ne
// dépendent d'aucun réglage, et l'auteur du cours les remplace par les
// siennes (voir le guide, « Les icônes du site »).
//
// Le nom du fichier fait la route : « site.webmanifest.js » est servi
// à /site.webmanifest, et prérendu au build comme le reste du site.
// =============================================================

import { site, readConfig } from '../../scripts/config.mjs';

export function GET() {
  const { title } = site();
  const colors = readConfig().colors ?? {};

  const manifest = {
    name: title,
    // Le nom court s'affiche sous l'icône, où la place manque : les
    // systèmes le tronquent au-delà d'une douzaine de caractères.
    short_name: title,
    icons: [
      {
        src: '/web-app-manifest-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/web-app-manifest-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    // La couleur principale teinte l'interface du navigateur ; celle de
    // la page sert de fond à l'écran de démarrage. Changer la charte
    // dans socle.config.json les met donc à jour toutes seules.
    theme_color: colors.primary ?? '#ffffff',
    background_color: colors.page ?? '#ffffff',
    display: 'standalone',
  };

  return new Response(`${JSON.stringify(manifest, null, 2)}\n`, {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
  });
}
