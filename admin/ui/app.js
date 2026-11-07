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

import { h, EDITORS, EditorError, imagePicker, tableEditor } from './editors.js';
import { mountLibrary, thumbnail } from './media.js';
import { createPlainEditor, createRichEditor } from './text-editor.js';

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
  bodyField: $('#body'),
  bodyHost: $('#body-host'),
  formatBar: $('#format-bar'),
  plainMode: $('#plain-mode'),
  chips: $('#components'),
  mdxError: $('#mdx-error'),
  viewPage: $('#view-page'),
  mediaView: $('#media-view'),
  tabLessons: $('#tab-lessons'),
  tabMedia: $('#tab-media'),
  coverThumb: $('#cover-thumb'),
  tabPage: $('#tab-page'),
  tabSlides: $('#tab-slides'),
  pagePanel: $('#page-panel'),
  slidesPanel: $('#slides-panel'),
  slidesPoints: $('#slides-points'),
  slidesDeck: $('#slides-deck'),
  slidesText: $('#slides-text'),
  slidesHost: $('#slides-host'),
  slidesFormatBar: $('#slides-format-bar'),
  slidesFrame: $('#slides-frame'),
  slidesStatus: $('#slides-status'),
  slidesError: $('#slides-error'),
  slidesCount: $('#slides-count'),
  slideTemplates: $('#slide-templates'),
  slideAdd: $('#slide-add'),
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
 *   slides: { exists: boolean, hash: string | null, deck: boolean },
 *   savedSlides: string,
 *   tab: 'page' | 'slides',
 *   css: { hash: string | null, text: string },
 *   parsed: { source: string, components: any[], imports: { name: string, from: string, start: number, end: number }[], importsEnd: number | null, references: string[], tables: { start: number, end: number, line: number, rows: string[][], align: (string | null)[] }[] },
 *   saving: boolean,
 * }}
 */
const state = {
  lessons: [],
  lesson: null,
  saved: '',
  slides: { exists: false, hash: null, deck: false },
  savedSlides: '',
  tab: 'page',
  css: { hash: null, text: '' },
  parsed: { source: '', components: [], imports: [], importsEnd: null, references: [], tables: [] },
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
              { class: lesson.locked ? 'toc__item is-locked' : 'toc__item' },
              h(
                'a',
                { class: 'toc__link', href: `#${lesson.id}`, 'aria-current': lesson.id === current ? 'page' : false },
                h('span', { class: 'toc__order' }, lesson.order ?? '·'),
                h('span', { class: 'toc__label' }, lesson.title),
                lesson.locked && h('span', { class: 'visually-hidden' }, ' (verrouillée)')
              ),
              // Le verrou est un bouton à part, à côté du lien : un bouton
              // dans un lien n'est ni valide ni atteignable au clavier.
              h(
                'button',
                {
                  type: 'button',
                  class: 'toc__lock',
                  'aria-pressed': String(lesson.locked),
                  'aria-label': `${lesson.locked ? 'Déverrouiller' : 'Verrouiller'} « ${lesson.title} »`,
                  title: lesson.locked
                    ? 'Verrouillée : sa page et ses slides ne sont pas générées. Cliquer pour la rouvrir.'
                    : 'Verrouiller : la leçon reste annoncée au sommaire, mais sa page et ses slides ne sont plus générées.',
                  onclick: () => toggleLock(lesson),
                },
                lesson.locked ? '🔒' : '🔓'
              )
            )
          )
        )
      )
    )
  );
}

/**
 * Verrouille ou déverrouille une leçon : l'admin écrit « locked » dans
 * socle.config.json, et le serveur de dev en tient compte aussitôt - la
 * page passe en 404, ou revient.
 *
 * @param {{ id: string, title: string, locked: boolean }} lesson
 */
