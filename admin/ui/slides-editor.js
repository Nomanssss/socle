// =============================================================
// slides-editor.js - ce que l'éditeur riche sait d'un deck Marp
//
// Un deck, c'est du Markdown plus trois conventions qu'un auteur ne
// peut pas deviner :
//
//   ---                                   sépare deux slides
//   <!-- _class: columns-2 -->            choisit la mise en page
//   <!-- _backgroundImage: url('x.jpg') -->   l'image d'image-left/right
//   ![bg right:40%](x.jpg)                l'image d'image-split/full
//
// L'éditeur les montre autrement : chaque séparateur devient un bandeau
// « Slide 3 » avec un menu de mise en page, la directive `_class`
// disparaît (le bandeau la dit), et une ligne d'image devient une
// vignette qu'on change en un clic. Le texte, lui, ne change pas : tout
// cela n'est que de l'affichage, posé par-dessus le fichier.
// =============================================================

import { StateField, EditorView, Decoration, WidgetType, syntaxTree, ensureSyntaxTree } from './vendor/codemirror.js';
import { h } from './dom.js';

/**
 * Les mises en page du thème (src/styles/marp/layouts/). `image` dit
 * comment la mise en page reçoit son image : par la directive
 * `_backgroundImage` (« directive ») ou par un `![bg …]` (« bg »).
 */
export const LAYOUTS = [
  { value: '', label: 'Standard' },
  { value: 'section', label: 'Intercalaire' },
  { value: 'statement', label: 'Phrase forte' },
  { value: 'columns-2', label: 'Deux colonnes' },
  { value: 'columns-3', label: 'Trois colonnes' },
  { value: 'columns-4', label: 'Quatre colonnes' },
  { value: 'image-left', label: 'Image à gauche', image: 'directive' },
  { value: 'image-right', label: 'Image à droite', image: 'directive' },
  { value: 'image-split', label: 'Image en moitié', image: 'bg', bg: 'right:40%' },
  { value: 'image-full', label: 'Image plein cadre', image: 'bg', bg: 'brightness:0.35' },
];

const CLASS_LINE = /^<!--\s*_class:\s*([\w-]+)\s*-->\s*$/;
const BG_DIRECTIVE = /^<!--\s*_backgroundImage:\s*url\((['"]?)(.+?)\1\)\s*-->\s*$/;
const BG_IMAGE = /^!\[bg([^\]]*)\]\((.+?)\)\s*$/;

/**
 * @typedef {{ from: number, to: number, text: string }} Line
 * @typedef {{
 *   from: number,
 *   to: number,
 *   separator: Line | null,
 *   layout: { line: Line, value: string } | null,
 *   directive: { line: Line, url: string } | null,
 *   bg: { line: Line, url: string, options: string } | null,
 * }} Slide
 * @typedef {{
 *   pickImage: (current: string | null) => Promise<string | null>,
 *   thumb: (url: string) => Node | null,
 * }} SlideOptions
 */

/**
 * Découpe le deck en slides, d'après l'arbre Markdown - c'est lui qui
 * sait qu'un « --- » dans un bloc de code n'est pas un séparateur, et
 * qu'un « --- » collé sous une ligne de texte en fait un titre.
 *
 * @param {import('@codemirror/state').EditorState} state
 * @returns {Slide[]}
 */
export function analyzeSlides(state) {
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);
  /** @type {Line[]} */
  const separators = [];
  /** @type {[number, number][]} */
  const code = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') code.push([node.from, node.to]);
    if (node.name === 'HorizontalRule') {
      const line = state.doc.lineAt(node.from);
      if (line.text.trim() === '---') separators.push({ from: line.from, to: line.to, text: line.text });
    }
  }

  const bounds = [0, ...separators.map((s) => s.to + 1)];
  return bounds.map((from, i) => {
    const separator = i === 0 ? null : separators[i - 1];
    const to = i < separators.length ? separators[i].from : state.doc.length;
    /** @type {Slide} */
    const slide = { from: Math.min(from, state.doc.length), to, separator, layout: null, directive: null, bg: null };
    for (let pos = slide.from; pos < to; ) {
      const line = state.doc.lineAt(pos);
      if (!code.some(([a, b]) => line.from >= a && line.from <= b)) {
        const at = { from: line.from, to: line.to, text: line.text };
        let match;
        if (!slide.layout && (match = line.text.match(CLASS_LINE))) slide.layout = { line: at, value: match[1] };
        else if (!slide.directive && (match = line.text.match(BG_DIRECTIVE))) slide.directive = { line: at, url: match[2] };
        else if (!slide.bg && (match = line.text.match(BG_IMAGE))) slide.bg = { line: at, url: match[2], options: match[1].trim() };
      }
      pos = line.to + 1;
    }
    return slide;
  });
}

