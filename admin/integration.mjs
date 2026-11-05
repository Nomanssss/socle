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

import { createHandler } from './server/handler.mjs';

export const ADMIN_PATH = '/admin';

/** @returns {import('astro').AstroIntegration} */
export default function admin() {
  return {
    name: 'socle-admin',
    hooks: {
      'astro:server:setup': ({ server, logger }) => {
        server.middlewares.use(createHandler(ADMIN_PATH));
        logger.info(`Admin disponible sur ${ADMIN_PATH}/ (serveur de dev uniquement).`);
      },
    },
  };
}