async function toggleLock(lesson) {
  const locked = !lesson.locked;
  try {
    await request('/lock', { method: 'PUT', json: { id: lesson.id, locked } });
  } catch (error) {
    setStatus(/** @type {Error} */ (error).message, 'error');
    return;
  }
  lesson.locked = locked;
  if (state.lesson?.id === lesson.id) {
    state.lesson.locked = locked;
    updateViewLink();
  }
  renderToc();
  // Le focus suit le bouton redessiné : sans ça, il retombe en haut de page.
  [...ui.toc.querySelectorAll('.toc__lock')]
    .find((button) => button.getAttribute('aria-label')?.endsWith(`« ${lesson.title} »`))
    ?.focus();
  setStatus(
    locked
      ? `« ${lesson.title} » est verrouillée : sa page n’est plus générée.`
      : `« ${lesson.title} » est rouverte.`,
    'ok'
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
    const [lesson, slides] = await Promise.all([
      request(`/lesson?id=${encodeURIComponent(id)}`),
      request(`/slides?id=${encodeURIComponent(id)}`),
    ]);
    state.lesson = lesson;
    fillForm(lesson.data);
    body.value = lesson.body;
    state.saved = snapshot();
    state.slides = { exists: slides.exists, hash: slides.hash, deck: slides.exists };
    slidesBody.value = slides.markdown;
    state.savedSlides = slidesSnapshot();
    renderSlidesMode();
    showView('lesson');
    ui.heading.textContent = lesson.data.title ?? id;
    document.title = `${lesson.data.title ?? id} · Admin`;
    renderToc();
    updateViewLink();
    setStatus('');
    updateDirty();
    if (state.tab === 'slides') previewNow();
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

/**
 * Une source : son titre (seul requis), son auteur et son adresse, tous deux
 * facultatifs - un livre n'a pas toujours d'adresse.
 *
 * @param {{ title?: string, author?: string, url?: string }} [source]
 */
function sourceRow(source = {}) {
  const row = h(
    'li',
    { class: 'source' },
    h('input', { class: 'source__title', value: source.title ?? '', placeholder: 'Titre', 'aria-label': 'Titre de la source' }),
    h('input', { class: 'source__author', value: source.author ?? '', placeholder: 'Auteur (facultatif)', 'aria-label': 'Auteur de la source' }),
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
        title: row.querySelector('.source__title').value.trim(),
        author: row.querySelector('.source__author').value.trim(),
        url: row.querySelector('.source__url').value.trim(),
      }))
      .filter((source) => source.title || source.author || source.url)
      // Les champs vides ne sont pas écrits : « author: "" » dans l'en-tête
      // serait du bruit, et le schéma veut un titre ou rien.
      .map(({ title, author, url }) => ({ title, ...(author && { author }), ...(url && { url }) }))
  );
  return data;
}

// -------------------------------------------------------------
// Modifications en cours, enregistrement
// -------------------------------------------------------------

function snapshot() {
  return JSON.stringify([collectData(), body.value]);
}

/** Le deck tel que l'interface le décrit : écrit à la main (et son texte), ou non. */
function slidesSnapshot() {
  return JSON.stringify(state.slides.deck ? slidesBody.value : null);
}

function isDirty() {
  return Boolean(state.lesson) && (snapshot() !== state.saved || slidesSnapshot() !== state.savedSlides);
}

function updateDirty() {
  const dirty = isDirty();
  ui.save.disabled = !dirty || state.saving;
  if (dirty) setStatus('Modifications non enregistrées', 'dirty');
  else if (ui.status.dataset.tone === 'dirty') setStatus('');
}

ui.form.addEventListener('input', updateDirty);
ui.form.addEventListener('submit', (/** @type {Event} */ event) => event.preventDefault());

/**
 * Enregistre ce qui a changé : la leçon (en-tête et texte), son deck,
 * ou les deux - chacun dans son fichier, chacun avec sa détection de
 * conflit.
 *
 * @param {'' | 'lesson' | 'slides'} [force] La partie à écraser malgré un conflit.
 */
