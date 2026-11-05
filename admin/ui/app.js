// =============================================================
// app.js - l'interface de l'admin
//
// Deux colonnes : le sommaire, et la leçon ouverte (en-tête et texte).
// La page elle-même s'ouvre dans un autre onglet (« Voir la page ») :
// c'est le serveur de dev qui la rend, avec les vrais composants et la
// vraie charte, et il la recharge seul à chaque enregistrement.
//
// Ce qui est affiché est désigné par l'ancre de l'adresse : une leçon
// (/admin/#module-1/lecon-1) ou la médiathèque (/admin/#medias). Un
// rechargement rouvre la même chose.
// =============================================================

import { h, EDITORS, EditorError, imagePicker } from './editors.js';
import { mountLibrary, thumbnail } from './media.js';

const API = './api';

const $ = (/** @type {string} */ selector) => /** @type {any} */ (document.querySelector(selector));

const ui = {
  toc: $('#toc'),
  empty: $('#empty'),
  form: $('#lesson-form'),
  heading: $('#lesson-heading'),
  status: $('#status'),
  save: $('#save'),
  modules: $('#modules'),
  sources: $('#sources'),
  body: $('#body'),
  chips: $('#components'),
  mdxError: $('#mdx-error'),
  viewPage: $('#view-page'),
  mediaView: $('#media-view'),
  tabLessons: $('#tab-lessons'),
  tabMedia: $('#tab-media'),
  coverThumb: $('#cover-thumb'),
  coverRemove: $('#cover-remove'),
  dialog: $('#component-dialog'),
  dialogTitle: $('#dialog-title'),
  dialogBody: $('#dialog-body'),
  dialogError: $('#dialog-error'),
};

/**
 * @type {{
 *   lessons: any[],
 *   lesson: null | { id: string, data: Record<string, any>, body: string, hash: string, locked: boolean },
 *   saved: string,
 *   parsed: { source: string, components: any[], imports: { name: string, from: string, start: number, end: number }[], importsEnd: number | null, references: string[] },
 *   saving: boolean,
 * }}
 */
const state = {
  lessons: [],
  lesson: null,
  saved: '',
  parsed: { source: '', components: [], imports: [], importsEnd: null, references: [] },
  saving: false,
};

// -------------------------------------------------------------
// Échanges avec le serveur
// -------------------------------------------------------------

/**
 * @param {string} path
 * @param {RequestInit & { json?: unknown }} [options]
 */
