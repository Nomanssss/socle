// =============================================================
// auth.mjs - le mot de passe de l'admin en ligne
//
// En local, l'admin n'écoute que la machine elle-même : pas besoin de
// mot de passe. En ligne, n'importe qui peut atteindre /admin - il faut
// donc se connecter.
//
// Un seul mot de passe par cours. Il n'est écrit nulle part en clair :
// la variable d'environnement ADMIN_PASSWORD_HASH n'en contient que
// l'empreinte (scrypt, salée), fabriquée par `npm run admin:password`.
//
// Une fois connecté, la session tient dans un cookie signé : une date
// d'expiration et une signature HMAC (secret ADMIN_SESSION_SECRET). Rien
// à stocker côté serveur - la fonction Vercel ne garde rien d'un appel
// à l'autre. La signature dépend aussi de l'empreinte du mot de passe :
// le changer déconnecte toutes les sessions ouvertes.
// =============================================================

import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

const COOKIE = 'socle_admin';
const SESSION_HOURS = 12;

// scrypt : coûteux par construction, pour qu'une empreinte volée ne se
// casse pas en essayant des millions de mots de passe par seconde.
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 32 };
const scrypt = (/** @type {string} */ password, /** @type {Buffer} */ salt, params = SCRYPT) =>
  scryptSync(password.normalize('NFC'), salt, params.keylen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 128 * params.N * params.r * 2,
  });

/**
 * L'empreinte d'un mot de passe, au format
 * « scrypt$N$r$p$sel$empreinte » (sel et empreinte en base64).
 *
 * @param {string} password
 */
export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('Le mot de passe doit faire au moins 12 caractères.');
  }
  const salt = randomBytes(16);
  const key = scrypt(password, salt);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

/**
 * Le mot de passe correspond-il à l'empreinte ? Comparaison à temps
 * constant : la durée de la réponse ne trahit rien.
 *
 * @param {string} password
 * @param {string} stored
 */
export function verifyPassword(password, stored) {
  const [kind, N, r, p, salt, key] = String(stored ?? '').split('$');
  if (kind !== 'scrypt' || !salt || !key || typeof password !== 'string') return false;
  const expected = Buffer.from(key, 'base64');
  const actual = scrypt(password, Buffer.from(salt, 'base64'), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    keylen: expected.length,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * La connexion de l'admin en ligne.
 *
 * @param {{ passwordHash: string, secret: string, now?: () => number }} options
 */
export function createAuth({ passwordHash, secret, now = Date.now }) {
  if (!String(passwordHash ?? '').startsWith('scrypt$')) {
    throw new Error('ADMIN_PASSWORD_HASH manque ou n’est pas une empreinte : lancez « npm run admin:password ».');
  }
  if (String(secret ?? '').length < 32) {
    throw new Error('ADMIN_SESSION_SECRET manque ou est trop court (32 caractères au moins) : lancez « npm run admin:password ».');
  }

  const sign = (/** @type {string} */ expires) =>
    createHmac('sha256', secret).update(`${expires}.${passwordHash}`).digest('base64url');

  // Les échecs, par adresse : 5 essais, puis 15 minutes d'attente. En
  // mémoire seulement - une fonction Vercel peut en avoir plusieurs
  // copies, chacune avec son compte. C'est un frein, pas un mur : le mur,
  // c'est la longueur du mot de passe et le coût de scrypt.
  /** @type {Map<string, { count: number, until: number }>} */
  const failures = new Map();
  const LIMIT = 5;
  const WINDOW = 15 * 60 * 1000;

  return {
    /**
     * La requête porte-t-elle une session valide ?
     *
     * @param {import('node:http').IncomingMessage} req
     */
    isAuthenticated(req) {
      const value = readCookie(req, COOKIE);
      if (!value) return false;
      const [expires, signature] = value.split('.');
      if (!expires || !signature || Number(expires) < now()) return false;
      const expected = Buffer.from(sign(expires));
      const actual = Buffer.from(signature);
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    },

    /**
     * Tente une connexion. Rend le cookie à poser, ou une raison de refus.
     *
     * @param {unknown} password
     * @param {string} address L'adresse du visiteur, pour limiter les essais.
     * @returns {{ ok: true, cookie: string } | { ok: false, status: number, message: string }}
     */
    login(password, address) {
      const entry = failures.get(address);
      if (entry && entry.count >= LIMIT && entry.until > now()) {
        const minutes = Math.ceil((entry.until - now()) / 60000);
        return { ok: false, status: 429, message: `Trop d’essais : réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.` };
      }
      if (typeof password === 'string' && verifyPassword(password, passwordHash)) {
        failures.delete(address);
        const expires = String(now() + SESSION_HOURS * 3600 * 1000);
        return { ok: true, cookie: sessionCookie(`${expires}.${sign(expires)}`, SESSION_HOURS * 3600) };
      }
      const count = entry && entry.until > now() ? entry.count + 1 : 1;
      failures.set(address, { count, until: now() + WINDOW });
      return { ok: false, status: 401, message: 'Mot de passe incorrect.' };
    },

    /** Le cookie qui efface la session. */
    logoutCookie() {
      return sessionCookie('', 0);
    },
  };
}

/**
 * HttpOnly : invisible au JavaScript de la page. Secure : envoyé en HTTPS
 * seulement. SameSite=Strict : jamais joint à une requête partie d'un
 * autre site. Path=/admin : le site public ne le reçoit pas.
 *
 * @param {string} value
 * @param {number} maxAge En secondes ; 0 efface le cookie.
 */
function sessionCookie(value, maxAge) {
  return `${COOKIE}=${value}; Path=/admin; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {string} name
 */
function readCookie(req, name) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}