// -------------------------------------------------------------
// Les bandeaux, les vignettes
// -------------------------------------------------------------

class SlideBand extends WidgetType {
  /**
   * @param {number} index Le rang de la slide dans le texte (0 : la première).
   * @param {string} layout
   * @param {SlideOptions} options
   */
  constructor(index, layout, options) {
    super();
    this.index = index;
    this.layout = layout;
    this.options = options;
  }

  /** @param {SlideBand} other */
  eq(other) {
    return other.index === this.index && other.layout === this.layout;
  }

  /** @param {EditorView} view */
  toDOM(view) {
    const known = LAYOUTS.some((l) => l.value === this.layout);
    // La slide de titre est fabriquée depuis l'en-tête : la première du
    // texte est donc la n° 2, comme dans l'aperçu et le PDF.
    const number = this.index + 2;
    return h(
      'div',
      { class: 'slide-band', contenteditable: 'false' },
      h('span', { class: 'slide-band__label' }, `Slide ${number}`),
      h(
        'label',
        { class: 'slide-band__layout' },
        h('span', {}, 'Mise en page'),
        h(
          'select',
          {
            onchange: async (/** @type {any} */ e) => {
              const select = e.target;
              // Annulé (aucune image choisie) : le menu reprend sa valeur.
              if (!(await setLayout(view, this.index, select.value, this.options))) select.value = this.layout;
            },
          },
          ...LAYOUTS.map(({ value, label }) => h('option', { value, selected: value === this.layout }, label)),
          // Une classe écrite à la main, hors des modèles du thème : on la
          // montre telle quelle plutôt que de prétendre qu'elle n'existe pas.
          known ? null : h('option', { value: this.layout, selected: true }, `Autre : ${this.layout}`)
        )
      )
    );
  }

  ignoreEvent() {
    return true;
  }
}

class ImageChip extends WidgetType {
  /**
   * @param {number} index
   * @param {'directive' | 'bg'} kind
   * @param {string} url
   * @param {SlideOptions} options
   */
  constructor(index, kind, url, options) {
    super();
    this.index = index;
    this.kind = kind;
    this.url = url;
    this.options = options;
  }

  /** @param {ImageChip} other */
  eq(other) {
    return other.index === this.index && other.kind === this.kind && other.url === this.url;
  }

  /** @param {EditorView} view */
  toDOM(view) {
    return h(
      'div',
      { class: 'slide-image', contenteditable: 'false' },
      this.options.thumb(this.url),
      h('span', { class: 'slide-image__label' }, 'Image de la slide', h('small', {}, this.url.split('/').pop() ?? this.url)),
      h(
        'button',
        {
          type: 'button',
          class: 'button button--small',
          onclick: async () => {
            const url = await this.options.pickImage(this.url);
            if (url) replaceImage(view, this.index, this.kind, url);
          },
        },
        'Changer'
      )
    );
  }

  ignoreEvent() {
    return true;
  }
}

/** Une directive `_class` cachée : le bandeau la montre déjà. */
class Hidden extends WidgetType {
  toDOM() {
    return h('span', { class: 'slide-hidden', 'aria-hidden': 'true' });
  }

  eq() {
    return true;
  }
}

/**
 * L'extension à ajouter à l'éditeur d'un deck.
 *
 * @param {SlideOptions} options
 */
