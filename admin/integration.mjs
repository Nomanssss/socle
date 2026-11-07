// =============================================================
// integration.mjs - l'admin, branchée sur le serveur de dev
//
// L'admin n'est PAS une page du site : c'est un intermédiaire posé
// devant le serveur de développement d'Astro, le temps d'un
// `npm run dev`. Le crochet `astro:server:setup` n'est appelé que par
// ce serveur-là - ni `astro build`, ni `astro preview` ne le
// déclenchent. Rien de l'admin ne peut donc se retrouver dans dist/,
// et le site livré reste aussi statique qu'avant.
//
// Tout ce qui arrive sous /admin/ est traité ici (interface et API),
// le reste passe à Astro sans avoir été touché.
// =============================================================

import { resolve } from 'node:path';
import { createHandler } from './server/handler.mjs';
import { CONFIG_FILE } from './server/settings.mjs';

export const ADMIN_PATH = '/admin';

/** @returns {import('astro').AstroIntegration} */
export default function admin() {
  return {
    name: 'socle-admin',
    hooks: {
      'astro:server:setup': ({ server, logger }) => {
        server.middlewares.use(createHandler(ADMIN_PATH));
        logger.info(`Admin disponible sur ${ADMIN_PATH}/ (serveur de dev uniquement).`);

        // socle.config.json décide des pages qui existent (« locked ») :
        // une leçon verrouillée n'a pas de page. Mais le serveur de dev
        // garde en cache la liste des pages, et ne surveille pas ce
        // fichier - lu par config.mjs, hors du graphe de modules de Vite.
        // Sans ce qui suit, une leçon verrouillée depuis l'admin (ou à la
        // main) restait servie jusqu'au redémarrage du serveur.
        //
        // On surveille donc le fichier, et à chaque changement on envoie
        // au serveur l'événement qu'Astro écoute pour vider ce cache, puis
        // on recharge les pages ouvertes dans le navigateur.
        server.watcher.add(CONFIG_FILE);
        server.watcher.on('change', (file) => {
          if (resolve(file) !== CONFIG_FILE) return;
          server.environments.ssr?.hot.send('astro:content-changed', {});
          server.environments.client?.hot.send({ type: 'full-reload', path: '*' });
        });
      },
    },
  };
}