async function request(path, { json, ...options } = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: json === undefined ? {} : { 'Content-Type': 'application/json' },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = /** @type {any} */ (new Error(payload.error ?? `Erreur ${response.status}`));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

// -------------------------------------------------------------
// Sommaire
// -------------------------------------------------------------

async function loadToc() {
  const { lessons } = await request('/lessons');
  state.lessons = lessons;
  renderToc();
  ui.modules.replaceChildren(...[...new Set(lessons.map((l) => l.module))].map((m) => h('option', { value: m })));
}

function renderToc() {
  /** @type {Map<string, any[]>} */
  const modules = new Map();
  for (const lesson of state.lessons) {
    if (!modules.has(lesson.module)) modules.set(lesson.module, []);
    modules.get(lesson.module)?.push(lesson);
  }
  const current = state.lesson?.id;
  ui.toc.replaceChildren(
    ...[...modules].map(([module, lessons]) =>
      h(
        'section',
        { class: 'toc__module' },
        h('h2', { class: 'toc__title' }, module),
        h(
          'ol',
          { class: 'toc__list' },
          ...lessons.map((lesson) =>
            h(
              'li',
              {},
              h(
                'a',
                { class: 'toc__link', href: `#${lesson.id}`, 'aria-current': lesson.id === current ? 'page' : false },
                h('span', { class: 'toc__order' }, lesson.order ?? '·'),
                h('span', { class: 'toc__label' }, lesson.title),
                lesson.locked && h('span', { class: 'toc__lock', title: 'Verrouillée', 'aria-label': '(verrouillée)' }, '🔒')
              )
            )
          )
        )
      )
    )
  );
}

// Changer de leçon avec des modifications en cours : on demande avant.
// Le clic est intercepté plutôt que le changement d'ancre, qu'on ne
// peut plus annuler une fois qu'il a eu lieu.
ui.toc.addEventListener('click', (/** @type {MouseEvent} */ event) => {
  const link = /** @type {HTMLElement} */ (event.target).closest('a');
  if (link && isDirty() && !confirm('Des modifications ne sont pas enregistrées. Les abandonner ?')) {
    event.preventDefault();
  }
});

window.addEventListener('hashchange', route);

// La médiathèque a sa propre ancre ; toute autre ancre est une leçon.
// Quitter une leçon pour la médiathèque ne la ferme pas : ses
// modifications attendent, intactes, qu'on y revienne.
const MEDIA = 'medias';

function route() {
  const target = location.hash.slice(1);
  if (target === MEDIA) return showMedia();
  if (target) return openLesson(target);
  if (state.lesson) location.hash = state.lesson.id;
  else if (state.lessons[0]) location.hash = state.lessons[0].id;
}

/** @param {'lesson' | 'media'} view */
function showView(view) {
  const lesson = view === 'lesson';
  ui.mediaView.hidden = lesson;
  ui.form.hidden = !lesson || !state.lesson;
  ui.empty.hidden = !lesson || Boolean(state.lesson);
  ui.heading.hidden = !lesson;
  ui.viewPage.hidden = !lesson || !state.lesson;
  ui.tabLessons.setAttribute('aria-current', lesson ? 'page' : 'false');
  ui.tabMedia.setAttribute('aria-current', lesson ? 'false' : 'page');
  ui.tabLessons.href = state.lesson ? `#${state.lesson.id}` : '#';
}

let library = /** @type {null | { refresh: () => void }} */ (null);

function showMedia() {
  showView('media');
  document.title = 'Médiathèque · Admin';
  if (library) library.refresh();
  else library = mountLibrary($('#media-library'));
}

// -------------------------------------------------------------
// Ouvrir une leçon
// -------------------------------------------------------------

/** @param {string} id */
async function openLesson(id) {
  if (!id) return;
  if (id === state.lesson?.id) {
    showView('lesson');
    return;
  }
  try {
    const lesson = await request(`/lesson?id=${encodeURIComponent(id)}`);
    state.lesson = lesson;
    fillForm(lesson.data);
    ui.body.value = lesson.body;
    state.saved = snapshot();
    showView('lesson');
    ui.heading.textContent = lesson.data.title ?? id;
    document.title = `${lesson.data.title ?? id} · Admin`;
    renderToc();
    updateViewLink();
    setStatus('');
    updateDirty();
    await parseComponents();
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

// -------------------------------------------------------------
// L'en-tête, du formulaire aux données
// -------------------------------------------------------------

/** @param {Record<string, any>} data */
function fillForm(data) {
  const { elements } = ui.form;
  for (const name of ['title', 'module', 'order', 'moduleOrder', 'description', 'cover', 'coverAlt']) {
    elements[name].value = data[name] ?? '';
  }
  elements.slidePoints.value = (data.slidePoints ?? []).join('\n');
  renderCover();
  ui.sources.replaceChildren(...(data.sources ?? []).map(sourceRow));
}

/** @param {{ label?: string, url?: string }} [source] */
function sourceRow(source = {}) {
  const row = h(
    'li',
    { class: 'source' },
    h('input', { class: 'source__label', value: source.label ?? '', placeholder: 'Libellé', 'aria-label': 'Libellé de la source' }),
    h('input', { class: 'source__url', value: source.url ?? '', placeholder: 'https://…', type: 'url', 'aria-label': 'Adresse de la source' }),
    h('button', {
      type: 'button',
      class: 'icon icon--danger',
      title: 'Retirer cette source',
      'aria-label': 'Retirer cette source',
      onclick: () => {
        row.remove();
        updateDirty();
      },
    }, '✕')
  );
  return row;
}

// -------------------------------------------------------------
// La couverture, choisie dans la médiathèque
//
// Le frontmatter attend un chemin RELATIF au fichier de la leçon
// (« ../../../assets/couverture.jpg ») : on le calcule, personne n'a
// à compter les « ../ ».
// -------------------------------------------------------------

/** Le fichier de la médiathèque désigné par un chemin de couverture. */
function coverAsset(/** @type {string} */ cover) {
  const at = cover.lastIndexOf('assets/');
  return at === -1 ? null : cover.slice(at + 'assets/'.length);
}

function renderCover() {
  const cover = ui.form.elements.cover.value;
  const asset = cover && coverAsset(cover);
  ui.coverRemove.hidden = !cover;
  $('#cover-pick').textContent = cover ? 'Changer' : 'Choisir une image';
  ui.coverThumb.replaceChildren(
    asset ? thumbnail({ path: asset, name: asset }) : cover ? h('code', {}, cover) : h('span', { class: 'cover__none' }, 'Aucune')
  );
}

$('#cover-pick').addEventListener('click', async () => {
  if (!state.lesson) return;
  const current = coverAsset(ui.form.elements.cover.value);
  const picked = await openDialog(imagePicker, { path: current });
  if (!picked) return;
  const depth = state.lesson.id.split('/').length + 1;
  ui.form.elements.cover.value = `${'../'.repeat(depth)}assets/${picked.path}`;
  renderCover();
  updateDirty();
});

ui.coverRemove.addEventListener('click', () => {
  ui.form.elements.cover.value = '';
  renderCover();
  updateDirty();
});

$('#add-source').addEventListener('click', () => {
  const row = sourceRow();
  ui.sources.append(row);
  row.querySelector('input')?.focus();
  updateDirty();
});

/**
 * Les données de l'en-tête telles que le formulaire les décrit. On part
 * des données lues dans le fichier : une clé que le formulaire ne
 * connaît pas est conservée, pas effacée.
 */
function collectData() {
  const { elements } = ui.form;
  const original = state.lesson?.data ?? {};
  const data = { ...original };

  /**
   * @param {string} key
   * @param {unknown} value
   * @param {boolean} [keep] Garder la clé même vide.
   */
  const set = (key, value, keep = false) => {
    if (value === '' || value === undefined || (Array.isArray(value) && !value.length)) {
      if (keep) data[key] = value ?? '';
      else delete data[key];
    } else data[key] = value;
  };
  const text = (/** @type {string} */ name) => elements[name].value.trim();
  const number = (/** @type {string} */ name) => (text(name) === '' ? undefined : Number(text(name)));

  set('title', text('title'));
  set('module', text('module'));
  set('order', number('order'));
  set('moduleOrder', number('moduleOrder'));
  set('description', text('description'));
  set('cover', text('cover'));
  // Un texte alternatif vide a un sens (« image décorative ») : on le
  // garde vide s'il existait déjà, ou s'il accompagne une couverture.
  set('coverAlt', text('coverAlt'), 'coverAlt' in original || Boolean(text('cover')));
  set(
    'slidePoints',
    elements.slidePoints.value
      .split('\n')
      .map((/** @type {string} */ line) => line.trim())
      .filter(Boolean)
  );
  set(
    'sources',
    [...ui.sources.children]
      .map((row) => ({
        label: row.querySelector('.source__label').value.trim(),
        url: row.querySelector('.source__url').value.trim(),
      }))
      .filter((source) => source.label || source.url)
      .map((source) => (source.url ? source : { label: source.label }))
  );
  return data;
}

// -------------------------------------------------------------
// Modifications en cours, enregistrement
// -------------------------------------------------------------

function snapshot() {
  return JSON.stringify([collectData(), ui.body.value]);
}

function isDirty() {
  return Boolean(state.lesson) && snapshot() !== state.saved;
}

function updateDirty() {
  const dirty = isDirty();
  ui.save.disabled = !dirty || state.saving;
  if (dirty) setStatus('Modifications non enregistrées', 'dirty');
  else if (ui.status.dataset.tone === 'dirty') setStatus('');
}

ui.form.addEventListener('input', updateDirty);
ui.form.addEventListener('submit', (/** @type {Event} */ event) => event.preventDefault());

/** @param {boolean} [force] Écraser une modification faite ailleurs. */
async function save(force = false) {
  if (!state.lesson || state.saving || (!force && !isDirty())) return;
  state.saving = true;
  ui.save.disabled = true;
  setStatus('Enregistrement…');
  const data = collectData();
  const body = ui.body.value;
  try {
    const result = await request('/lesson', {
      method: 'PUT',
      json: { id: state.lesson.id, data, body, hash: state.lesson.hash, force },
    });
    state.lesson = { ...state.lesson, data, body, hash: result.hash };
    state.saved = snapshot();
    ui.heading.textContent = data.title;
    setStatus(`Enregistré à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, 'ok');
    loadToc();
  } catch (error) {
    if (error.payload?.conflict) {
      state.saving = false;
      const overwrite = confirm(
        `${error.message}\n\nOK : écraser avec la version de l’admin.\nAnnuler : garder le fichier, puis rouvrir la leçon pour le recharger.`
      );
      if (overwrite) return save(true);
      setStatus('Non enregistré : le fichier a changé ailleurs.', 'error');
    } else {
      setStatus(error.message, 'error');
    }
  } finally {
    state.saving = false;
    updateDirty();
  }
}

ui.save.addEventListener('click', () => save());

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
$('#save-shortcut').textContent = isMac ? '⌘S' : 'Ctrl S';

document.addEventListener('keydown', (event) => {
  if ((isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    if (!ui.dialog.open) save();
  }
});

window.addEventListener('beforeunload', (event) => {
  if (isDirty()) event.preventDefault();
});

/**
 * @param {string} message
 * @param {'' | 'ok' | 'dirty' | 'error'} [tone]
 */
function setStatus(message, tone = '') {
  ui.status.textContent = message;
  ui.status.dataset.tone = tone;
}

// -------------------------------------------------------------
// Voir la page
// -------------------------------------------------------------

// Une leçon verrouillée n'a pas de page : le lien le dit au lieu de
// mener à une 404.
function updateViewLink() {
  const lesson = state.lesson;
  if (!lesson) return;
  ui.viewPage.hidden = false;
  if (lesson.locked) {
    ui.viewPage.removeAttribute('href');
    ui.viewPage.setAttribute('aria-disabled', 'true');
    ui.viewPage.title = 'Leçon verrouillée : sa page n’est pas générée. Retirez-la de « locked » dans socle.config.json pour la voir.';
  } else {
    ui.viewPage.href = `/lecons/${lesson.id}/`;
    ui.viewPage.removeAttribute('aria-disabled');
    ui.viewPage.title = 'Ouvrir la page dans un nouvel onglet : elle se recharge à chaque enregistrement.';
  }
}

// -------------------------------------------------------------
// Composants du texte
// -------------------------------------------------------------

let parseTimer = 0;
ui.body.addEventListener('input', () => {
  clearTimeout(parseTimer);
  parseTimer = window.setTimeout(parseComponents, 400);
});

// La puce du composant sous le curseur s'allume : on sait ce qu'on
// modifiera avant de cliquer.
for (const type of ['click', 'keyup', 'select']) ui.body.addEventListener(type, highlightCurrent);

/** Analyse le texte, sauf s'il l'a déjà été tel quel. */
async function parseComponents() {
  const source = ui.body.value;
  if (source === state.parsed.source && state.parsed.components.length) return state.parsed;
  try {
    const result = await request('/components', { method: 'POST', json: { body: source } });
    // Le texte a pu changer pendant l'analyse : seule la dernière compte.
    if (ui.body.value !== source) return parseComponents();
    state.parsed = {
      source,
      components: result.components,
      imports: result.imports ?? [],
      importsEnd: result.importsEnd ?? null,
      references: result.references ?? [],
    };
    ui.mdxError.hidden = !result.error;
    ui.mdxError.textContent = result.error ?? '';
    renderChips();
  } catch (error) {
    setStatus(error.message, 'error');
  }
  return state.parsed;
}

function renderChips() {
  ui.chips.replaceChildren(
    ...state.parsed.components.map((component, index) =>
      h(
        'button',
        {
          type: 'button',
          class: `chip${component.editable && EDITORS[component.name] ? ' chip--editable' : ''}`,
          title: component.editable
            ? EDITORS[component.name]
              ? `Modifier ce composant (ligne ${component.line})`
              : `Pas encore d’éditeur pour ${component.name} : le composant est sélectionné dans le texte.`
            : component.reason,
          'data-index': String(index),
          onclick: () => editComponent(index),
        },
        component.name,
        h('small', {}, ` l.${component.line}`)
      )
    )
  );
  highlightCurrent();
}

function highlightCurrent() {
  const caret = ui.body.selectionStart;
  state.parsed.components.forEach((component, index) => {
    const inside = state.parsed.source === ui.body.value && caret >= component.start && caret <= component.end;
    ui.chips.querySelector(`[data-index="${index}"]`)?.classList.toggle('chip--current', inside);
  });
}

/** @param {number} index */
async function editComponent(index) {
  // Après une réanalyse, le composant est retrouvé par son nom et son
  // rang parmi ceux du même nom : sa position a pu bouger.
  const before = state.parsed.components[index];
  const rank = state.parsed.components.filter((c, i) => c.name === before?.name && i < index).length;
  const { components } = await parseComponents();
  const component = components.filter((c) => c.name === before?.name)[rank];
  if (!component) return;

  const editor = EDITORS[component.name];
  if (!component.editable || !editor) {
    selectRange(component.start, component.end);
    return;
  }

  const edited = await openDialog(editor, toEditor(component.props));
  if (!edited) return;
  const { props, imports } = fromEditor(edited);
  if (JSON.stringify(props) === JSON.stringify(component.props)) return;
  const { source } = await request('/component/print', {
    method: 'POST',
    json: { name: component.name, props, indent: component.indent },
  });
  replaceText(component.start, component.end, source);
  for (const { name, from } of imports) await ensureImport(name, from);
  await dropUnusedImports(refsOf(component.props));
}

$('#insert-quiz').addEventListener('click', () => insertComponent('Quiz'));
$('#insert-figure').addEventListener('click', () => insertComponent('Figure'));

/** @param {string} name */
async function insertComponent(name) {
  const editor = EDITORS[name];
  const edited = await openDialog(editor, editor.create());
  if (!edited) return;
  const { props, imports } = fromEditor(edited);
  const { source } = await request('/component/print', { method: 'POST', json: { name, props, indent: 0 } });

  // Le composant prend sa place dans son propre paragraphe : au bout de
  // la ligne du curseur, entouré de lignes vides.
  const text = ui.body.value;
  const lineEnd = text.indexOf('\n', ui.body.selectionStart);
  const at = lineEnd === -1 ? text.length : lineEnd;
  const before = text.slice(0, at);
  const after = text.slice(at);
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const tail = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  replaceText(at, at, `${lead}${source}${tail}`);

  await ensureImport(name, `@components/${name}.astro`);
  for (const imported of imports) await ensureImport(imported.name, imported.from);
}

// -------------------------------------------------------------
// Des imports aux images, et retour
//
// Dans le fichier, une figure désigne son image par un import :
//
//   import illustration from '@assets/couverture.jpg';
//   <Figure src={illustration} … />
//
// Un éditeur, lui, ne manipule que des fichiers de la médiathèque :
// { __asset: "couverture.jpg" }. toEditor() traduit dans un sens,
// fromEditor() dans l'autre - en réutilisant l'import qui existe déjà
// pour ce fichier, ou en en préparant un nouveau.
// -------------------------------------------------------------

const ASSET_IMPORT = /(?:^@assets\/|\/assets\/)(.+)$/;

/** @param {Record<string, any>} props */
function toEditor(props) {
  return Object.fromEntries(
    Object.entries(props).map(([key, value]) => {
      if (!value?.__ref) return [key, value];
      const from = state.parsed.imports.find((i) => i.name === value.__ref)?.from ?? '';
      const asset = from.match(ASSET_IMPORT)?.[1];
      return [key, asset ? { __asset: asset } : value];
    })
  );
}

/**
 * @param {Record<string, any>} props
 * @returns {{ props: Record<string, any>, imports: { name: string, from: string }[] }}
 */
function fromEditor(props) {
  /** @type {{ name: string, from: string }[]} */
  const imports = [];
  const entries = Object.entries(props).map(([key, value]) => {
    if (!value?.__asset) return [key, value];
    const from = `@assets/${value.__asset}`;
    const known = [...state.parsed.imports, ...imports].find((i) => i.from === from);
    if (known) return [key, { __ref: known.name }];
    const name = variableName(value.__asset, imports);
    imports.push({ name, from });
    return [key, { __ref: name }];
  });
  return { props: Object.fromEntries(entries), imports };
}

const RESERVED = new Set(['import', 'export', 'default', 'class', 'function', 'const', 'let', 'var', 'new', 'delete', 'this', 'true', 'false', 'null']);

/**
 * Un nom d'import tiré du nom du fichier : « schema-du-cycle.png »
 * devient « schemaDuCycle ». Il doit rester libre dans la leçon.
 *
 * @param {string} path
 * @param {{ name: string }[]} pending
 */
function variableName(path, pending) {
  const words = (path.split('/').pop() ?? 'image').replace(/\.[^.]+$/, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  let base = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w.toLowerCase())).join('') || 'image';
  if (/^\d/.test(base) || RESERVED.has(base)) base = `image${base[0].toUpperCase()}${base.slice(1)}`;
  const taken = new Set([...state.parsed.imports, ...pending].map((i) => i.name));
  let name = base;
  for (const used of state.parsed.references) taken.add(used);
  for (let n = 2; taken.has(name); n++) name = `${base}${n}`;
  return name;
}

/** @param {Record<string, any>} props */
function refsOf(props) {
  return Object.values(props)
    .filter((value) => value?.__ref)
    .map((value) => value.__ref);
}

/**
 * Retire l'import d'une image que plus rien n'utilise - après un
 * changement d'image, l'ancien import resterait sinon en tête du
 * fichier, sans raison d'être. Seuls les imports d'images sont
 * concernés, et seulement si leur nom n'apparaît plus nulle part.
 *
 * @param {string[]} names
 */
async function dropUnusedImports(names) {
  for (const name of names) {
    const { imports, references } = await parseComponents();
    const imported = imports.find((i) => i.name === name);
    if (!imported || !ASSET_IMPORT.test(imported.from) || references.includes(name)) continue;
    // La ligne entière part, saut de ligne compris.
    const end = ui.body.value[imported.end] === '\n' ? imported.end + 1 : imported.end;
    replaceText(imported.start, end, '');
  }
  await parseComponents();
}

/**
 * Ajoute un import s'il manque : après le dernier import du fichier, ou
 * en tête du texte.
 *
 * @param {string} name
 * @param {string} from
 */
async function ensureImport(name, from) {
  const { imports, importsEnd } = await parseComponents();
  if (imports.some((i) => i.name === name)) return;
  const line = `import ${name} from '${from}';`;
  if (importsEnd !== null) {
    replaceText(importsEnd, importsEnd, `\n${line}`);
  } else {
    const at = ui.body.value.match(/^\s*/)?.[0].length ?? 0;
    replaceText(at, at, `${line}\n\n`);
  }
  await parseComponents();
}

/**
 * Remplace un passage du texte en passant par l'historique du champ :
 * Ctrl+Z annule la modification d'un quiz comme une frappe.
 *
 * @param {number} start
 * @param {number} end
 * @param {string} text
 */
function replaceText(start, end, text) {
  ui.body.focus();
  ui.body.setSelectionRange(start, end);
  if (!document.execCommand('insertText', false, text)) {
    ui.body.setRangeText(text, start, end, 'end');
    ui.body.dispatchEvent(new Event('input', { bubbles: true }));
  }
  selectRange(start, start + text.length);
}

/**
 * Sélectionne un passage et le fait défiler à l'écran. La position
 * verticale se mesure sur un double invisible du champ : un <textarea>
 * ne dit pas où se trouve une ligne une fois le texte replié.
 *
 * @param {number} start
 * @param {number} end
 */
function selectRange(start, end) {
  const field = ui.body;
  const style = getComputedStyle(field);
  const mirror = h('div', {
    style: `position:absolute;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;box-sizing:border-box;width:${field.clientWidth}px;font:${style.font};line-height:${style.lineHeight};padding:${style.padding};letter-spacing:${style.letterSpacing};tab-size:${style.tabSize}`,
  }, field.value.slice(0, start));
  document.body.append(mirror);
  const top = mirror.offsetHeight;
  mirror.remove();
  field.focus();
  field.setSelectionRange(start, end);
  field.scrollTop = Math.max(0, top - field.clientHeight / 3);
  highlightCurrent();
}

// -------------------------------------------------------------
// La boîte de dialogue des éditeurs
// -------------------------------------------------------------

/**
 * Ouvre l'éditeur et rend les propriétés validées, ou null si l'on
 * annule.
 *
 * @param {any} editor
 * @param {Record<string, unknown>} props
 * @returns {Promise<Record<string, unknown> | null>}
 */
function openDialog(editor, props) {
  ui.dialogTitle.textContent = editor.label;
  ui.dialogError.hidden = true;
  const instance = editor.mount(ui.dialogBody, props);
  ui.dialog.showModal();
  /** @type {HTMLElement | null} */ (ui.dialogBody.querySelector('textarea, input'))?.focus();

  return new Promise((resolve) => {
    const form = ui.dialog.querySelector('form');
    const cancel = $('#dialog-cancel');

    const close = (/** @type {Record<string, unknown> | null} */ value) => {
      form.removeEventListener('submit', onSubmit);
      cancel.removeEventListener('click', onCancel);
      ui.dialog.removeEventListener('cancel', onCancel);
      ui.dialog.close();
      ui.dialogBody.replaceChildren();
      resolve(value);
    };
    const onCancel = (/** @type {Event} */ event) => {
      event.preventDefault();
      close(null);
    };
    const onSubmit = (/** @type {Event} */ event) => {
      event.preventDefault();
      try {
        close(instance.read());
      } catch (error) {
        if (!(error instanceof EditorError)) throw error;
        ui.dialogError.textContent = error.message;
        ui.dialogError.hidden = false;
      }
    };
    form.addEventListener('submit', onSubmit);
    cancel.addEventListener('click', onCancel);
    ui.dialog.addEventListener('cancel', onCancel);
  });
}

// -------------------------------------------------------------
// Démarrage
// -------------------------------------------------------------

await loadToc();
route();
