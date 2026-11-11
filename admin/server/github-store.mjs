// =============================================================
// github-store.mjs - le stockage de l'admin en ligne : une branche GitHub
//
// En ligne, il n'y a pas de disque où écrire : la fonction Vercel qui
// fait tourner l'admin repart de zéro à chaque démarrage. Les fichiers
// du cours vivent donc où ils ont toujours vécu - dans le dépôt - et
// l'admin les lit et les écrit par l'API de GitHub, sur une branche de
// brouillon (« brouillon » par défaut). Vercel construit un aperçu de
// cette branche à chaque commit ; « Publier » la verse dans « main ».
//
// Lire : l'arbre complet de la branche est demandé en une requête, puis
// le contenu de chaque fichier par son empreinte (« blob ») - immuable,
// donc gardé en cache tant que la fonction vit.
//
// Écrire : un seul commit pour tous les fichiers d'une opération (un
// module renommé touche toutes ses leçons). Il est posé sur la branche
// sans forcer : si elle a bougé entre-temps, GitHub refuse, et l'on
// recommence une fois depuis son nouvel état. Un commit est tout-ou-
// rien par nature - c'est la garantie que le stockage local imite.
// =============================================================

/**
 * @typedef {import('./store.mjs').Store} Store
 * @typedef {import('./store.mjs').Change} Change
 *
 * @typedef {{
 *   token: string,
 *   repo: string,
 *   branch?: string,
 *   base?: string,
 *   author?: { name: string, email: string },
 *   api?: string,
 *   fetch?: typeof fetch,
 * }} Options
 */

export class GitHubError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * @param {Options} options
 * @returns {Store & {
 *   branch: string,
 *   base: string,
 *   status(): Promise<{ ahead: number, behind: number, files: string[] }>,
 *   sync(): Promise<{ conflict: boolean }>,
 *   publish(message?: string): Promise<{ published: boolean }>,
 *   discard(): Promise<void>,
 *   preview(): Promise<{ state: 'building' | 'ready' | 'failed' | 'none', url: string | null }>,
 * }}
 */