async function save(force = '') {
  if (!state.lesson || state.saving) return;
  const lessonChanged = force === 'lesson' || snapshot() !== state.saved;
  const slidesChanged = force === 'slides' || slidesSnapshot() !== state.savedSlides;
  if (!lessonChanged && !slidesChanged) return;

  state.saving = true;
  ui.save.disabled = true;
  setStatus('Enregistrement…');
  /** @type {'lesson' | 'slides'} */
  let part = 'lesson';
  try {
    if (lessonChanged) {
      const data = collectData();
      const text = body.value;
      const result = await request('/lesson', {
        method: 'PUT',
        json: { id: state.lesson.id, data, body: text, hash: state.lesson.hash, force: force === 'lesson' },
      });
      state.lesson = { ...state.lesson, data, body: text, hash: result.hash };
      state.saved = snapshot();
      ui.heading.textContent = data.title;
      loadToc();
    }
    if (slidesChanged) {
      part = 'slides';
      const markdown = state.slides.deck ? slidesBody.value : null;
      const result = await request('/slides', {
        method: 'PUT',
        json: { id: state.lesson.id, markdown, hash: state.slides.hash, force: force === 'slides' },
      });
      state.slides = { ...state.slides, exists: result.exists, hash: result.hash };
      state.savedSlides = slidesSnapshot();
    }
    setStatus(`Enregistré à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, 'ok');
  } catch (error) {
    if (error.payload?.conflict) {
      state.saving = false;
      const overwrite = confirm(
        `${error.message}\n\nOK : écraser avec la version de l’admin.\nAnnuler : garder le fichier, puis rouvrir la leçon pour le recharger.`
      );
      if (overwrite) return save(part);
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
    ui.viewPage.title = 'Leçon verrouillée : sa page n’est pas générée. Déverrouillez-la depuis le sommaire (🔒) pour la voir.';
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
ui.bodyHost.addEventListener('input', () => {
  clearTimeout(parseTimer);
  parseTimer = window.setTimeout(parseComponents, 400);
});

// La puce du composant sous le curseur s'allume : on sait ce qu'on
// modifiera avant de cliquer.
ui.bodyHost.addEventListener('caret', highlightCurrent);

/** Analyse le texte, sauf s'il l'a déjà été tel quel. */
async function parseComponents() {
  const source = body.value;
  if (source === state.parsed.source && state.parsed.components.length) return state.parsed;
  try {
    const result = await request('/components', { method: 'POST', json: { body: source } });
    // Le texte a pu changer pendant l'analyse : seule la dernière compte.
    if (body.value !== source) return parseComponents();
    state.parsed = {
      source,
      components: result.components,
      imports: result.imports ?? [],
      importsEnd: result.importsEnd ?? null,
      references: result.references ?? [],
      tables: result.tables ?? [],
    };
    ui.mdxError.hidden = !result.error;
    ui.mdxError.textContent = result.error ?? '';
    renderChips();
    body.setComponents(state.parsed.components, state.parsed.imports, state.parsed.tables);
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
  const caret = body.selectionStart;
  state.parsed.components.forEach((component, index) => {
    const inside = state.parsed.source === body.value && caret >= component.start && caret <= component.end;
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
    body.select(component.start, component.end);
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

// Ce qu'on peut insérer dans le texte, dans l'ordre où on en a besoin :
// l'image d'abord, le plus courant.
const INSERTABLE = [
  { name: 'Figure', label: 'Image', hint: 'Une image de la médiathèque, avec sa description' },
  { name: 'Quiz', label: 'Quiz', hint: 'Un QCM auto-corrigé, relié à la progression' },
  { name: 'Timeline', label: 'Frise', hint: 'Des étapes qui se déplient' },
  { name: 'Flashcards', label: 'Cartes de révision', hint: 'Recto, verso : on retourne la carte' },
  { name: 'DragMatch', label: 'Association', hint: 'Relier deux colonnes par glisser-déposer' },
];

const insertList = $('#insert-list');
const insertAdd = $('#insert-add');
insertList.replaceChildren(
  ...INSERTABLE.map(({ name, label, hint }) =>
    h(
      'li',
      {},
      h(
        'button',
        {
          type: 'button',
          class: 'menu__item',
          'data-insert': name,
          onclick: () => {
            toggleInsertMenu(false);
            insertComponent(name);
          },
        },
        h('strong', {}, label),
        h('span', {}, hint)
      )
    )
  )
);

/** @param {boolean} open */
function toggleInsertMenu(open) {
  insertList.hidden = !open;
  insertAdd.setAttribute('aria-expanded', String(open));
  if (open) insertList.querySelector('button')?.focus();
}

insertAdd.addEventListener('click', () => toggleInsertMenu(insertList.hidden));
document.addEventListener('click', (event) => {
  if (!$('#insert-menu').contains(event.target)) toggleInsertMenu(false);
});
insertList.addEventListener('keydown', (/** @type {KeyboardEvent} */ event) => {
  if (event.key === 'Escape') {
    toggleInsertMenu(false);
    insertAdd.focus();
  }
});

/** @param {string} name */
async function insertComponent(name) {
  const editor = EDITORS[name];
  const edited = await openDialog(editor, editor.create());
  if (!edited) return;
  const { props, imports } = fromEditor(edited);
  const { source } = await request('/component/print', { method: 'POST', json: { name, props, indent: 0 } });
  await insertBlock(source);
  await ensureImport(name, `@components/${name}.astro`);
  for (const imported of imports) await ensureImport(imported.name, imported.from);
}

/**
 * Pose un bloc (composant, tableau) dans son propre paragraphe : au bout
 * de la ligne du curseur, entouré de lignes vides - et jamais au-dessus
 * des imports, qui ouvrent le fichier.
 *
 * @param {string} source
 */
async function insertBlock(source) {
  const { importsEnd } = await parseComponents();
  const text = body.value;
  const lineEnd = text.indexOf('\n', Math.max(body.selectionStart, importsEnd ?? 0));
  const at = lineEnd === -1 ? text.length : lineEnd;
  const before = text.slice(0, at);
  const after = text.slice(at);
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const tail = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  replaceText(at, at, `${lead}${source}${tail}`);
}

// -------------------------------------------------------------
// Les tableaux
//
// Un tableau Markdown s'écrit en alignant des « | » à la main : c'est
// précisément ce qu'on ne veut pas demander. Il s'édite dans une grille,
// et l'admin réécrit le tableau - lui seul, comme un composant.
// -------------------------------------------------------------

/** @param {number} index */
async function editTable(index) {
  const before = state.parsed.tables[index];
  const { tables } = await parseComponents();
  // Le tableau a pu bouger : on le retrouve par son rang.
  const table = tables[index];
  if (!table || !before) return;
  const edited = await openDialog(tableEditor, { rows: table.rows, align: table.align });
  if (!edited) return;
  if (JSON.stringify([edited.rows, edited.align]) === JSON.stringify([table.rows, table.align])) return;
  const { source } = await request('/table/print', { method: 'POST', json: edited });
  replaceText(table.start, table.end, source);
}

async function insertTable() {
  const edited = await openDialog(tableEditor, tableEditor.create());
  if (!edited) return;
  const { source } = await request('/table/print', { method: 'POST', json: edited });
  await insertBlock(source);
}

/** @param {number} index */
async function deleteTable(index) {
  const table = state.parsed.tables[index];
  if (!table || state.parsed.source !== body.value) return;
  if (!confirm('Supprimer ce tableau ?')) return;
  let end = table.end;
  while (body.value[end] === '\n' && end - table.end < 2) end++;
  replaceText(table.start, end, '');
}

/**
 * L'aperçu d'un tableau dans sa carte : le vrai tableau, en petit, ses
 * premières lignes seulement. Les marques de gras et de code sont
 * retirées - c'est un aperçu, pas un rendu.
 *
 * @param {{ rows: string[][], align: (string | null)[] }} table
 */
function tableCard(table) {
  const plain = (/** @type {string} */ text) => text.replace(/\*\*|__|`/g, '');
  const [head, ...rest] = table.rows;
  const shown = rest.slice(0, 4);
  return h(
    'div',
    { class: 'card-widget__table' },
    h(
      'table',
      {},
      h('thead', {}, h('tr', {}, ...head.map((cell, i) => h('th', { style: `text-align:${table.align[i] ?? 'left'}` }, plain(cell))))),
      h('tbody', {}, ...shown.map((row) => h('tr', {}, ...row.map((cell, i) => h('td', { style: `text-align:${table.align[i] ?? 'left'}` }, plain(cell))))))
    ),
    rest.length > shown.length ? h('span', {}, `… et ${rest.length - shown.length} ligne${rest.length - shown.length > 1 ? 's' : ''} de plus`) : null
  );
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
    const end = body.value[imported.end] === '\n' ? imported.end + 1 : imported.end;
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
    const at = body.value.match(/^\s*/)?.[0].length ?? 0;
    replaceText(at, at, `${line}\n\n`);
  }
  await parseComponents();
}

