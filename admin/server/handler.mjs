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
//      JSON - qu'un simple formulaire HTML ne sait pas produire.
//   3. Aucun chemin reçu n'est utilisé tel quel : lessons.mjs ramène
//      chaque identifiant à un fichier de src/content/lecons/, ou le
//      refuse.
// =============================================================

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listLessons, readLesson, writeLesson, AdminError } from './lessons.mjs';
import { findComponents, printComponent } from './mdx.mjs';
import { readConfig } from '../../scripts/config.mjs';

const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'ui');

// Les fichiers de l'interface, par leur nom public. Une liste fermée
// plutôt qu'une lecture de dossier : pas de chemin à assainir.
const UI_FILES = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/editors.js': { file: 'editors.js', type: 'text/javascript; charset=utf-8' },
  '/admin.css': { file: 'admin.css', type: 'text/css; charset=utf-8' },
};

// Un corps de requête plus gros qu'une leçon ne le sera jamais.
const MAX_BODY = 2 * 1024 * 1024;

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** @param {string} base Le préfixe d'URL de l'admin (« /admin »). */
export function createHandler(base) {
  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {() => void} next
   */
  return async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return next();

    if (!LOOPBACK.has(req.socket.remoteAddress ?? '')) {
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
      if (path.startsWith('/api/')) {
        if (req.method !== 'GET') assertSameOrigin(req);
        const result = await api(req, path.slice('/api'.length), url.searchParams);
        return send(res, 200, result);
      }
      if (req.method === 'GET' && UI_FILES[path]) return await serveUi(res, UI_FILES[path]);
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
 */
async function api(req, route, params) {
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
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
    throw new AdminError(415, 'Requête refusée : un corps JSON est attendu.');
  }
}

/** @param {import('node:http').IncomingMessage} req */
async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new AdminError(413, 'Requête trop volumineuse.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new AdminError(400, 'Corps de requête illisible (JSON attendu).');
  }
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
  if (entry.file === 'index.html') {
    const config = readConfig();
    const primary = /^#[0-9a-f]{3,8}$/i.test(config.colors?.primary ?? '') ? config.colors.primary : '#4647AE';
    content = content
      .replaceAll('{{PRIMARY}}', primary)
      .replaceAll('{{TITLE}}', escapeHtml(config.site?.title || 'Socle'));
  }
  res.writeHead(200, { 'Content-Type': entry.type, 'Cache-Control': 'no-store' });
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
