// =============================================================
// text-editor.js - les deux éditeurs du texte d'une leçon
//
// Le texte d'une leçon s'édite de deux façons, au choix de l'auteur :
//
//   - en RICHE (CodeMirror) : les titres en grand, le gras en gras, la
//     syntaxe estompée, une barre d'outils - et les composants affichés
//     en cartes, qui ouvrent leur éditeur. Personne n'y voit de code ;
//   - en BRUT : le fichier tel quel, dans un simple <textarea>.
//
// Dans les deux cas, ce qui est édité est le TEXTE du fichier, au
// caractère près : pas de document intermédiaire qui serait réécrit à
// l'enregistrement. C'est ce qui distingue cet éditeur d'un WYSIWYG.
//
// Les deux offrent la même interface à app.js, qui ne sait pas lequel
// est affiché :
//
//   value              le texte (lecture et écriture ; écrire remet
//                      l'historique à zéro : c'est une autre leçon)
//   selectionStart     la position du curseur
//   replace(a, b, t)   remplace un passage, annulable par Ctrl+Z
//   select(a, b)       sélectionne un passage et le fait défiler
//   setComponents(l, i) les composants à montrer en cartes, et les
//                      imports à estomper
//   focus(), destroy()
//
// et préviennent par deux évènements, émis sur l'élément qui les
// contient : « input » (le texte a changé) et « caret » (le curseur a
// bougé).
// =============================================================

import {
  EditorState,
  EditorSelection,
  StateField,
  StateEffect,
  EditorView,
  Decoration,
  WidgetType,
  keymap,
  drawSelection,
  placeholder,
  history,
  historyKeymap,
  defaultKeymap,
  syntaxHighlighting,
  HighlightStyle,
  markdown,
  tags,
} from './vendor/codemirror.js';
import { h } from './dom.js';

/**
 * @typedef {{ name: string, start: number, end: number, editable: boolean, props: any }} Component
 * @typedef {{
 *   canEdit: (component: Component) => boolean,
 *   card: (component: Component) => Node,
 *   onEdit: (index: number) => void,
 *   onDelete: (index: number) => void,
 * }} Cards
 */

// -------------------------------------------------------------
// Brut : un <textarea>
// -------------------------------------------------------------

/** @param {HTMLTextAreaElement} field */
export function createPlainEditor(field) {
  const caret = () => field.dispatchEvent(new Event('caret', { bubbles: true }));
  const listeners = ['click', 'keyup', 'select'].map((type) => {
    field.addEventListener(type, caret);
    return type;
  });
  field.hidden = false;

  return {
    get value() {
      return field.value;
    },
    set value(text) {
      field.value = text;
    },
    get selectionStart() {
      return field.selectionStart;
    },
    focus: () => field.focus(),
    /**
     * Passe par l'historique du champ : Ctrl+Z annule la modification
     * d'un quiz comme une frappe.
     *
     * @param {number} start
     * @param {number} end
     * @param {string} text
     */
    replace(start, end, text) {
      field.focus();
      field.setSelectionRange(start, end);
      if (!document.execCommand('insertText', false, text)) {
        field.setRangeText(text, start, end, 'end');
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
      selectInTextarea(field, start, start + text.length);
    },
    /**
     * @param {number} start
     * @param {number} end
     */
    select(start, end) {
      selectInTextarea(field, start, end);
      caret();
    },
    setComponents() {},
    destroy() {
      for (const type of listeners) field.removeEventListener(type, caret);
      field.hidden = true;
    },
  };
}

/**
 * Sélectionne un passage d'un <textarea> et le fait défiler à l'écran.
 * La position verticale se mesure sur un double invisible du champ : un
 * <textarea> ne dit pas où se trouve une ligne une fois le texte replié.
 *
 * @param {HTMLTextAreaElement} field
 * @param {number} start
 * @param {number} end
 */
export function selectInTextarea(field, start, end) {
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
}

// -------------------------------------------------------------
// Riche : CodeMirror
// -------------------------------------------------------------

// Le Markdown se lit sur place : un titre est grand, le gras est gras.
// Les signes de syntaxe (« ## », « ** », « - ») restent là - c'est le
// fichier - mais s'estompent : on les voit sans qu'ils gênent la lecture.
const markdownStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.6em', fontWeight: '700', lineHeight: '1.3' },
  { tag: tags.heading2, fontSize: '1.35em', fontWeight: '700', lineHeight: '1.35' },
  { tag: tags.heading3, fontSize: '1.15em', fontWeight: '700' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--brand)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--muted)', fontSize: '0.9em' },
  { tag: tags.quote, color: 'var(--muted)', fontStyle: 'italic' },
  { tag: tags.monospace, fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontSize: '0.9em' },
  { tag: [tags.processingInstruction, tags.contentSeparator], color: 'var(--muted)', opacity: '0.55' },
]);

