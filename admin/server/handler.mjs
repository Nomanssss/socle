// =============================================================
// handler.mjs - les routes de l'admin et leurs garde-fous
//
// Un intermédiaire au format Connect (celui du serveur de Vite) :
// (req, res, next). Tout ce qui ne commence pas par /admin est rendu
// à Astro par `next()`.
//
// Une API qui écrit sur le disque, même locale, mérite trois verrous :
//
//   1. Seule la machine elle-même peut s'adresser à elle. Lancé avec
//      `astro dev --host`, le serveur devient joignable depuis tout le
//      réseau local - le site oui, l'admin non.
//   2. Une écriture doit venir de l'admin, et non d'une page web
//      quelconque ouverte dans le même navigateur : un site malveillant
//      peut très bien envoyer une requête vers localhost. On exige donc
//      que l'origine de la requête soit le serveur lui-même, et un corps
//      JSON (ou une image, pour la médiathèque) - ce qu'un simple
//      formulaire HTML ne sait pas produire.
//   3. Aucun chemin reçu n'est utilisé tel quel : lessons.mjs ramène
//      chaque identifiant à un fichier de src/content/lecons/, media.mjs
//      à une image de src/assets/ - ou le refuse. Hors de ces dossiers,
//      settings.mjs écrit socle.config.json, et copie dans public/photos/
//      la photo de l'auteur choisie dans la médiathèque.
// =============================================================

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listLessons, readLesson, writeLesson, updateModule, AdminError } from './lessons.mjs';
import { findComponents, printComponent, printTable } from './mdx.mjs';
import { listMedia, readMedia, uploadMedia, deleteMedia, MAX_UPLOAD } from './media.mjs';
import { readSlides, writeSlides, previewSlides, readSlideImage } from './slides.mjs';
import { setLocked, readSettings, writeSettings, pickPhoto } from './settings.mjs';
import { codemirrorBundle } from './vendor.mjs';
import { readConfig } from './store.mjs';

const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'ui');

// Les fichiers de l'interface, par leur nom public. Une liste fermée
// plutôt qu'une lecture de dossier : pas de chemin à assainir.
const UI_FILES = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/editors.js': { file: 'editors.js', type: 'text/javascript; charset=utf-8' },
  '/media.js': { file: 'media.js', type: 'text/javascript; charset=utf-8' },
  '/dom.js': { file: 'dom.js', type: 'text/javascript; charset=utf-8' },
  '/text-editor.js': { file: 'text-editor.js', type: 'text/javascript; charset=utf-8' },
  '/slides-editor.js': { file: 'slides-editor.js', type: 'text/javascript; charset=utf-8' },
  '/settings.js': { file: 'settings.js', type: 'text/javascript; charset=utf-8' },
  '/login.js': { file: 'login.js', type: 'text/javascript; charset=utf-8' },
  '/admin.css': { file: 'admin.css', type: 'text/css; charset=utf-8' },
};

// La page de connexion, servie à la place de l'admin tant qu'on n'est pas connecté.
const LOGIN_PAGE = { file: 'login.html', type: 'text/html; charset=utf-8' };

// Un corps de requête plus gros qu'une leçon ne le sera jamais.
const MAX_BODY = 2 * 1024 * 1024;

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// Ce qui reste accessible sans être connecté, en ligne : la page de
// connexion et de quoi l'afficher.
const PUBLIC_UI = new Set(['/', '/admin.css', '/login.js']);

/**
 * @param {string} base Le préfixe d'URL de l'admin (« /admin »).
 * @param {{ auth?: ReturnType<typeof import('./auth.mjs').createAuth> | null, uploadLimit?: number }} [options]
 *   `auth` : la connexion de l'admin en ligne (auth.mjs). Absente, c'est
 *   l'admin locale - réservée à la machine elle-même, sans mot de passe.
 *   `uploadLimit` : la taille maximale d'une image envoyée (plus basse en
 *   ligne, où une fonction Vercel ne reçoit pas plus de 4,5 Mo).
 */
