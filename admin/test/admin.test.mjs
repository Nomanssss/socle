// =============================================================
// Tests de l'admin - `npm run test:admin`
//
// Ce qui est vérifié ici, c'est la promesse centrale de l'admin : lire
// puis réécrire ne change rien qu'on n'ait pas demandé. Les leçons du
// cours de démonstration servent de banc d'essai - elles contiennent
// déjà chaque composant, écrit à la main.
// =============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { findComponents, printComponent } from '../server/mdx.mjs';
import { split, printFrontmatter, lessonPath, LESSONS_DIR } from '../server/lessons.mjs';

const lessons = readdirSync(LESSONS_DIR, { recursive: true })
  .filter((file) => String(file).endsWith('.mdx'))
  .map((file) => ({ file: String(file), ...split(readFileSync(join(LESSONS_DIR, String(file)), 'utf8')) }));

test('chaque composant éditable se réécrit à l’identique', () => {
  let count = 0;
  for (const { file, body } of lessons) {
    const { components, error } = findComponents(body);
    assert.equal(error, null, `${file} : ${error}`);
    for (const c of components.filter((c) => c.editable)) {
      assert.equal(printComponent(c.name, c.props, c.indent), body.slice(c.start, c.end), `${file}, ligne ${c.line}`);
      count++;
    }
  }
  assert.ok(count > 0, 'aucun composant trouvé : le banc d’essai est vide');
});

test('une valeur réécrite se relit à l’identique', () => {
  const props = {
    title: 'Un "titre" avec {accolades}',
    questions: [
      {
        question: 'L’apostrophe, les « guillemets », un \\ et un\nsaut de ligne ? 🎉',
        options: ['0', 'Deux', ''],
        answer: 2,
        explanation: 'Fin.',
      },
    ],
  };
  const text = printComponent('Quiz', props, 2);
  const [component] = findComponents(text).components;
  assert.deepEqual(component.props, props);
});

test('un composant écrit avec du code reste du texte', () => {
  const { components } = findComponents('<Quiz questions={liste.map((q) => q)} />\n\n<Figure src={[image]} alt="x" />\n');
  assert.deepEqual(
    components.map((c) => c.editable),
    [false, false]
  );
  assert.match(components[0].reason, /CallExpression/);
});

test('un import passé en propriété est lu comme une référence', () => {
  const source = '<Figure\n  src={illustration}\n  alt=""\n/>';
  const [figure] = findComponents(source).components;
  assert.equal(figure.editable, true);
  assert.deepEqual(figure.props.src, { __ref: 'illustration' });
  assert.equal(printComponent('Figure', figure.props, 0), source);
  assert.throws(() => printComponent('Figure', { src: { __ref: 'a; alert(1)' } }), /invalide/);
});

test('un MDX invalide est signalé, pas levé', () => {
  const result = findComponents('<Quiz questions={[ />\n');
  assert.equal(result.components.length, 0);
  assert.match(result.error ?? '', /ne se lit pas/);
});

test('un en-tête réécrit se relit à l’identique', () => {
  const data = {
    title: 'Deux-points : dièse # et « tiret »',
    module: '- commence par un tiret',
    moduleOrder: 2,
    order: 1,
    description: 'Une "citation"\net un saut de ligne',
    cover: '../../../assets/couverture.jpg',
    coverAlt: '',
    slidePoints: ['yes', '123', 'null'],
    sources: [
      { title: 'Une source', author: 'Son « auteur »', url: 'https://exemple.fr/?a=1#b' },
      { title: 'Un livre sans adresse' },
    ],
  };
  const parsed = matter(`---\n${printFrontmatter(data)}\n---\n`, {}).data;
  assert.deepEqual(parsed, data);
});