export function githubStore({
  token,
  repo,
  branch = 'brouillon',
  base = 'main',
  author,
  api = 'https://api.github.com',
  fetch: http = fetch,
}) {
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) {
    throw new Error('Stockage GitHub : un jeton et un dépôt « propriétaire/nom » sont nécessaires.');
  }

  /**
   * @param {string} method
   * @param {string} path
   * @param {unknown} [body]
   */
  async function call(method, path, body) {
    const response = await http(`${api}/repos/${repo}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new GitHubError(response.status, payload.message ?? `GitHub a répondu ${response.status}.`);
    return payload;
  }

  const refPath = (/** @type {string} */ name) => `/git/ref/heads/${encodeURIComponent(name)}`;
  const refsPath = (/** @type {string} */ name) => `/git/refs/heads/${encodeURIComponent(name)}`;

  /** Le dernier commit d'une branche, ou null si elle n'existe pas. */
  async function head(/** @type {string} */ name) {
    try {
      return (await call('GET', refPath(name))).object.sha;
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return null;
      throw error;
    }
  }

  // Où en est le brouillon, gardé une seconde : afficher une page lit une
  // dizaine de fichiers, qui n'ont pas à redemander chacun l'état de la
  // branche. Chaque écriture le met à jour, chaque conflit l'oublie.
  /** @type {{ sha: string, at: number } | null} */
  let known = null;
  const remember = (/** @type {string} */ sha) => {
    known = { sha, at: Date.now() };
    return sha;
  };
  const forget = () => {
    known = null;
  };

  /** Le brouillon, créé depuis la branche de base s'il n'existe pas encore. */
  async function draftHead() {
    if (known && Date.now() - known.at < 1000) return known.sha;
    const sha = await head(branch);
    if (sha) return remember(sha);
    const from = await head(base);
    if (!from) throw new GitHubError(404, `La branche « ${base} » est introuvable dans ${repo}.`);
    await call('POST', '/git/refs', { ref: `refs/heads/${branch}`, sha: from });
    return remember(from);
  }

  /** @type {Map<string, Map<string, { sha: string, size: number }>>} */
  const trees = new Map();
  /** @type {Map<string, Buffer>} */
  const blobs = new Map();

  /** L'arbre complet d'un commit : chemin → empreinte et taille. */
  async function treeOf(/** @type {string} */ commitSha) {
    const known = trees.get(commitSha);
    if (known) return known;
    const commit = await call('GET', `/git/commits/${commitSha}`);
    const tree = await call('GET', `/git/trees/${commit.tree.sha}?recursive=1`);
    if (tree.truncated) throw new GitHubError(500, 'Le dépôt est trop gros pour être lu d’un coup par l’API de GitHub.');
    /** @type {Map<string, { sha: string, size: number }>} */
    const files = new Map();
    for (const entry of tree.tree) {
      if (entry.type === 'blob') files.set(entry.path, { sha: entry.sha, size: entry.size ?? 0 });
    }
    trees.set(commitSha, files);
    return files;
  }

  async function blob(/** @type {string} */ sha) {
    const known = blobs.get(sha);
    if (known) return known;
    const { content, encoding } = await call('GET', `/git/blobs/${sha}`);
    const bytes = Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf8');
    blobs.set(sha, bytes);
    return bytes;
  }

  async function bytesAt(/** @type {string} */ path) {
    const entry = (await treeOf(await draftHead())).get(path);
    return entry ? blob(entry.sha) : null;
  }

  /**
   * Un commit de plusieurs fichiers, posé sur le brouillon sans forcer.
   *
   * @param {Change[]} changes
   * @param {string} message
   */
  async function commitOnce(changes, message) {
    const parent = await draftHead();
    const parentCommit = await call('GET', `/git/commits/${parent}`);
    const files = await treeOf(parent);

    const entries = [];
    for (const change of changes) {
      if (change.content === null) {
        // Supprimer un fichier absent n'a pas de sens pour GitHub : on l'ignore.
        if (files.has(change.path)) entries.push({ path: change.path, mode: '100644', type: 'blob', sha: null });
        continue;
      }
      const content = Buffer.isBuffer(change.content) ? change.content : Buffer.from(change.content, 'utf8');
      const created = await call('POST', '/git/blobs', { content: content.toString('base64'), encoding: 'base64' });
      blobs.set(created.sha, content);
      entries.push({ path: change.path, mode: '100644', type: 'blob', sha: created.sha });
    }
    if (!entries.length) return;

    const tree = await call('POST', '/git/trees', { base_tree: parentCommit.tree.sha, tree: entries });
    const commit = await call('POST', '/git/commits', {
      message,
      tree: tree.sha,
      parents: [parent],
      ...(author ? { author, committer: author } : {}),
    });
    await call('PATCH', refsPath(branch), { sha: commit.sha, force: false });
    remember(commit.sha);
  }

  return {
    kind: 'github',
    branch,
    base,

    async read(path) {
      const bytes = await bytesAt(path);
      return bytes === null ? null : bytes.toString('utf8');
    },

    readBytes: bytesAt,

    async list(dir) {
      const prefix = `${dir.replace(/\/+$/, '')}/`;
      const files = await treeOf(await draftHead());
      return [...files]
        .filter(([path]) => path.startsWith(prefix))
        // L'API ne donne pas de date par fichier sans une requête de plus
        // chacun : on s'en passe, la médiathèque se rabat sur le nom.
        .map(([path, { size }]) => ({ path, size, modified: 0 }));
    },

    async commit(changes, message) {
      try {
        await commitOnce(changes, message);
      } catch (error) {
        // La branche a bougé entre la lecture et l'écriture (une autre
        // fenêtre de l'admin, un commit poussé à la main) : on repart de
        // son nouvel état, une fois.
        if (!(error instanceof GitHubError) || (error.status !== 409 && error.status !== 422)) throw error;
        forget();
        await commitOnce(changes, message);
      }
    },

    /** Ce que le brouillon a de plus (et de moins) que la branche de base. */
    async status() {
      await draftHead();
      const compare = await call('GET', `/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}`);
      return {
        ahead: compare.ahead_by,
        behind: compare.behind_by,
        files: (compare.files ?? []).map((/** @type {{ filename: string }} */ file) => file.filename),
      };
    },

    /**
     * Tient le brouillon à jour quand la base avance - du code poussé sur
     * « main », une publication faite ailleurs. Sans modification en
     * attente, il la rejoint simplement ; avec, la base y est fusionnée.
     */
    async sync() {
      forget();
      const { ahead, behind } = await this.status();
      if (!behind) return { conflict: false };
      if (!ahead) {
        await call('PATCH', refsPath(branch), { sha: await head(base), force: false });
        forget();
        return { conflict: false };
      }
      try {
        await call('POST', '/merges', {
          base: branch,
          head: base,
          commit_message: `Admin : le brouillon reprend « ${base} »`,
        });
      } catch (error) {
        // Le même passage d'un fichier a changé des deux côtés : la fusion
        // demande un humain. Le brouillon reste tel quel, et on le dit.
        if (error instanceof GitHubError && error.status === 409) return { conflict: true };
        throw error;
      }
      forget();
      return { conflict: false };
    },

    /** Verse le brouillon dans la base : le site en ligne se met à jour. */
    async publish(message = 'Admin : publication du brouillon') {
      const result = await call('POST', '/merges', { base, head: branch, commit_message: message });
      return { published: result !== null };
    },

    /**
     * L'aperçu du brouillon : Vercel déclare chaque construction à GitHub
     * (« deployments »), avec son état et son adresse. On lit celle du
     * dernier commit du brouillon.
     *
     * @returns {Promise<{ state: 'building' | 'ready' | 'failed' | 'none', url: string | null }>}
     */
    async preview() {
      const sha = await draftHead();
      const deployments = await call('GET', `/deployments?sha=${sha}&per_page=5`);
      if (!Array.isArray(deployments) || !deployments.length) return { state: 'none', url: null };
      const statuses = await call('GET', `/deployments/${deployments[0].id}/statuses?per_page=1`);
      const latest = Array.isArray(statuses) ? statuses[0] : null;
      const state =
        latest?.state === 'success' ? 'ready'
        : latest?.state === 'failure' || latest?.state === 'error' ? 'failed'
        : 'building';
      return { state, url: latest?.environment_url || latest?.target_url || null };
    },

    /** Abandonne le brouillon : il redevient la copie exacte de la base. */
    async discard() {
      const sha = await head(base);
      if (!sha) throw new GitHubError(404, `La branche « ${base} » est introuvable dans ${repo}.`);
      if (await head(branch)) await call('PATCH', refsPath(branch), { sha, force: true });
      else await call('POST', '/git/refs', { ref: `refs/heads/${branch}`, sha });
      forget();
    },
  };
}