/**
 * Remplace un passage du texte. Annulable par Ctrl+Z, comme une frappe,
 * quel que soit l'éditeur affiché.
 *
 * @param {number} start
 * @param {number} end
 * @param {string} text
 */
function replaceText(start, end, text) {
  body.replace(start, end, text);
  highlightCurrent();
}

/**
 * Retire un composant du texte, avec la ligne vide qui le séparait du
 * paragraphe suivant - et l'import d'image qui ne sert plus.
 *
 * @param {number} index
 */
async function deleteComponent(index) {
  const component = state.parsed.components[index];
  if (!component || state.parsed.source !== body.value) return;
  if (!confirm(`Supprimer ce composant (${component.name}) ?`)) return;
  const text = body.value;
  let end = component.end;
  while (text[end] === '\n' && end - component.end < 2) end++;
  replaceText(component.start, end, '');
  await dropUnusedImports(refsOf(component.props ?? {}));
}

// -------------------------------------------------------------
// L'éditeur du texte : riche (CodeMirror) ou brut
//
// Le choix est mémorisé dans le navigateur : c'est une préférence de
// qui écrit, pas un réglage du cours.
// -------------------------------------------------------------

const PLAIN_KEY = 'socle-admin:texte-brut';

/** Ce qu'une carte montre d'un composant, à la place de son code. */
const CARDS = {
  canEdit: (/** @type {any} */ component) => component.editable && Boolean(EDITORS[component.name]),
  card: (/** @type {any} */ component) => describe(component),
  onEdit: (/** @type {number} */ index) => editComponent(index),
  onDelete: (/** @type {number} */ index) => deleteComponent(index),
  tableCard: (/** @type {any} */ table) => tableCard(table),
  onEditTable: (/** @type {number} */ index) => editTable(index),
  onDeleteTable: (/** @type {number} */ index) => deleteTable(index),
};