test('un identifiant ne sort jamais du dossier des leçons', () => {
  for (const id of ['../package', 'module-1/../../x', '..\\..\\x', 'module 1/leçon', '']) {
    assert.throws(() => lessonPath(id), /invalide/, id);
  }
  // Un chemin absolu n'est pas refusé, mais ramené DANS le dossier :
  // « /etc/passwd » désigne src/content/lecons/etc/passwd.mdx.
  for (const id of ['/etc/passwd', 'src/content/lecons/module-1/lecon-1.mdx']) {
    assert.ok(lessonPath(id).file.startsWith(`${LESSONS_DIR}/`), id);
  }
  assert.equal(lessonPath('module-1/lecon-1').id, 'module-1/lecon-1');
});

test('un import d’exemple, dans un bloc de code, n’est pas un import', () => {
  const source = [
    '',
    "import illustration from '@assets/couverture.jpg';",
    '',
    '```mdx',
    "import autre from '@assets/x.png';",
    '<Figure src={exemple} />',
    '```',
    '',
    '<Figure src={illustration} alt="" />',
    '',
  ].join('\n');
  const { imports, importsEnd, references } = findComponents(source);
  assert.deepEqual(imports.map((i) => i.name), ['illustration']);
  assert.equal(source.slice(0, importsEnd).endsWith("couverture.jpg';"), true);
  assert.deepEqual(references, ['illustration']);
});

test('un nom d’image envoyé devient un nom de fichier sûr', async () => {
  const { cleanName, mediaPath } = await import('../server/media.mjs');
  assert.equal(cleanName('Schéma n°2 (v3)'), 'schema-n-2-v3');
  assert.equal(cleanName('   '), 'image');
  for (const path of ['../package.json', '../../etc/passwd.png', 'x.exe', '']) {
    assert.throws(() => mediaPath(path), /invalide/, path);
  }
  assert.equal(mediaPath('couverture.jpg').rel, 'couverture.jpg');
});

test('l’aperçu des slides compte les mêmes slides que le build', async () => {
  const { previewSlides } = await import('../server/slides.mjs');
  const data = matter(readFileSync(join(LESSONS_DIR, 'module-3/lecon-2.mdx'), 'utf8'), {}).data;
  // Le deck écrit à la main : titre + 12 slides + fin, comme slides/module-3-lecon-2.md.
  const deck = await previewSlides({ id: 'module-3/lecon-2', data, slides: readFileSync(join(LESSONS_DIR, 'module-3/lecon-2.slides.md'), 'utf8') });
  assert.equal(deck.count, 14);
  // Sans deck : titre, points-clés, fin.
  const points = await previewSlides({ id: 'module-3/lecon-2', data: { ...data, slidePoints: ['Un', 'Deux'] }, slides: null });
  assert.equal(points.count, 3);
  assert.match(points.html, /Points clés/);
  // Le CSS déjà connu n'est pas renvoyé.
  const again = await previewSlides({ id: 'module-3/lecon-2', data, slides: null, knownCss: points.cssHash });
  assert.equal(again.css, null);
});

test('chaque tableau se réécrit à l’identique', async () => {
  const { printTable } = await import('../server/mdx.mjs');
  let count = 0;
  for (const { file, body } of lessons) {
    for (const table of findComponents(body).tables) {
      assert.equal(printTable(table.rows, table.align), body.slice(table.start, table.end), `${file}, ligne ${table.line}`);
      count++;
    }
  }
  assert.ok(count > 0, 'aucun tableau trouvé : le banc d’essai est vide');
});

test('une cellule garde son texte, « | » compris', async () => {
  const { printTable } = await import('../server/mdx.mjs');
  const source = '| a | b \\| c |\n| :--- | ---: |\n| `x\\|y` | |';
  const [table] = findComponents(`${source}\n`).tables;
  assert.deepEqual(table.rows, [['a', 'b | c'], ['`x|y`', '']]);
  assert.deepEqual(table.align, ['left', 'right']);
  assert.equal(printTable(table.rows, table.align), source);
});

