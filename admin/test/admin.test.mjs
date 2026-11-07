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
