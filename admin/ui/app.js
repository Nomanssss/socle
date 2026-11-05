// =============================================================
// app.js - l'interface de l'admin
//
// Trois colonnes : le sommaire, la leçon ouverte (en-tête et texte),
// et l'aperçu de la vraie page servie par Astro. L'aperçu montre la
// version ENREGISTRÉE : c'est le serveur de dev qui la rend, avec les
// vrais composants et la vraie charte - rien n'est imité ici.
//
// La leçon ouverte est désignée par l'ancre de l'adresse
// (/admin/#module-1/lecon-1) : un rechargement la rouvre.
// =============================================================

import { h, EDITORS, EditorError } from './editors.js';

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
  layout: $('#layout'),
  frame: $('#preview-frame'),
  previewOpen: $('#preview-open'),
  previewLocked: $('#preview-locked'),
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
 *   parsed: { source: string, components: any[], imports: { name: string, from: string }[] },
 *   saving: boolean,
 * }}
 */
const state = {
  lessons: [],
  lesson: null,
  saved: '',
  parsed: { source: '', components: [], imports: [] },
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

window.addEventListener('hashchange', () => openLesson(location.hash.slice(1)));

// -------------------------------------------------------------
// Ouvrir une leçon
// -------------------------------------------------------------

/** @param {string} id */
async function openLesson(id) {
  if (!id) return;
  if (id === state.lesson?.id) return;
  try {
    const lesson = await request(`/lesson?id=${encodeURIComponent(id)}`);
    state.lesson = lesson;
    fillForm(lesson.data);
    ui.body.value = lesson.body;
    state.saved = snapshot();
    ui.empty.hidden = true;
    ui.form.hidden = false;
    ui.heading.textContent = lesson.data.title ?? id;
    document.title = `${lesson.data.title ?? id} · Admin`;
    renderToc();
    updatePreview(true);
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
    updatePreview();
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
// Aperçu
// -------------------------------------------------------------

/** @param {boolean} [navigate] Changer de page, et non seulement recharger. */
function updatePreview(navigate = false) {
  const lesson = state.lesson;
  if (!lesson) return;
  const url = `/lecons/${lesson.id}/`;
  ui.previewOpen.href = url;
  ui.previewLocked.hidden = !lesson.locked;
  ui.frame.hidden = lesson.locked;
  if (lesson.locked) return;
  if (navigate) ui.frame.src = url;
  // Laisser à Astro le temps de relire la collection : recharger tout
  // de suite servirait encore l'ancienne version.
  else setTimeout(() => ui.frame.contentWindow?.location.reload(), 500);
}

$('#toggle-preview').addEventListener('click', (/** @type {any} */ event) => {
  const shown = event.currentTarget.getAttribute('aria-pressed') !== 'true';
  event.currentTarget.setAttribute('aria-pressed', String(shown));
  ui.layout.classList.toggle('layout--no-preview', !shown);
});

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
    state.parsed = { source, components: result.components, imports: result.imports ?? [] };
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

  const props = await openDialog(editor, component.props);
  if (!props) return;
  if (JSON.stringify(props) === JSON.stringify(component.props)) return;
  const { source } = await request('/component/print', {
    method: 'POST',
    json: { name: component.name, props, indent: component.indent },
  });
  replaceText(component.start, component.end, source);
}

$('#insert-quiz').addEventListener('click', () => insertComponent('Quiz'));

/** @param {string} name */
async function insertComponent(name) {
  const editor = EDITORS[name];
  const props = await openDialog(editor, editor.create());
  if (!props) return;
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

  await ensureImport(name);
}

/**
 * Ajoute « import Quiz from '@components/Quiz.astro'; » s'il manque :
 * après le dernier import du fichier, ou en tête du texte.
 *
 * @param {string} name
 */
async function ensureImport(name) {
  const { imports } = await parseComponents();
  if (imports.some((i) => i.name === name)) return;
  const line = `import ${name} from '@components/${name}.astro';`;
  const text = ui.body.value;
  const last = [...text.matchAll(/^import\s.+$/gm)].pop();
  if (last?.index !== undefined) {
    const at = last.index + last[0].length;
    replaceText(at, at, `\n${line}`);
  } else {
    const at = text.match(/^\s*/)?.[0].length ?? 0;
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
if (location.hash.length > 1) openLesson(location.hash.slice(1));
else if (state.lessons[0]) location.hash = state.lessons[0].id;