test('socle.config.json : seule la clé visée change, le reste à l’octet près', async () => {
  const { replaceTopLevel } = await import('../server/settings.mjs');
  const text = [
    '{',
    '  "_locked": "Une explication qui cite \\"locked\\": [\\"x\\"] sans être la clé.",',
    '  "site": { "title": "Cours" },',
    '',
    '  "locked": ["module-4/lecon-4"]',
    '}',
    '',
  ].join('\n');

  const added = replaceTopLevel(text, 'locked', ['module-4/lecon-4', 'module-1/lecon-2']);
  assert.equal(added, text.replace('["module-4/lecon-4"]', '["module-4/lecon-4", "module-1/lecon-2"]'));

  const emptied = replaceTopLevel(text, 'locked', []);
  assert.equal(emptied, text.replace('["module-4/lecon-4"]', '[]'));

  // Clé absente : ajoutée en fin de fichier, après une ligne vide.
  const without = '{\n  "site": { "title": "Cours" }\n}\n';
  assert.equal(
    replaceTopLevel(without, 'locked', ['a/b']),
    '{\n  "site": { "title": "Cours" },\n\n  "locked": ["a/b"]\n}\n'
  );
});

test('socle.config.json réécrit en entier ressort identique', async () => {
  const { printConfig } = await import('../server/settings.mjs');
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(new URL('../../socle.config.json', import.meta.url), 'utf8');
  assert.equal(printConfig(JSON.parse(text)), text);
});

test('réglages : seuls les champs prévus changent, les erreurs sont nommées', async () => {
  const { mergeSettings } = await import('../server/settings.mjs');
  const current = {
    _site: 'aide',
    site: { title: 'Cours', tagline: '', lang: 'fr-FR', url: '', legal: { editor: '' } },
    colors: { primary: '#4647AE', text: '#112E81', page: '#ffffff' },
    fonts: { heading: 'A', body: 'B' },
    locked: ['m/l'],
    slides: { band: 'x.png' },
  };
  const { next, errors } = mergeSettings(current, {
    site: { title: '  Nouveau  ', legal: { editor: 'Moi' } },
    locked: [],
    _site: 'écrasé ?',
  });
  assert.deepEqual(errors, []);
  assert.equal(next.site.title, 'Nouveau');
  assert.equal(next.site.legal.editor, 'Moi');
  assert.deepEqual(next.locked, ['m/l']);
  assert.equal(next._site, 'aide');
  assert.deepEqual(next.slides, { band: 'x.png' });

  const bad = mergeSettings(current, { site: { url: 'mon-cours.fr' }, colors: { primary: 'bleu' } });
  assert.equal(bad.errors.length, 2);
});