export function createHandler(base, { auth = null, uploadLimit = MAX_UPLOAD } = {}) {
  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {() => void} next
   */
  return async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return next();

    // En local : la machine elle-même, et personne d'autre. En ligne,
    // tout le monde peut frapper à la porte - c'est la connexion qui trie.
    if (!auth && !LOOPBACK.has(req.socket.remoteAddress ?? '')) {
      return send(res, 403, { error: 'L’admin n’est accessible que depuis cette machine.' });
    }

    // « /admin » sans slash : les chemins relatifs de la page (app.js,
    // admin.css) se résoudraient à la racine du site.
    if (url.pathname === base) {
      res.writeHead(301, { Location: `${base}/` }).end();
      return;
    }

    const path = url.pathname.slice(base.length);

    try {
      if (auth) {
        if (path === '/api/login' && req.method === 'POST') {
          assertSameOrigin(req);
          const { password } = await readJson(req);
          const result = auth.login(password, clientAddress(req));
          if (!result.ok) return send(res, result.status, { error: result.message });
          res.setHeader('Set-Cookie', result.cookie);
          return send(res, 200, { ok: true });
        }
        if (path === '/api/logout' && req.method === 'POST') {
          assertSameOrigin(req);
          res.setHeader('Set-Cookie', auth.logoutCookie());
          return send(res, 200, { ok: true });
        }
        if (!auth.isAuthenticated(req)) {
          if (path.startsWith('/api/')) return send(res, 401, { error: 'Session expirée : reconnectez-vous.', login: true });
          if (req.method === 'GET' && PUBLIC_UI.has(path)) {
            return await serveUi(res, path === '/' ? LOGIN_PAGE : UI_FILES[path]);
          }
          res.writeHead(302, { Location: `${base}/` }).end();
          return;
        }
      }

      if (path === '/api/session' && req.method === 'GET') {
        return send(res, 200, { online: Boolean(auth) });
      }

      if (path.startsWith('/api/')) {
        if (req.method !== 'GET') assertSameOrigin(req);
        const route = path.slice('/api'.length);
        if (req.method === 'GET' && route === '/media/file') return serveImage(res, await readMedia(url.searchParams.get('path')));
        if (req.method === 'GET' && route === '/slides/image') return serveImage(res, await readSlideImage(url.searchParams.get('path')));
        const result = await api(req, route, url.searchParams, { uploadLimit });
        return send(res, 200, result);
      }
      if (req.method === 'GET' && UI_FILES[path]) return await serveUi(res, UI_FILES[path]);
      if (req.method === 'GET' && path === '/vendor/codemirror.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(await codemirrorBundle({ prebuilt: Boolean(auth) }));
        return;
      }
      return send(res, 404, { error: 'Rien à cette adresse.' });
    } catch (error) {
      if (error instanceof AdminError) return send(res, error.status, { error: error.message, ...error.details });
      console.error('[admin]', error);
      return send(res, 500, { error: `Erreur inattendue : ${error.message}` });
    }
  };
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {string} route
 * @param {URLSearchParams} params
 * @param {{ uploadLimit: number }} options
 */
