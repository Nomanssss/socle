// =============================================================
// fake-github.mjs - une fausse API GitHub, en mémoire, pour les tests
//
// Juste ce que github-store.mjs utilise : branches, commits, arbres,
// contenus, comparaison et fusion. Un arbre est gardé « à plat »
// (chemin → empreinte du contenu) : c'est ce que l'API renvoie avec
// `recursive=1`, et tout ce dont le stockage a besoin.
//
// Comme le vrai GitHub, une mise à jour de branche sans `force` qui
// écraserait un commit est refusée (422) - c'est ce qui permet de
// vérifier que le stockage ne perd jamais l'écriture d'un autre.
// =============================================================

import { createHash } from 'node:crypto';

/** @param {Record<string, string>} files Le contenu de départ de « main ». */
export function fakeGitHub(files) {
  const sha = (/** @type {unknown} */ value) => createHash('sha1').update(JSON.stringify(value)).digest('hex');

  /** @type {Map<string, Buffer>} */ const blobs = new Map();
  /** @type {Map<string, Record<string, string>>} */ const trees = new Map();
  /** @type {Map<string, { tree: string, parents: string[], message: string }>} */ const commits = new Map();
  /** @type {Map<string, string>} */ const refs = new Map();
  const requests = [];

  const putBlob = (/** @type {Buffer} */ content) => {
    const id = sha(['blob', content.toString('base64')]);
    blobs.set(id, content);
    return id;
  };
  const putTree = (/** @type {Record<string, string>} */ flat) => {
    const id = sha(['tree', flat]);
    trees.set(id, flat);
    return id;
  };
  const putCommit = (/** @type {string} */ tree, /** @type {string[]} */ parents, /** @type {string} */ message) => {
    const id = sha(['commit', tree, parents, message, commits.size]);
    commits.set(id, { tree, parents, message });
    return id;
  };

  const initial = {};
  for (const [path, text] of Object.entries(files)) initial[path] = putBlob(Buffer.from(text));
  refs.set('main', putCommit(putTree(initial), [], 'Départ'));

  /** Tous les ancêtres d'un commit, lui compris. */
  const ancestors = (/** @type {string} */ id) => {
    const seen = new Set();
    const stack = [id];
    while (stack.length) {
      const next = /** @type {string} */ (stack.pop());
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(...(commits.get(next)?.parents ?? []));
    }
    return seen;
  };
  const filesOf = (/** @type {string} */ commit) => /** @type {Record<string, string>} */ (trees.get(/** @type {any} */ (commits.get(commit)).tree));

  const json = (/** @type {number} */ status, /** @type {unknown} */ body) =>
    new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  /** @type {typeof fetch} */
  async function fetchFake(input, init = {}) {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const path = url.pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '');
    const body = init.body ? JSON.parse(String(init.body)) : {};
    requests.push(`${method} ${path}`);
    let m;

    if (method === 'GET' && (m = path.match(/^\/git\/ref\/heads\/(.+)$/))) {
      const name = decodeURIComponent(m[1]);
      return refs.has(name) ? json(200, { object: { sha: refs.get(name) } }) : json(404, { message: 'Not Found' });
    }
    if (method === 'POST' && path === '/git/refs') {
      const name = body.ref.replace('refs/heads/', '');
      if (refs.has(name)) return json(422, { message: 'Reference already exists' });
      refs.set(name, body.sha);
      return json(201, { object: { sha: body.sha } });
    }
    if (method === 'PATCH' && (m = path.match(/^\/git\/refs\/heads\/(.+)$/))) {
      const name = decodeURIComponent(m[1]);
      const current = refs.get(name);
      if (!current) return json(404, { message: 'Not Found' });
      if (!body.force && !ancestors(body.sha).has(current)) return json(422, { message: 'Update is not a fast forward' });
      refs.set(name, body.sha);
      return json(200, { object: { sha: body.sha } });
    }
    if (method === 'GET' && (m = path.match(/^\/git\/commits\/(\w+)$/))) {
      const commit = commits.get(m[1]);
      return commit ? json(200, { sha: m[1], tree: { sha: commit.tree }, parents: commit.parents.map((p) => ({ sha: p })) }) : json(404, {});
    }
    if (method === 'GET' && (m = path.match(/^\/git\/trees\/(\w+)$/))) {
      const flat = trees.get(m[1]);
      if (!flat) return json(404, {});
      return json(200, {
        truncated: false,
        tree: Object.entries(flat).map(([p, s]) => ({ path: p, type: 'blob', sha: s, size: /** @type {Buffer} */ (blobs.get(s)).length })),
      });
    }
    if (method === 'GET' && (m = path.match(/^\/git\/blobs\/(\w+)$/))) {
      const content = blobs.get(m[1]);
      return content ? json(200, { content: content.toString('base64'), encoding: 'base64' }) : json(404, {});
    }
    if (method === 'POST' && path === '/git/blobs') {
      return json(201, { sha: putBlob(Buffer.from(body.content, 'base64')) });
    }
    if (method === 'POST' && path === '/git/trees') {
      const flat = { ...trees.get(body.base_tree) };
      for (const entry of body.tree) {
        if (entry.sha === null) delete flat[entry.path];
        else flat[entry.path] = entry.sha;
      }
      return json(201, { sha: putTree(flat) });
    }
    if (method === 'POST' && path === '/git/commits') {
      return json(201, { sha: putCommit(body.tree, body.parents, body.message) });
    }
    if (method === 'GET' && (m = path.match(/^\/compare\/(.+)\.\.\.(.+)$/))) {
      const [baseRef, headRef] = [decodeURIComponent(m[1]), decodeURIComponent(m[2])];
      const [a, b] = [/** @type {string} */ (refs.get(baseRef)), /** @type {string} */ (refs.get(headRef))];
      const [ia, ib] = [ancestors(a), ancestors(b)];
      const [fa, fb] = [filesOf(a), filesOf(b)];
      const changed = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].filter((p) => fa[p] !== fb[p]);
      return json(200, {
        ahead_by: [...ib].filter((c) => !ia.has(c)).length,
        behind_by: [...ia].filter((c) => !ib.has(c)).length,
        files: changed.map((filename) => ({ filename })),
      });
    }
    if (method === 'POST' && path === '/merges') {
      const [baseSha, headSha] = [/** @type {string} */ (refs.get(body.base)), /** @type {string} */ (refs.get(body.head))];
      if (ancestors(baseSha).has(headSha)) return json(204, null);
      // Ancêtre commun le plus simple : le premier ancêtre de head connu de base.
      const fromBase = ancestors(baseSha);
      const common = [...ancestors(headSha)].find((c) => fromBase.has(c));
      const [fo, fbase, fhead] = [common ? filesOf(common) : {}, filesOf(baseSha), filesOf(headSha)];
      const merged = { ...fbase };
      for (const p of new Set([...Object.keys(fo), ...Object.keys(fbase), ...Object.keys(fhead)])) {
        const [o, x, y] = [fo[p], fbase[p], fhead[p]];
        if (x === y || y === o) continue;
        if (x === o) {
          if (y === undefined) delete merged[p];
          else merged[p] = y;
          continue;
        }
        return json(409, { message: 'Merge conflict' });
      }
      const commit = putCommit(putTree(merged), [baseSha, headSha], body.commit_message);
      refs.set(body.base, commit);
      return json(201, { sha: commit });
    }
    return json(404, { message: `Route non simulée : ${method} ${path}` });
  }

  return {
    fetch: fetchFake,
    requests,
    /** Le contenu d'un fichier sur une branche, ou null. */
    file(/** @type {string} */ branch, /** @type {string} */ path) {
      const id = filesOf(/** @type {string} */ (refs.get(branch)))[path];
      return id ? /** @type {Buffer} */ (blobs.get(id)).toString('utf8') : null;
    },
    /** Pousse un commit sur une branche, comme le ferait un développeur. */
    push(/** @type {string} */ branch, /** @type {Record<string, string | null>} */ changes, message = 'Poussé à la main') {
      const flat = { ...filesOf(/** @type {string} */ (refs.get(branch))) };
      for (const [p, text] of Object.entries(changes)) {
        if (text === null) delete flat[p];
        else flat[p] = putBlob(Buffer.from(text));
      }
      refs.set(branch, putCommit(putTree(flat), [/** @type {string} */ (refs.get(branch))], message));
    },
    refs,
    commits,
  };
}