/** @param {any} component */
function describe(component) {
  const props = component.props ?? {};
  if (component.name === 'Quiz') {
    const questions = Array.isArray(props.questions) ? props.questions : [];
    return h(
      'div',
      { class: 'card-widget__summary' },
      h('span', { class: 'card-widget__icon', 'aria-hidden': 'true' }, '📝'),
      h(
        'div',
        {},
        h('strong', {}, props.title || 'Quiz'),
        h('span', {}, `${questions.length} question${questions.length > 1 ? 's' : ''} · ${questions[0]?.question ?? ''}`)
      )
    );
  }
  if (component.name === 'Figure') {
    const from = state.parsed.imports.find((i) => i.name === props.src?.__ref)?.from ?? '';
    const asset = from.match(ASSET_IMPORT)?.[1];
    return h(
      'div',
      { class: 'card-widget__summary' },
      asset ? thumbnail({ path: asset, name: asset }) : h('span', { class: 'card-widget__icon', 'aria-hidden': 'true' }, '🖼'),
      h(
        'div',
        {},
        h('strong', {}, props.caption || asset || 'Image'),
        h('span', {}, props.alt ? `Description : ${props.alt}` : 'Image décorative (sans description)')
      )
    );
  }
  // Les composants en liste : leur nombre d'éléments, et le début du
  // premier - de quoi reconnaître celui qu'on cherche.
  const LISTS = {
    Timeline: { icon: '🧭', label: 'Frise', prop: 'steps', noun: 'étape', first: (/** @type {any} */ s) => s.title },
    Flashcards: { icon: '🃏', label: 'Cartes de révision', prop: 'cards', noun: 'carte', first: (/** @type {any} */ c) => c.front },
    DragMatch: { icon: '🔗', label: 'Association', prop: 'pairs', noun: 'paire', first: (/** @type {any} */ p) => `${p.left} → ${p.right}` },
  };
  const list = LISTS[/** @type {keyof typeof LISTS} */ (component.name)];
  if (list) {
    const items = Array.isArray(props[list.prop]) ? props[list.prop] : [];
    return h(
      'div',
      { class: 'card-widget__summary' },
      h('span', { class: 'card-widget__icon', 'aria-hidden': 'true' }, list.icon),
      h(
        'div',
        {},
        h('strong', {}, props.title || list.label),
        h('span', {}, `${items.length} ${list.noun}${items.length > 1 ? 's' : ''}${items[0] ? ` · ${list.first(items[0])}` : ''}`)
      )
    );
  }
  return h('strong', {}, component.name);
}

// Ce que l'éditeur d'un deck demande à l'admin : choisir une image
// dans la médiathèque, et en montrer la vignette. Un deck cite ses
// images depuis le dossier de SA leçon (« ../../../assets/x.jpg »).
const SLIDE_OPTIONS = {
  pickImage: async (/** @type {string | null} */ current) => {
    const picked = await openDialog(imagePicker, { path: current ? coverAsset(current) : null });
    return picked && state.lesson ? `${'../'.repeat(state.lesson.id.split('/').length + 1)}assets/${picked.path}` : null;
  },
  thumb: (/** @type {string} */ url) => {
    const asset = coverAsset(url);
    return asset ? thumbnail({ path: asset, name: asset }) : null;
  },
};

// Le texte d'un deck n'a ni composants ni tableaux à mettre en cartes :
// ce sont ses bandeaux de slides qui en tiennent lieu.
const NO_CARDS = {
  canEdit: () => false,
  card: () => h('span'),
  onEdit() {},
  onDelete() {},
  tableCard: () => h('span'),
  onEditTable() {},
  onDeleteTable() {},
};

/** @type {ReturnType<typeof createPlainEditor> | ReturnType<typeof createRichEditor>} */
let body = createBodyEditor(readPlain());
/** @type {ReturnType<typeof createPlainEditor> | ReturnType<typeof createRichEditor>} */
let slidesBody = createSlidesEditor(readPlain());

function readPlain() {
  try {
    return localStorage.getItem(PLAIN_KEY) === '1';
  } catch {
    return false;
  }
}

/** @param {boolean} plain */
function createBodyEditor(plain) {
  ui.formatBar.classList.toggle('format--plain', plain);
  return plain
    ? createPlainEditor(ui.bodyField)
    : createRichEditor(ui.bodyHost, { cards: CARDS, label: 'Texte de la leçon' });
}

/** @param {boolean} plain */
function createSlidesEditor(plain) {
  ui.slidesFormatBar.classList.toggle('format--plain', plain);
  return plain
    ? createPlainEditor(ui.slidesText)
    : createRichEditor(ui.slidesHost, {
        cards: NO_CARDS,
        label: 'Texte des slides',
        placeholder: 'Écrivez ici vos slides, ou ajoutez-en une avec « + Slide »…',
        slides: SLIDE_OPTIONS,
      });
}

const plainToggles = [...document.querySelectorAll('.plain-toggle')];
for (const toggle of plainToggles) toggle.checked = readPlain();

// Une seule préférence pour les deux éditeurs : qui préfère le texte
// brut le préfère partout.
for (const toggle of plainToggles) {
  toggle.addEventListener('change', () => {
    const plain = toggle.checked;
    for (const other of plainToggles) other.checked = plain;
    try {
      localStorage.setItem(PLAIN_KEY, plain ? '1' : '0');
    } catch {}
    // Le texte passe d'un éditeur à l'autre tel quel : modifications non
    // enregistrées comprises. Seul l'historique d'annulation est perdu.
    const text = body.value;
    body.destroy();
    body = createBodyEditor(plain);
    body.value = text;
    const slidesText = slidesBody.value;
    slidesBody.destroy();
    slidesBody = createSlidesEditor(plain);
    slidesBody.value = slidesText;
    state.parsed.source = '';
    parseComponents();
  });
}

