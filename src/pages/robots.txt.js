// =============================================================
// robots.txt - généré, pour pouvoir y écrire l'adresse du sitemap
//
// Posé en fichier statique dans public/, il serait figé : il annoncerait
// le plan du site d'un autre cours, ou un plan qui n'existe pas. Il est
// donc construit à partir de socle.config.json, comme le manifeste.
//
// Le parti pris est celui d'un cours en ligne : tout est public, donc
// tout est autorisé. Le verrou de socle.config.json n'a rien à faire ici
// - une leçon verrouillée n'a pas de page du tout, et un « Disallow »
// aurait l'effet inverse de celui recherché : il publierait la liste de
// ce qu'on ne veut pas voir.
//
// Le nom du fichier fait la route : « robots.txt.js » est servi à
// /robots.txt, et prérendu au build comme le reste du site.
// =============================================================

import { site } from '../../scripts/config.mjs';

export function GET() {
  const { url } = site();

  const lines = ['User-agent: *', 'Allow: /'];

  // Sans adresse publique, pas de ligne « Sitemap » : elle ne pourrait
  // désigner qu'un chemin relatif, que les moteurs ignorent. C'est aussi
  // le cas où le plan du site n'est pas généré (voir astro.config.mjs).
  if (url) lines.push('', `Sitemap: ${url}/sitemap-index.xml`);

  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
