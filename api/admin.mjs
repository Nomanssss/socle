// =============================================================
// api/admin.mjs - l'admin en ligne, en fonction Vercel
//
// Le site reste statique : Vercel le construit depuis « main » et le
// sert tel quel. Seul /admin passe par cette fonction (voir les
// réécritures de vercel.json), qui fait tourner la MÊME admin qu'en
// local, avec deux différences :
//
//   - le stockage : une branche GitHub de brouillon au lieu du disque
//     (admin/server/github-store.mjs) ;
//   - la porte : un mot de passe (admin/server/auth.mjs), là où l'admin
//     locale n'écoute que la machine elle-même.
//
// Tout se règle par variables d'environnement, dans Vercel →
// Settings → Environment Variables. Il en manque une, et la fonction
// le dit - sans jamais montrer leur valeur.
// =============================================================

import { createHandler } from '../admin/server/handler.mjs';
import { createAuth } from '../admin/server/auth.mjs';
import { githubStore } from '../admin/server/github-store.mjs';
import { useStore } from '../admin/server/store.mjs';

// Le plafond d'une requête vers une fonction Vercel est de 4,5 Mo : une
// image plus lourde serait coupée avant d'arriver. On refuse un peu avant,
// avec un message plutôt qu'une page d'erreur de Vercel.
const UPLOAD_LIMIT = 4 * 1024 * 1024;

/** Ce que la fonction attend, et ce qui manque. */
function readEnv(env = process.env) {
  const repo =
    env.GITHUB_REPO || (env.VERCEL_GIT_REPO_OWNER && env.VERCEL_GIT_REPO_SLUG
      ? `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}`
      : '');
  const missing = [
    !env.ADMIN_PASSWORD_HASH && 'ADMIN_PASSWORD_HASH',
    !env.ADMIN_SESSION_SECRET && 'ADMIN_SESSION_SECRET',
    !env.GITHUB_TOKEN && 'GITHUB_TOKEN',
    !repo && 'GITHUB_REPO',
  ].filter(Boolean);
  return {
    missing,
    repo,
    token: env.GITHUB_TOKEN,
    passwordHash: env.ADMIN_PASSWORD_HASH,
    secret: env.ADMIN_SESSION_SECRET,
    branch: env.ADMIN_DRAFT_BRANCH || 'brouillon',
    base: env.ADMIN_BASE_BRANCH || 'main',
  };
}

/** @type {null | ((req: any, res: any, next: () => void) => Promise<void>)} */
let handler = null;
/** @type {string | null} */
let setupError = null;

function setup() {
  const env = readEnv();
  if (env.missing.length) {
    setupError = `Variables manquantes dans Vercel : ${env.missing.join(', ')}. Voir le guide, « L'admin en ligne ».`;
    return;
  }
  try {
    useStore(githubStore({ token: env.token, repo: env.repo, branch: env.branch, base: env.base }));
    handler = createHandler('/admin', {
      auth: createAuth({ passwordHash: env.passwordHash, secret: env.secret }),
      uploadLimit: UPLOAD_LIMIT,
    });
  } catch (error) {
    setupError = /** @type {Error} */ (error).message;
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export default async function admin(req, res) {
  if (!handler && !setupError) setup();
  if (setupError) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`L’admin n’est pas encore configurée.\n\n${setupError}\n`);
    return;
  }

  // vercel.json réécrit /admin/<chemin> vers cette fonction en passant le
  // chemin dans « __admin » : on reconstitue l'adresse d'origine, que le
  // handler attend.
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.searchParams.get('__admin');
  url.searchParams.delete('__admin');
  const query = url.searchParams.toString();
  req.url = `/admin${path === null ? '' : `/${path}`}${query ? `?${query}` : ''}`;

  await /** @type {NonNullable<typeof handler>} */ (handler)(req, res, () => {
    res.writeHead(404).end();
  });
}

export { readEnv };