for (const bar of [ui.formatBar, ui.slidesFormatBar]) {
  bar.addEventListener('click', (/** @type {MouseEvent} */ event) => {
    const button = /** @type {HTMLElement} */ (event.target).closest('[data-command]');
    const slides = bar === ui.slidesFormatBar;
    const editor = slides ? slidesBody : body;
    if (!button || !('commands' in editor)) return;
    const command = /** @type {HTMLElement} */ (button).dataset.command;
    if (command === 'table') slides ? insertSlidesTable() : insertTable();
    else if (command === 'image') insertSlideImage();
    else if (command === 'heading') editor.commands.heading(Number(/** @type {HTMLElement} */ (button).dataset.level));
    else editor.commands[/** @type {'bold'} */ (command)]();
  });
}

/**
 * Pose un bloc dans le texte des slides, dans son propre paragraphe,
 * au bout de la ligne du curseur.
 *
 * @param {string} source
 */
function insertSlidesBlock(source) {
  const text = slidesBody.value;
  const lineEnd = text.indexOf('\n', slidesBody.selectionStart);
  const at = lineEnd === -1 ? text.length : lineEnd;
  const before = text.slice(0, at);
  const after = text.slice(at);
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const tail = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  slidesBody.replace(at, at, `${lead}${source}${tail}`);
}

async function insertSlidesTable() {
  const edited = await openDialog(tableEditor, tableEditor.create());
  if (!edited) return;
  const { source } = await request('/table/print', { method: 'POST', json: edited });
  insertSlidesBlock(source);
}

/** Une image dans le cours de la slide - et non en fond : `![](…)`. */
async function insertSlideImage() {
  const url = await SLIDE_OPTIONS.pickImage(null);
  if (url) insertSlidesBlock(`![](${url})`);
}

// -------------------------------------------------------------
// La boîte de dialogue des éditeurs
// -------------------------------------------------------------

// Un refus (« champ vide ») s'efface dès qu'on reprend le formulaire :
// il décrivait l'état d'avant, pas celui qu'on est en train de corriger.
ui.dialogBody.addEventListener('input', () => (ui.dialogError.hidden = true));
ui.dialogBody.addEventListener('click', (/** @type {MouseEvent} */ event) => {
  if (/** @type {HTMLElement} */ (event.target).closest('button')) ui.dialogError.hidden = true;
});

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
// Onglets : la page, ou ses slides
// -------------------------------------------------------------

/** @param {'page' | 'slides'} tab */
function showTab(tab) {
  state.tab = tab;
  const slides = tab === 'slides';
  ui.tabPage.setAttribute('aria-selected', String(!slides));
  ui.tabSlides.setAttribute('aria-selected', String(slides));
  ui.tabPage.tabIndex = slides ? -1 : 0;
  ui.tabSlides.tabIndex = slides ? 0 : -1;
  ui.pagePanel.hidden = slides;
  ui.slidesPanel.hidden = !slides;
  ui.form.classList.toggle('lesson--wide', slides);
  if (slides) previewNow();
}

ui.tabPage.addEventListener('click', () => showTab('page'));
ui.tabSlides.addEventListener('click', () => showTab('slides'));
// Les flèches passent d'un onglet à l'autre, comme le veut le motif
// « onglets » de l'ARIA.
for (const tab of [ui.tabPage, ui.tabSlides]) {
  tab.addEventListener('keydown', (/** @type {KeyboardEvent} */ event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const next = tab === ui.tabPage ? ui.tabSlides : ui.tabPage;
    showTab(next === ui.tabSlides ? 'slides' : 'page');
    next.focus();
  });
}

// -------------------------------------------------------------
// Les slides
//
// Deux états pour une leçon : sans deck, ses slides viennent de ses
// points-clés ; avec un deck écrit à la main (« lecon.slides.md »), on
// l'écrit ici. L'aperçu suit la frappe, enregistrée ou non : c'est le
// serveur qui assemble et rend le deck comme `npm run slides` le ferait.
// -------------------------------------------------------------

function renderSlidesMode() {
  ui.slidesPoints.hidden = state.slides.deck;
  ui.slidesDeck.hidden = !state.slides.deck;
  // Créé caché, CodeMirror doit se mesurer une fois visible.
  if ('view' in slidesBody) slidesBody.view.requestMeasure();
  updateSlidesCount();
}

/**
 * Les séparateurs de slides d'un deck : les lignes « --- », hors des
 * blocs de code, où un « --- » n'est que du texte.
 *
 * @param {string} text
 * @returns {number[]} La position du début de chaque séparateur.
 */