const theme = EditorView.theme({
  '&': { fontSize: '16px', background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--line)' },
  '&.cm-focused': { outline: '2px solid var(--brand)', outlineOffset: '2px' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.7', minHeight: '65vh' },
  '.cm-content': { padding: '16px 0', maxWidth: '78ch', caretColor: 'var(--text)' },
  '.cm-line': { padding: '0 20px' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  '.cm-placeholder': { color: 'var(--muted)' },
  '.cm-import-line': { color: 'var(--muted)', fontSize: '0.8em', opacity: '0.7', fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' },
});

/** Remplace les cartes. */
const setCards = StateEffect.define();

// Les cartes suivent le texte : entre deux analyses, une frappe au-dessus
// d'un quiz décale sa carte au lieu de la laisser à l'ancienne place.
const cardsField = StateField.define({
  create: () => Decoration.none,
  update(cards, transaction) {
    cards = cards.map(transaction.changes);
    for (const effect of transaction.effects) if (effect.is(setCards)) cards = effect.value;
    return cards;
  },
  // Une carte est « atomique » : le curseur la saute d'un bloc, il ne
  // s'arrête pas au milieu du code qu'elle cache.
  provide: (field) => [EditorView.decorations.from(field), EditorView.atomicRanges.of((view) => view.state.field(field))],
});

class CardWidget extends WidgetType {
  /**
   * @param {Component} component
   * @param {number} index
   * @param {Cards} cards
   */
  constructor(component, index, cards) {
    super();
    this.component = component;
    this.index = index;
    this.cards = cards;
    this.key = `${index}:${component.name}:${JSON.stringify(component.props)}`;
  }

  /** @param {CardWidget} other */
  eq(other) {
    return other.key === this.key;
  }

  toDOM() {
    return h(
      'div',
      { class: 'card-widget', contenteditable: 'false' },
      h('div', { class: 'card-widget__body' }, this.cards.card(this.component)),
      h(
        'div',
        { class: 'card-widget__actions' },
        h('button', { type: 'button', class: 'button button--small', onclick: () => this.cards.onEdit(this.index) }, 'Modifier'),
        h('button', {
          type: 'button',
          class: 'icon icon--danger',
          title: 'Supprimer',
          'aria-label': `Supprimer ce composant (${this.component.name})`,
          onclick: () => this.cards.onDelete(this.index),
        }, '✕')
      )
    );
  }

  // Les clics sur la carte sont pour ses boutons, pas pour l'éditeur.
  ignoreEvent() {
    return true;
  }
}

/**
 * @param {HTMLElement} parent
 * @param {{ cards: Cards, label: string }} options
 */
export function createRichEditor(parent, { cards, label }) {
  const host = h('div', { class: 'rich-editor', 'data-text-editor': '' });
  parent.append(host);

  const emit = (/** @type {string} */ type) => host.dispatchEvent(new Event(type, { bubbles: true }));

  const extensions = [
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    markdown(),
    syntaxHighlighting(markdownStyle),
    theme,
    cardsField,
    placeholder('Écrivez ici le texte de la leçon…'),
    EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'true', lang: document.documentElement.lang }),
    keymap.of([
      { key: 'Mod-b', run: (view) => wrap(view, '**') },
      { key: 'Mod-i', run: (view) => wrap(view, '*') },
      { key: 'Mod-k', run: (view) => link(view) },
      ...historyKeymap,
      ...defaultKeymap,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) emit('input');
      if (update.docChanged || update.selectionSet) emit('caret');
    }),
  ];

  const view = new EditorView({ parent: host, state: EditorState.create({ doc: '', extensions }) });

  return {
    view,
    get value() {
      return view.state.doc.toString();
    },
    set value(text) {
      view.setState(EditorState.create({ doc: text, extensions }));
    },
    get selectionStart() {
      return view.state.selection.main.from;
    },
    focus: () => view.focus(),
    /**
     * @param {number} start
     * @param {number} end
     * @param {string} text
     */
    replace(start, end, text) {
      view.dispatch({
        changes: { from: start, to: end, insert: text },
        selection: EditorSelection.range(start, start + text.length),
        scrollIntoView: true,
      });
      view.focus();
    },
    /**
     * @param {number} start
     * @param {number} end
     */
    select(start, end) {
      view.dispatch({ selection: EditorSelection.range(start, end), scrollIntoView: true });
      view.focus();
    },
    /**
     * Une carte couvre les lignes entières du composant : un bloc ne
     * commence ni ne finit au milieu d'une ligne.
     *
     * Les imports, eux, restent du texte, mais s'estompent : c'est
     * l'admin qui les écrit et les retire, l'auteur n'a plus à s'en
     * soucier.
     *
     * @param {Component[]} components
     * @param {{ start: number, end: number }[]} [imports]
     */
    setComponents(components, imports = []) {
      const { doc } = view.state;
      const dimmed = imports
        .filter((i) => i.end <= doc.length)
        .map((i) => Decoration.line({ class: 'cm-import-line' }).range(doc.lineAt(i.start).from));
      const ranges = components
        .map((component, index) => ({ component, index }))
        .filter(({ component }) => cards.canEdit(component) && component.end <= doc.length)
        .map(({ component, index }) =>
          Decoration.replace({ widget: new CardWidget(component, index, cards), block: true }).range(
            doc.lineAt(component.start).from,
            doc.lineAt(component.end).to
          )
        );
      view.dispatch({ effects: setCards.of(Decoration.set([...dimmed, ...ranges], true)) });
    },
    /** La barre d'outils appelle ces commandes. */
    commands: {
      bold: () => wrap(view, '**'),
      italic: () => wrap(view, '*'),
      heading: (/** @type {number} */ level) => heading(view, level),
      bullets: () => prefixLines(view, () => '- ', /^[-*+] /),
      numbers: () => prefixLines(view, (i) => `${i + 1}. `, /^\d+\. /),
      quote: () => prefixLines(view, () => '> ', /^> ?/),
      link: () => link(view),
    },
    destroy() {
      view.destroy();
      host.remove();
    },
  };
}