test('régler un module : nom et rang réécrits dans toutes ses leçons, rien d’autre', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const root = mkdtempSync(join(tmpdir(), 'socle-module-'));
  const lessons = join(root, 'src/content/lecons');
  const write = (id, module, moduleOrder, order) => {
    mkdirSync(join(lessons, id.split('/')[0]), { recursive: true });
    writeFileSync(
      join(lessons, `${id}.mdx`),
      `---\ntitle: "${id}"\nmodule: "${module}"\nmoduleOrder: ${moduleOrder}\norder: ${order}\n---\n\nCorps de ${id}.\n`
    );
  };
  write('a/l1', 'Module A', 1, 1);
  write('a/l2', 'Module A', 1, 2);
  write('b/l1', 'Module B', 2, 1);
  write('c/l1', 'Module C', 3, 1);
  writeFileSync(join(root, 'socle.config.json'), '{ "locked": [] }\n');

  const cwd = process.cwd();
  process.chdir(root);
  try {
    // Import neuf : LESSONS_DIR se résout sur le répertoire courant.
    const { updateModule } = await import(`../server/lessons.mjs?module=${Date.now()}`);

    // Renommer A et le passer en dernier : B et C remontent.
    const result = await updateModule({ from: 'Module A', name: 'Les bases', position: 3 });
    assert.deepEqual(result.changed.sort(), ['a/l1', 'a/l2', 'b/l1', 'c/l1']);
    const l2 = readFileSync(join(lessons, 'a/l2.mdx'), 'utf8');
    assert.equal(l2, '---\ntitle: "a/l2"\nmodule: "Les bases"\nmoduleOrder: 3\norder: 2\n---\n\nCorps de a/l2.\n');
    assert.match(readFileSync(join(lessons, 'b/l1.mdx'), 'utf8'), /moduleOrder: 1\n/);

    // Un nom déjà pris est refusé, et rien n'est écrit.
    await assert.rejects(updateModule({ from: 'Les bases', name: 'Module B', position: 1 }), /fusionnerait/);
    await assert.rejects(updateModule({ from: 'Les bases', name: 'X', position: 9 }), /de 1 à 3/);

    // Les noms « Module N - … » suivent leur nouveau rang ; les autres non.
    write('d/l1', 'Module 4 - Le dernier', 4, 1);
    const moved = await updateModule({ from: 'Module 4 - Le dernier', name: 'Module 4 - Le premier', position: 1 });
    assert.equal(moved.module, 'Module 1 - Le premier');
    assert.match(readFileSync(join(lessons, 'd/l1.mdx'), 'utf8'), /module: "Module 1 - Le premier"\nmoduleOrder: 1\n/);
    assert.match(readFileSync(join(lessons, 'b/l1.mdx'), 'utf8'), /module: "Module B"\nmoduleOrder: 2\n/);
    assert.match(readFileSync(join(lessons, 'a/l1.mdx'), 'utf8'), /module: "Les bases"\nmoduleOrder: 4\n/);
  } finally {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  }
});