export function slidesExtension(options) {
  /** @param {import('@codemirror/state').EditorState} state */
  const build = (state) => {
    const ranges = [];
    analyzeSlides(state).forEach((slide, index) => {
      const band = new SlideBand(index, slide.layout?.value ?? '', options);
      ranges.push(
        slide.separator
          ? Decoration.replace({ widget: band, block: true }).range(slide.separator.from, slide.separator.to)
          : Decoration.widget({ widget: band, block: true, side: -1 }).range(0)
      );
      if (slide.layout) {
        // La ligne vide qui suit la directive part avec elle : sinon le
        // bandeau serait suivi d'un blanc sans raison apparente.
        const { from, to } = slide.layout.line;
        const next = to + 1 <= state.doc.length ? state.doc.lineAt(to + 1) : null;
        const end = next && next.text.trim() === '' && next.to < slide.to ? next.to : to;
        ranges.push(Decoration.replace({ widget: new Hidden(), block: true }).range(from, end));
      }
      if (slide.directive) {
        ranges.push(
          Decoration.replace({ widget: new ImageChip(index, 'directive', slide.directive.url, options), block: true }).range(
            slide.directive.line.from,
            slide.directive.line.to
          )
        );
      }
      if (slide.bg) {
        ranges.push(
          Decoration.replace({ widget: new ImageChip(index, 'bg', slide.bg.url, options), block: true }).range(slide.bg.line.from, slide.bg.line.to)
        );
      }
    });
    return Decoration.set(ranges, true);
  };

  const field = StateField.define({
    create: build,
    update(decorations, transaction) {
      // Le texte a changé, ou l'analyse Markdown a avancé : on redessine.
      if (transaction.docChanged || syntaxTree(transaction.state) !== syntaxTree(transaction.startState)) {
        return build(transaction.state);
      }
      return decorations;
    },
    provide: (f) => [EditorView.decorations.from(f), EditorView.atomicRanges.of((view) => view.state.field(f))],
  });
  return field;
}

// -------------------------------------------------------------
// Changer la mise en page, changer une image
// -------------------------------------------------------------

/**
 * Réécrit l'en-tête d'une slide pour une nouvelle mise en page : sa
 * directive `_class`, et la ligne d'image que cette mise en page attend.
 * Une image déjà présente est reprise ; sinon, on la demande. Une mise
 * en page sans image retire celle qui n'a plus lieu d'être.
 *
 * @param {EditorView} view
 * @param {number} index
 * @param {string} value
 * @param {SlideOptions} options
 * @returns {Promise<boolean>} Faux si rien n'a changé.
 */
async function setLayout(view, index, value, options) {
  const slide = analyzeSlides(view.state)[index];
  if (!slide) return false;
  const layout = LAYOUTS.find((l) => l.value === value) ?? { value, label: value };

  let url = slide.directive?.url ?? slide.bg?.url ?? null;
  if (layout.image && !url) {
    url = await options.pickImage(null);
    if (!url) return false;
  }

  const { doc } = view.state;
  /** Une ligne à retirer, avec la ligne vide qui la suit. */
  const removal = (/** @type {Line} */ line) => {
    let to = Math.min(line.to + 1, doc.length);
    if (to < doc.length && doc.lineAt(to).text.trim() === '') to = Math.min(doc.lineAt(to).to + 1, doc.length);
    return { from: line.from, to };
  };
  const removed = [slide.layout?.line, slide.directive?.line, slide.bg?.line].filter(Boolean).map((l) => removal(/** @type {Line} */ (l)));

  // L'en-tête se pose devant la première ligne de contenu de la slide.
  let at = slide.to;
  for (let pos = slide.from; pos < slide.to; ) {
    const line = doc.lineAt(pos);
    if (line.text.trim() !== '' && !removed.some((r) => line.from >= r.from && line.from < r.to)) {
      at = line.from;
      break;
    }
    pos = line.to + 1;
  }

  let head = '';
  if (layout.value) head += `<!-- _class: ${layout.value} -->\n`;
  if (layout.image === 'directive') head += `<!-- _backgroundImage: url('${url}') -->\n`;
  if (head) head += '\n';
  if (layout.image === 'bg') head += `![bg ${'bg' in layout ? layout.bg : ''}](${url})\n\n`;
  // Une slide qui ne commence pas par une ligne vide après son
  // séparateur : on en ajoute une, sans quoi « --- » suivi d'un texte
  // deviendrait un titre souligné.
  if (head && slide.separator && at === slide.from) head = `\n${head}`;

  const changes = [...removed, ...(head ? [{ from: at, insert: head }] : [])].sort((a, b) => a.from - b.from);
  view.dispatch({ changes });
  view.focus();
  return true;
}

/**
 * @param {EditorView} view
 * @param {number} index
 * @param {'directive' | 'bg'} kind
 * @param {string} url
 */
function replaceImage(view, index, kind, url) {
  const slide = analyzeSlides(view.state)[index];
  const target = kind === 'directive' ? slide?.directive : slide?.bg;
  if (!target) return;
  const insert =
    kind === 'directive'
      ? `<!-- _backgroundImage: url('${url}') -->`
      : `![bg${/** @type {Slide['bg']} */ (target).options ? ` ${/** @type {Slide['bg']} */ (target).options}` : ''}](${url})`;
  view.dispatch({ changes: { from: target.line.from, to: target.line.to, insert } });
  view.focus();
}