// -------------------------------------------------------------
// Les commandes de mise en forme
//
// Chacune agit sur le texte comme on le ferait à la main, et se défait
// si on la rejoue : « gras » sur un passage déjà en gras le remet en
// texte normal.
// -------------------------------------------------------------

/**
 * @param {EditorView} view
 * @param {string} mark « ** » ou « * ».
 */
function wrap(view, mark) {
  const n = mark.length;
  view.dispatch(
    view.state.changeByRange((range) => {
      const { doc } = view.state;
      const text = doc.sliceString(range.from, range.to);
      const before = doc.sliceString(range.from - n, range.from);
      const after = doc.sliceString(range.to, range.to + n);
      // Déjà entouré : on retire les marques.
      if (before === mark && after === mark) {
        return {
          changes: [
            { from: range.from - n, to: range.from },
            { from: range.to, to: range.to + n },
          ],
          range: EditorSelection.range(range.from - n, range.to - n),
        };
      }
      if (text.length > 2 * n && text.startsWith(mark) && text.endsWith(mark)) {
        return {
          changes: { from: range.from, to: range.to, insert: text.slice(n, -n) },
          range: EditorSelection.range(range.from, range.to - 2 * n),
        };
      }
      return {
        changes: [
          { from: range.from, insert: mark },
          { from: range.to, insert: mark },
        ],
        range: EditorSelection.range(range.from + n, range.to + n),
      };
    })
  );
  view.focus();
  return true;
}

/**
 * @param {EditorView} view
 * @param {number} level
 */
function heading(view, level) {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.from);
  const current = line.text.match(/^(#{1,6}) +/);
  const insert = current?.[1].length === level ? '' : `${'#'.repeat(level)} `;
  view.dispatch({ changes: { from: line.from, to: line.from + (current?.[0].length ?? 0), insert } });
  view.focus();
  return true;
}

/**
 * Préfixe chaque ligne de la sélection (liste, citation), ou retire le
 * préfixe si toutes l'ont déjà.
 *
 * @param {EditorView} view
 * @param {(index: number) => string} prefix
 * @param {RegExp} existing
 */
function prefixLines(view, prefix, existing) {
  const { state } = view;
  const { from, to } = state.selection.main;
  const first = state.doc.lineAt(from).number;
  const last = state.doc.lineAt(to).number;
  const lines = [];
  for (let n = first; n <= last; n++) lines.push(state.doc.line(n));
  const all = lines.every((line) => existing.test(line.text));
  const changes = lines.map((line, i) => {
    const match = line.text.match(existing);
    if (all) return { from: line.from, to: line.from + (match?.[0].length ?? 0) };
    return { from: line.from, to: line.from + (match?.[0].length ?? 0), insert: prefix(i) };
  });
  view.dispatch({ changes });
  view.focus();
  return true;
}

/** @param {EditorView} view */
function link(view) {
  const { from, to } = view.state.selection.main;
  const label = view.state.doc.sliceString(from, to) || 'texte du lien';
  const url = prompt('Adresse du lien (https://…) :', 'https://');
  if (!url || url === 'https://') {
    view.focus();
    return true;
  }
  const insert = `[${label}](${url})`;
  // Le libellé reste sélectionné : on peut le retaper tout de suite.
  view.dispatch({ changes: { from, to, insert }, selection: EditorSelection.range(from + 1, from + 1 + label.length) });
  view.focus();
  return true;
}