test('stockage local : un commit écrit tout, ou rien', async () => {
  const { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { localStore } = await import('../server/store.mjs');
  const root = mkdtempSync(join(tmpdir(), 'socle-store-'));
  const cwd = process.cwd();
  process.chdir(root);
  try {
    const store = localStore();
    writeFileSync(join(root, 'a.txt'), 'A');
    writeFileSync(join(root, 'bloque'), 'un fichier, pas un dossier');

    // Le second changement ne peut pas s'écrire (« bloque » n'est pas un
    // dossier) : le premier ne doit pas avoir eu lieu non plus.
    await assert.rejects(
      store.commit([
        { path: 'a.txt', content: 'A modifié' },
        { path: 'bloque/b.txt', content: 'B' },
      ])
    );
    assert.equal(readFileSync(join(root, 'a.txt'), 'utf8'), 'A');
    assert.deepEqual(readdirSync(root).filter((f) => f.endsWith('.tmp')), []);

    // Création dans un dossier neuf, suppression, lecture, liste.
    await store.commit([
      { path: 'neuf/c.txt', content: 'C' },
      { path: 'a.txt', content: null },
    ]);
    assert.equal(await store.read('neuf/c.txt'), 'C');
    assert.equal(existsSync(join(root, 'a.txt')), false);
    assert.equal(await store.read('a.txt'), null);
    assert.deepEqual((await store.list('neuf')).map((e) => e.path), ['neuf/c.txt']);
    assert.deepEqual(await store.list('absent'), []);
    await assert.rejects(store.read('../dehors'), /refusé/);
  } finally {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  }
});

// -------------------------------------------------------------
// Le stockage GitHub (admin en ligne), contre une fausse API
// -------------------------------------------------------------

const LESSON = (title, module, moduleOrder, order) =>
  `---\ntitle: "${title}"\nmodule: "${module}"\nmoduleOrder: ${moduleOrder}\norder: ${order}\n---\n\nCorps de ${title}.\n`;

async function githubFixture() {
  const { fakeGitHub } = await import('./fake-github.mjs');
  const { githubStore } = await import('../server/github-store.mjs');
  const github = fakeGitHub({
    'socle.config.json': '{\n  "locked": []\n}\n',
    'src/content/lecons/a/l1.mdx': LESSON('A1', 'Module 1 - A', 1, 1),
    'src/content/lecons/a/l2.mdx': LESSON('A2', 'Module 1 - A', 1, 2),
    'src/content/lecons/b/l1.mdx': LESSON('B1', 'Module 2 - B', 2, 1),
    'README.md': 'Le dépôt.\n',
  });
  const store = githubStore({ token: 'jeton', repo: 'moi/cours', fetch: github.fetch });
  return { github, store };
}

test('GitHub : le brouillon naît de main, et s’y lit comme un disque', async () => {
  const { github, store } = await githubFixture();
  assert.equal(await store.read('README.md'), 'Le dépôt.\n');
  assert.equal(await store.read('absent.md'), null);
  assert.deepEqual((await store.list('src/content/lecons/a')).map((e) => e.path).sort(), [
    'src/content/lecons/a/l1.mdx',
    'src/content/lecons/a/l2.mdx',
  ]);
  assert.ok(github.refs.has('brouillon'), 'le brouillon a été créé');
  assert.equal(github.refs.get('brouillon'), github.refs.get('main'));
});

test('GitHub : plusieurs fichiers, un seul commit, sur le brouillon seulement', async () => {
  const { github, store } = await githubFixture();
  const before = github.commits.size;
  await store.commit(
    [
      { path: 'src/content/lecons/a/l1.mdx', content: 'nouveau' },
      { path: 'src/assets/image.png', content: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
      { path: 'README.md', content: null },
    ],
    'Admin : essai'
  );
  assert.equal(github.commits.size, before + 1, 'un seul commit');
  assert.equal(github.file('brouillon', 'src/content/lecons/a/l1.mdx'), 'nouveau');
  assert.equal(github.file('brouillon', 'README.md'), null);
  assert.deepEqual([...(await store.readBytes('src/assets/image.png'))], [0x89, 0x50, 0x4e, 0x47]);
  assert.equal(github.file('main', 'src/content/lecons/a/l1.mdx'), LESSON('A1', 'Module 1 - A', 1, 1), 'main intact');
  assert.deepEqual(await store.status().then((s) => [s.ahead, s.behind]), [1, 0]);
});

test('GitHub : un commit poussé entre-temps n’est jamais écrasé', async () => {
  const { github, store } = await githubFixture();
  await store.read('README.md'); // le stockage connaît l'état du brouillon
  github.push('brouillon', { 'autre.md': 'écrit ailleurs' });
  await store.commit([{ path: 'README.md', content: 'par l’admin' }], 'Admin : essai');
  assert.equal(github.file('brouillon', 'autre.md'), 'écrit ailleurs');
  assert.equal(github.file('brouillon', 'README.md'), 'par l’admin');
});

test('GitHub : synchroniser, publier, abandonner', async () => {
  const { github, store } = await githubFixture();
  await store.read('README.md');

  // main avance sans que le brouillon ait rien : il la rejoint.
  github.push('main', { 'code.js': 'v2' });
  await store.sync();
  assert.equal(github.refs.get('brouillon'), github.refs.get('main'));

  // Une modification en attente, et main qui avance encore : fusion.
  await store.commit([{ path: 'README.md', content: 'brouillon' }], 'Admin : essai');
  github.push('main', { 'code.js': 'v3' });
  await store.sync();
  assert.equal(github.file('brouillon', 'code.js'), 'v3');
  assert.equal(github.file('brouillon', 'README.md'), 'brouillon');

  // Publier : main reçoit le brouillon.
  assert.deepEqual(await store.publish(), { published: true });
  assert.equal(github.file('main', 'README.md'), 'brouillon');
  assert.equal((await store.status()).ahead, 0);

  // Abandonner : le brouillon redevient main.
  await store.commit([{ path: 'README.md', content: 'à jeter' }], 'Admin : essai');
  await store.discard();
  assert.equal(github.refs.get('brouillon'), github.refs.get('main'));
  assert.equal(await store.read('README.md'), 'brouillon');
});

test('GitHub : les modules de l’admin écrivent sur le brouillon sans le savoir', async () => {
  const { github, store } = await githubFixture();
  const { useStore, localStore } = await import('../server/store.mjs');
  const lessons = await import('../server/lessons.mjs');
  const settings = await import('../server/settings.mjs');
  useStore(store);
  try {
    const lesson = await lessons.readLesson('a/l1');
    await lessons.writeLesson({ id: 'a/l1', data: { ...lesson.data, title: 'A1 renommée' }, body: lesson.body, hash: lesson.hash });
    assert.match(github.file('brouillon', 'src/content/lecons/a/l1.mdx'), /title: "A1 renommée"/);

    const before = github.commits.size;
    await lessons.updateModule({ from: 'Module 1 - A', name: 'Module 1 - A', position: 2 });
    assert.equal(github.commits.size, before + 1, 'tout le module en un commit');
    assert.match(github.file('brouillon', 'src/content/lecons/b/l1.mdx'), /module: "Module 1 - B"\nmoduleOrder: 1/);
    assert.match(github.file('brouillon', 'src/content/lecons/a/l2.mdx'), /module: "Module 2 - A"\nmoduleOrder: 2/);

    await settings.setLocked({ id: 'b/l1', locked: true });
    assert.deepEqual(JSON.parse(github.file('brouillon', 'socle.config.json')).locked, ['b/l1']);
    assert.equal((await lessons.listLessons()).find((l) => l.id === 'b/l1').locked, true);
    assert.equal(github.file('main', 'socle.config.json'), '{\n  "locked": []\n}\n', 'rien en ligne avant publication');
  } finally {
    useStore(localStore());
  }
});

// -------------------------------------------------------------
// La connexion de l'admin en ligne
// -------------------------------------------------------------

test('mot de passe : empreinte salée, vérification, longueur minimale', async () => {
  const { hashPassword, verifyPassword } = await import('../server/auth.mjs');
  const hash = hashPassword('un mot de passe solide');
  assert.match(hash, /^scrypt\$\d+\$\d+\$\d+\$[\w+/=]+\$[\w+/=]+$/);
  assert.notEqual(hash, hashPassword('un mot de passe solide'), 'salé : deux empreintes différentes');
  assert.equal(verifyPassword('un mot de passe solide', hash), true);
  assert.equal(verifyPassword('un mot de passe solidE', hash), false);
  assert.equal(verifyPassword('un mot de passe solide', 'n’importe quoi'), false);
  assert.throws(() => hashPassword('court'), /12 caractères/);
});

test('session : cookie signé, falsifié, expiré, mot de passe changé', async () => {
  const { hashPassword, createAuth } = await import('../server/auth.mjs');
  let now = 1_000_000;
  const secret = 's'.repeat(40);
  const passwordHash = hashPassword('un mot de passe solide');
  const auth = createAuth({ passwordHash, secret, now: () => now });
  const req = (/** @type {string} */ cookie) => /** @type {any} */ ({ headers: { cookie } });

  const login = auth.login('un mot de passe solide', '1.2.3.4');
  assert.equal(login.ok, true);
  const cookie = /** @type {any} */ (login).cookie;
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  const value = cookie.split(';')[0];
  assert.equal(auth.isAuthenticated(req(value)), true);

  const [name, payload] = value.split('=');
  const [expires, signature] = payload.split('.');
  assert.equal(auth.isAuthenticated(req(`${name}=${Number(expires) + 1e9}.${signature}`)), false, 'date repoussée');
  assert.equal(auth.isAuthenticated(req(`${name}=${expires}.${signature.slice(1)}x`)), false, 'signature altérée');
  assert.equal(auth.isAuthenticated(req('')), false);

  now += 13 * 3600 * 1000;
  assert.equal(auth.isAuthenticated(req(value)), false, 'expiré après 12 h');

  now = 1_000_000;
  const other = createAuth({ passwordHash: hashPassword('un autre mot de passe'), secret, now: () => now });
  assert.equal(other.isAuthenticated(req(value)), false, 'changer le mot de passe déconnecte');

  assert.throws(() => createAuth({ passwordHash: 'clair', secret }), /admin:password/);
  assert.throws(() => createAuth({ passwordHash, secret: 'court' }), /32 caractères/);
});

test('connexion : cinq essais, puis quinze minutes d’attente', async () => {
  const { hashPassword, createAuth } = await import('../server/auth.mjs');
  let now = 0;
  const auth = createAuth({ passwordHash: hashPassword('un mot de passe solide'), secret: 's'.repeat(40), now: () => now });
  for (let i = 0; i < 5; i++) assert.equal(auth.login('mauvais', '9.9.9.9').status, 401);
  assert.equal(auth.login('un mot de passe solide', '9.9.9.9').status, 429, 'même le bon est refusé pendant l’attente');
  assert.equal(auth.login('un mot de passe solide', '8.8.8.8').ok, true, 'une autre adresse n’est pas bloquée');
  now += 16 * 60 * 1000;
  assert.equal(auth.login('un mot de passe solide', '9.9.9.9').ok, true, 'débloqué après 15 minutes');
});

test('admin en ligne : rien sans connexion, tout avec', async () => {
  const http = await import('node:http');
  const { createHandler } = await import('../server/handler.mjs');
  const { hashPassword, createAuth } = await import('../server/auth.mjs');
  const auth = createAuth({ passwordHash: hashPassword('un mot de passe solide'), secret: 's'.repeat(40) });
  const handler = createHandler('/admin', { auth });
  const server = http.createServer((req, res) => handler(req, res, () => res.writeHead(404).end()));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;
  const go = (path, init = {}) => fetch(`${origin}${path}`, { redirect: 'manual', ...init });
  const json = { 'Content-Type': 'application/json', Origin: origin };
  try {
    const page = await (await go('/admin/')).text();
    assert.match(page, /Mot de passe/, 'la page de connexion');
    assert.doesNotMatch(page, /lesson-form/, 'pas l’admin');
    assert.equal((await go('/admin/api/lessons')).status, 401);
    assert.equal((await go('/admin/app.js')).status, 302, 'le code de l’admin reste fermé');

    assert.equal((await go('/admin/api/login', { method: 'POST', headers: json, body: '{"password":"mauvais"}' })).status, 401);
    const foreign = await go('/admin/api/login', {
      method: 'POST',
      headers: { ...json, Origin: 'https://ailleurs.example' },
      body: '{"password":"un mot de passe solide"}',
    });
    assert.equal(foreign.status, 403, 'une connexion venue d’un autre site est refusée');

    const ok = await go('/admin/api/login', { method: 'POST', headers: json, body: '{"password":"un mot de passe solide"}' });
    assert.equal(ok.status, 200);
    const cookie = String(ok.headers.get('set-cookie')).split(';')[0];
    const session = await go('/admin/api/session', { headers: { cookie } });
    assert.deepEqual(await session.json(), { online: true });
    assert.equal((await go('/admin/api/lessons', { headers: { cookie } })).status, 200);
    assert.match(await (await go('/admin/', { headers: { cookie } })).text(), /lesson-form/, 'connecté : l’admin');
    assert.equal((await go('/admin/', { headers: { cookie } })).headers.get('x-frame-options'), 'DENY');

    const out = await go('/admin/api/logout', { method: 'POST', headers: { ...json, cookie }, body: '{}' });
    assert.match(String(out.headers.get('set-cookie')), /Max-Age=0/);
  } finally {
    server.close();
  }
});