async function api(req, route, params, { uploadLimit }) {
  const key = `${req.method} ${route}`;
  switch (key) {
    case 'GET /lessons':
      return { lessons: await listLessons() };
    case 'GET /lesson':
      return await readLesson(params.get('id') ?? '');
    case 'PUT /lesson': {
      const { id, data, body, hash, force } = await readJson(req);
      return await writeLesson({ id, data, body, hash, force });
    }
    case 'POST /components': {
      const { body } = await readJson(req);
      return findComponents(String(body ?? ''));
    }
    case 'POST /component/print': {
      const { name, props, indent } = await readJson(req);
      return { source: printComponent(name, props, indent) };
    }
    case 'POST /table/print': {
      const { rows, align } = await readJson(req);
      return { source: printTable(rows, align) };
    }
    case 'PUT /module': {
      const { from, name, position } = await readJson(req);
      return await updateModule({ from, name, position });
    }
    case 'PUT /lock': {
      const { id, locked } = await readJson(req);
      return await setLocked({ id, locked });
    }
    case 'GET /settings':
      return await readSettings();
    case 'PUT /settings': {
      const { config, hash, force } = await readJson(req);
      return await writeSettings({ config, hash, force });
    }
    case 'POST /settings/photo': {
      const { path } = await readJson(req);
      return await pickPhoto({ path });
    }
    case 'GET /media':
      return { media: await listMedia() };
    case 'POST /media':
      return { media: await uploadMedia(params.get('name'), await readBody(req, uploadLimit)) };
    case 'DELETE /media':
      return await deleteMedia(params.get('path'));
    case 'GET /slides':
      return await readSlides(params.get('id'));
    case 'PUT /slides': {
      const { id, markdown, hash, force } = await readJson(req);
      return await writeSlides({ id, markdown, hash, force });
    }
    case 'POST /slides/preview': {
      const { id, data, slides, knownCss } = await readJson(req);
      return await previewSlides({ id, data, slides, knownCss });
    }
    default:
      throw new AdminError(404, `Route inconnue : ${key}`);
  }
}

/** @param {import('node:http').IncomingMessage} req */
function assertSameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host || new URL(origin).host !== host) {
    throw new AdminError(403, 'Requête refusée : elle ne vient pas de l’admin.');
  }
  // Une suppression n'a pas de corps : son verbe suffit à imposer au
  // navigateur une vérification préalable qu'une page étrangère ne passe pas.
  if (req.method === 'DELETE') return;
  const type = String(req.headers['content-type'] ?? '');
  if (!type.startsWith('application/json') && !type.startsWith('image/')) {
    throw new AdminError(415, 'Requête refusée : un corps JSON est attendu.');
  }
}

/**
 * L'adresse du visiteur, pour limiter les essais de mot de passe. Derrière
 * Vercel, c'est le premier maillon de X-Forwarded-For.
 *
 * @param {import('node:http').IncomingMessage} req
 */
function clientAddress(req) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'inconnue';
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {number} limit
 */
async function readBody(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new AdminError(413, `Fichier trop volumineux (${Math.round(limit / 1024 / 1024)} Mo au plus).`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** @param {import('node:http').IncomingMessage} req */
async function readJson(req) {
  const body = await readBody(req, MAX_BODY);
  try {
    return JSON.parse(body.toString('utf8') || '{}');
  } catch {
    throw new AdminError(400, 'Corps de requête illisible (JSON attendu).');
  }
}

/**
 * Une image : vignette de la médiathèque, ou image citée par un deck.
 * Un SVG peut contenir du script : servi depuis l'origine de l'admin, il
 * pourrait appeler l'API. La politique de sécurité l'en empêche, même
 * ouvert seul dans un onglet.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {{ content: Buffer, type: string }} image
 */
function serveImage(res, { content, type }) {
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-cache',
  });
  res.end(content);
}

/**
 * La page est servie avec la couleur principale du cours : l'admin se
 * reconnaît comme celle de CE cours, sans dupliquer la charte.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {{ file: string, type: string }} entry
 */
async function serveUi(res, entry) {
  let content = await readFile(join(UI_DIR, entry.file), 'utf8');
  if (entry.file === 'index.html' || entry.file === 'login.html') {
    const config = await readConfig();
    const primary = /^#[0-9a-f]{3,8}$/i.test(config.colors?.primary ?? '') ? config.colors.primary : '#4647AE';
    content = content
      .replaceAll('{{PRIMARY}}', primary)
      .replaceAll('{{TITLE}}', escapeHtml(config.site?.title || 'Socle'));
  }
  res.writeHead(200, {
    'Content-Type': entry.type,
    'Cache-Control': 'no-store',
    // L'admin ne s'affiche jamais dans le cadre d'une autre page : un site
    // malveillant ne peut pas la superposer à ses boutons.
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "frame-ancestors 'none'",
  });
  res.end(content);
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 */
function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

/** @param {string} text */
function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}