function separators(text) {
  const found = [];
  let fence = '';
  let offset = 0;
  for (const line of text.split('\n')) {
    const marker = line.match(/^\s*(```|~~~)/)?.[1];
    if (marker && (!fence || fence === marker)) fence = fence ? '' : marker;
    else if (!fence && /^---\s*$/.test(line)) found.push(offset);
    offset += line.length + 1;
  }
  return found;
}

function updateSlidesCount() {
  // Titre et fin sont ajoutés au deck ; sans deck, une slide de points-clés.
  const body = state.slides.deck ? separators(slidesBody.value).length + 1 : 1;
  ui.slidesCount.textContent = String(body + 2);
}

$('#slides-create').addEventListener('click', () => {
  const points = ui.form.elements.slidePoints.value
    .split('\n')
    .map((/** @type {string} */ line) => line.trim())
    .filter(Boolean);
  // Le deck part de ce que la leçon montrait déjà : ses points-clés.
  slidesBody.value = points.length
    ? `## Points clés\n\n${points.map((/** @type {string} */ p) => `- ${p}`).join('\n')}\n`
    : '## Une première slide\n\nLe texte de la slide.\n';
  state.slides.deck = true;
  renderSlidesMode();
  updateDirty();
  previewNow();
  slidesBody.focus();
});

$('#slides-drop').addEventListener('click', () => {
  if (!confirm('Supprimer ce deck ? À l’enregistrement, le fichier sera effacé et les slides reviendront aux points-clés.')) return;
  state.slides.deck = false;
  renderSlidesMode();
  updateDirty();
  previewNow();
});

let previewTimer = 0;
ui.form.addEventListener('input', () => {
  if (state.tab !== 'slides') return;
  updateSlidesCount();
  clearTimeout(previewTimer);
  previewTimer = window.setTimeout(previewNow, 450);
});

let previewRun = 0;

async function previewNow() {
  if (!state.lesson) return;
  const run = ++previewRun;
  ui.slidesStatus.textContent = 'Rendu…';
  try {
    const result = await request('/slides/preview', {
      method: 'POST',
      json: {
        id: state.lesson.id,
        data: collectData(),
        slides: state.slides.deck ? slidesBody.value : null,
        knownCss: state.css.hash,
      },
    });
    // Une frappe plus récente a déjà demandé un autre rendu.
    if (run !== previewRun) return;
    if (result.css !== null) state.css = { hash: result.cssHash, text: result.css };
    ui.slidesError.hidden = true;
    ui.slidesStatus.textContent = `${result.count} slides`;
    ui.slidesCount.textContent = String(result.count);
    await showPreview(result.html);
  } catch (error) {
    if (run !== previewRun) return;
    ui.slidesStatus.textContent = '';
    ui.slidesError.textContent = error.message;
    ui.slidesError.hidden = false;
  }
}

/**
 * Le rendu tient dans un <iframe> : le CSS du thème, qui stylise des
 * <section> nues, ne doit pas déborder sur l'admin. La position de
 * défilement survit au rechargement - sans quoi chaque frappe
 * ramènerait en haut du deck.
 *
 * @param {string} html
 */
function showPreview(html) {
  const frame = ui.slidesFrame;
  const scroll = frame.contentWindow?.scrollY ?? 0;
  const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
  return new Promise((resolve) => {
    frame.onload = () => {
      frame.contentWindow?.scrollTo(0, scroll);
      highlightSlide(false);
      resolve(undefined);
    };
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8">
<style>${state.css.text}</style>
<style>
  html { background: #d9d9e0; }
  body { margin: 0; padding: 12px; }
  svg[data-marpit-svg] { display: block; width: 100%; height: auto; margin: 0 0 12px; border-radius: 4px; box-shadow: 0 1px 3px rgb(0 0 0 / 0.25); }
  svg[data-marpit-svg].is-current { outline: 3px solid ${brand}; outline-offset: 3px; }
</style></head><body>${html}</body></html>`;
  });
}

/**
 * La slide où se trouve le curseur s'allume dans l'aperçu. La slide de
 * titre, ajoutée au deck, est la n° 0 : la première du texte est la 1.
 *
 * @param {boolean} [scroll] Faire défiler l'aperçu jusqu'à elle.
 */
function highlightSlide(scroll = true) {
  const doc = ui.slidesFrame.contentDocument;
  if (!doc) return;
  const slides = [...doc.querySelectorAll('svg[data-marpit-svg]')];
  let index = -1;
  if (state.slides.deck && ui.slidesHost.contains(document.activeElement)) {
    const caret = slidesBody.selectionStart;
    index = 1 + separators(slidesBody.value).filter((at) => at < caret).length;
  }
  slides.forEach((slide, i) => slide.classList.toggle('is-current', i === index));
  if (scroll && slides[index]) slides[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

ui.slidesHost.addEventListener('caret', () => highlightSlide());

// -------------------------------------------------------------
// Ajouter une slide depuis un modèle
//
// Les modèles du thème (src/styles/marp/layouts/), avec la syntaxe que
// chacun attend - c'est elle qu'on oublie, surtout pour les images, où
// chaque famille veut la sienne. `image: true` : on choisit d'abord
// l'image dans la médiathèque.
// -------------------------------------------------------------

const SLIDE_TEMPLATES = [
  { label: 'Standard', hint: 'Un titre et du contenu', text: () => '## Titre de la slide\n\n- Un premier point\n- Un deuxième point' },
  { label: 'Intercalaire', hint: 'Ouvre une partie', text: () => '<!-- _class: section -->\n\n## Partie 2 - Son titre' },
  { label: 'Phrase forte', hint: 'Une idée, en grand', text: () => '<!-- _class: statement -->\n\n> Une idée forte, en une phrase.' },
  {
    label: 'Deux colonnes',
    hint: 'Comparer, opposer',
    text: () => '<!-- _class: columns-2 -->\n\n## Titre\n\nUn chapô facultatif, au-dessus des colonnes.\n\n### À gauche\n\nLe texte.\n\n### À droite\n\nLe texte.',
  },
  {
    label: 'Trois colonnes',
    hint: 'Trois idées côte à côte',
    text: () => '<!-- _class: columns-3 -->\n\n## Titre\n\n### Un\n\nLe texte.\n\n### Deux\n\nLe texte.\n\n### Trois\n\nLe texte.',
  },
  {
    label: 'Image à gauche',
    hint: 'Image d’un côté, texte de l’autre',
    image: true,
    text: (/** @type {string} */ src) => `<!-- _class: image-left -->\n<!-- _backgroundImage: url('${src}') -->\n\n## Titre\n\nLe texte, à côté de l’image.`,
  },
  {
    label: 'Image à droite',
    hint: 'Le même, inversé',
    image: true,
    text: (/** @type {string} */ src) => `<!-- _class: image-right -->\n<!-- _backgroundImage: url('${src}') -->\n\n## Titre\n\nLe texte, à côté de l’image.`,
  },
  {
    label: 'Image en moitié',
    hint: 'L’image prend une part réglable',
    image: true,
    text: (/** @type {string} */ src) => `<!-- _class: image-split -->\n\n![bg right:40%](${src})\n\n## Titre\n\nLe texte.`,
  },
  {
    label: 'Image plein cadre',
    hint: 'L’image en fond, le texte par-dessus',
    image: true,
    text: (/** @type {string} */ src) => `<!-- _class: image-full -->\n\n![bg brightness:0.35](${src})\n\n## Titre\n\nLe texte, en blanc sur l’image.`,
  },
];

ui.slideTemplates.replaceChildren(
  ...SLIDE_TEMPLATES.map((template) =>
    h(
      'li',
      {},
      h(
        'button',
        { type: 'button', class: 'menu__item', onclick: () => addSlide(template) },
        h('strong', {}, template.label),
        h('span', {}, template.hint)
      )
    )
  )
);

/** @param {boolean} open */
function toggleSlideMenu(open) {
  ui.slideTemplates.hidden = !open;
  ui.slideAdd.setAttribute('aria-expanded', String(open));
  if (open) ui.slideTemplates.querySelector('button')?.focus();
}

ui.slideAdd.addEventListener('click', () => toggleSlideMenu(ui.slideTemplates.hidden));
document.addEventListener('click', (event) => {
  if (!$('#slide-menu').contains(event.target)) toggleSlideMenu(false);
});
ui.slideTemplates.addEventListener('keydown', (/** @type {KeyboardEvent} */ event) => {
  if (event.key === 'Escape') {
    toggleSlideMenu(false);
    ui.slideAdd.focus();
  }
});

/** @param {{ text: (src: string) => string, image?: boolean }} template */
async function addSlide(template) {
  toggleSlideMenu(false);
  if (!state.lesson) return;
  let src = '';
  if (template.image) {
    const picked = await openDialog(imagePicker, { path: null });
    if (!picked) return;
    // Un deck cite ses images depuis le dossier de SA leçon.
    src = `${'../'.repeat(state.lesson.id.split('/').length + 1)}assets/${picked.path}`;
  }
  // Une leçon sans deck en reçoit un : ajouter une slide, c'est déjà
  // écrire le deck à la main.
  if (!state.slides.deck) {
    state.slides.deck = true;
    slidesBody.value = '';
    renderSlidesMode();
  }

  const text = slidesBody.value;
  const snippet = template.text(src);
  let at;
  let insert;
  if (!text.trim()) {
    at = 0;
    insert = `${snippet}\n`;
    slidesBody.value = '';
  } else {
    // La nouvelle slide vient juste APRÈS celle du curseur.
    const next = separators(text).find((position) => position > slidesBody.selectionStart);
    if (next === undefined) {
      at = text.length;
      insert = `${text.endsWith('\n') ? '' : '\n'}\n---\n\n${snippet}\n`;
    } else {
      at = next;
      insert = `---\n\n${snippet}\n\n`;
    }
  }
  slidesBody.replace(at, at, insert);
  // Le curseur se pose sur le titre de la nouvelle slide, prêt à le
  // réécrire - et le texte comme l'aperçu défilent jusqu'à elle.
  const title = slidesBody.value.indexOf('## ', at);
  if (title !== -1) slidesBody.select(title + 3, slidesBody.value.indexOf('\n', title + 3));
  updateDirty();
  updateSlidesCount();
  await previewNow();
  highlightSlide();
}

// -------------------------------------------------------------
// Démarrage
// -------------------------------------------------------------

await loadToc();
route();
