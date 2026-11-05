// =============================================================
// editors.js - les éditeurs de composants
//
// Un éditeur reçoit les propriétés d'un composant (déjà lues comme des
// valeurs par le serveur) et rend un formulaire. `read()` rend les
// propriétés modifiées, ou lève une erreur lisible si elles ne
// permettent pas d'afficher le composant.
//
// Les propriétés qu'un éditeur ne connaît pas sont conservées telles
// quelles : un champ ajouté au composant plus tard ne doit pas
// disparaître au premier passage dans l'admin.
// =============================================================

import { h } from './dom.js';
import { mountLibrary, thumbnail } from './media.js';

export { h };

export class EditorError extends Error {}

let uid = 0;

// -------------------------------------------------------------
// Quiz
// -------------------------------------------------------------

/**
 * @typedef {{ question: string, options: string[], answer: number, explanation?: string, [key: string]: unknown }} Question
 */

const quiz = {
  label: 'Quiz',
  /** Ce qu'on insère quand on ajoute un quiz. */
  create: () => ({ questions: [{ question: '', options: ['', ''], answer: 0, explanation: '' }] }),

  /**
   * @param {HTMLElement} root
   * @param {{ title?: string, questions?: Question[], [key: string]: unknown }} props
   */
  mount(root, props) {
    const id = `quiz-${++uid}`;
    /** @type {Question[]} */
    const questions = structuredClone(props.questions ?? []).map((q) => ({
      ...q,
      question: String(q.question ?? ''),
      options: Array.isArray(q.options) ? q.options.map(String) : ['', ''],
      answer: Number.isInteger(q.answer) ? q.answer : 0,
      explanation: String(q.explanation ?? ''),
    }));
    let title = typeof props.title === 'string' ? props.title : '';

    const list = h('ol', { class: 'quiz-editor__questions' });

    /** Redessine la liste ; `focus` désigne le champ à reprendre ensuite. */
    function render(focus = '') {
      list.replaceChildren(...questions.map((q, i) => renderQuestion(q, i)));
      if (focus) /** @type {HTMLElement | null} */ (list.querySelector(focus))?.focus();
    }

    /**
     * @param {Question} q
     * @param {number} i
     */
    function renderQuestion(q, i) {
      const name = `${id}-q${i}`;
      const move = (/** @type {number} */ to) => {
        questions.splice(to, 0, questions.splice(i, 1)[0]);
        render(`[data-question="${to}"]`);
      };

      return h(
        'li',
        { class: 'card' },
        h(
          'div',
          { class: 'card__header' },
          h('h3', { class: 'card__title' }, `Question ${i + 1}`),
          h('button', { type: 'button', class: 'icon', title: 'Monter', 'aria-label': `Monter la question ${i + 1}`, disabled: i === 0, onclick: () => move(i - 1) }, '↑'),
          h('button', { type: 'button', class: 'icon', title: 'Descendre', 'aria-label': `Descendre la question ${i + 1}`, disabled: i === questions.length - 1, onclick: () => move(i + 1) }, '↓'),
          h('button', {
            type: 'button',
            class: 'icon icon--danger',
            title: 'Supprimer',
            'aria-label': `Supprimer la question ${i + 1}`,
            disabled: questions.length === 1,
            onclick: () => {
              questions.splice(i, 1);
              render();
            },
          }, '✕')
        ),
        h(
          'label',
          { class: 'field field--wide' },
          h('span', { class: 'field__label' }, 'Intitulé'),
          h('textarea', { rows: 2, 'data-question': String(i), value: q.question, oninput: (/** @type {any} */ e) => (q.question = e.target.value) })
        ),
        h(
          'fieldset',
          { class: 'field field--wide' },
          h('legend', { class: 'field__label' }, 'Réponses - cochez la bonne'),
          h(
            'ol',
            { class: 'options' },
            ...q.options.map((option, j) =>
              h(
                'li',
                { class: 'option' },
                h('input', {
                  type: 'radio',
                  name,
                  checked: q.answer === j,
                  'aria-label': `Réponse ${j + 1} correcte`,
                  onchange: () => (q.answer = j),
                }),
                h('input', {
                  class: 'option__text',
                  value: option,
                  'data-option': `${i}-${j}`,
                  'aria-label': `Réponse ${j + 1}`,
                  placeholder: `Réponse ${j + 1}`,
                  oninput: (/** @type {any} */ e) => (q.options[j] = e.target.value),
                }),
                h('button', {
                  type: 'button',
                  class: 'icon icon--danger',
                  title: 'Retirer cette réponse',
                  'aria-label': `Retirer la réponse ${j + 1}`,
                  disabled: q.options.length <= 2,
                  onclick: () => {
                    q.options.splice(j, 1);
                    // La bonne réponse suit son option : retirer une
                    // option au-dessus d'elle décale son numéro.
                    if (q.answer === j) q.answer = 0;
                    else if (q.answer > j) q.answer--;
                    render();
                  },
                }, '✕')
              )
            )
          ),
          h('button', {
            type: 'button',
            class: 'button button--small',
            onclick: () => {
              q.options.push('');
              render(`[data-option="${i}-${q.options.length - 1}"]`);
            },
          }, '+ Ajouter une réponse')
        ),
        h(
          'label',
          { class: 'field field--wide' },
          h('span', { class: 'field__label' }, 'Explication'),
          h('textarea', { rows: 2, value: q.explanation ?? '', oninput: (/** @type {any} */ e) => (q.explanation = e.target.value) }),
          h('span', { class: 'field__help' }, 'Affichée après validation. Facultative, mais c’est elle qui fait apprendre.')
        )
      );
    }

    root.replaceChildren(
      h(
        'label',
        { class: 'field field--wide' },
        h('span', { class: 'field__label' }, 'Titre du quiz'),
        h('input', { value: title, placeholder: 'Quiz', oninput: (/** @type {any} */ e) => (title = e.target.value) })
      ),
      list,
      h('button', {
        type: 'button',
        class: 'button',
        onclick: () => {
          questions.push({ question: '', options: ['', ''], answer: 0, explanation: '' });
          render(`[data-question="${questions.length - 1}"]`);
        },
      }, '+ Ajouter une question')
    );
    render();
    /** @type {HTMLElement | null} */ (root.querySelector('[data-question="0"]'))?.focus();

    return {
      read() {
        questions.forEach((q, i) => {
          const n = `question ${i + 1}`;
          if (!q.question.trim()) throw new EditorError(`L’intitulé de la ${n} est vide.`);
          if (q.options.length < 2) throw new EditorError(`La ${n} doit proposer au moins deux réponses.`);
          q.options.forEach((option, j) => {
            if (!option.trim()) throw new EditorError(`La réponse ${j + 1} de la ${n} est vide.`);
          });
          if (!(q.answer >= 0 && q.answer < q.options.length)) throw new EditorError(`Cochez la bonne réponse de la ${n}.`);
        });

        const cleaned = questions.map(({ explanation, ...q }) => ({
          ...q,
          question: q.question.trim(),
          options: q.options.map((o) => o.trim()),
          ...(explanation?.trim() ? { explanation: explanation.trim() } : {}),
        }));

        // Le titre garde sa place s'il existait ; nouveau, il passe en
        // tête, comme dans les leçons écrites à la main.
        const { title: _previous, ...rest } = props;
        const next = 'title' in props ? { ...props } : { title: '', ...rest };
        next.title = title.trim();
        next.questions = cleaned;
        if (!next.title) delete next.title;
        return next;
      },
    };
  },
};

// -------------------------------------------------------------
// Figure
//
// L'image n'arrive pas ici comme un import : app.js l'a déjà traduite
// en { __asset: "couverture.jpg" }, un fichier de la médiathèque. Les
// imports à écrire ou à retirer, c'est son affaire, pas celle de
// l'éditeur.
// -------------------------------------------------------------

const figure = {
  label: 'Image',
  create: () => ({ src: null, alt: '', caption: '' }),

  /**
   * @param {HTMLElement} root
   * @param {{ src?: any, alt?: string, caption?: string, [key: string]: unknown }} props
   */
  mount(root, props) {
    const original = props.src?.__asset ?? null;
    let asset = original;
    // Une figure existante dont l'alt est vide a été déclarée décorative ;
    // une nouvelle figure, elle, doit d'abord être décrite.
    let decorative = 'alt' in props && props.alt === '' && Boolean(original);

    const preview = h('div', { class: 'figure-editor__preview' });
    const library = h('div', { class: 'figure-editor__library' });
    const alt = h('textarea', { rows: 2, value: props.alt ?? '', disabled: decorative });
    const caption = h('input', { value: props.caption ?? '' });

    function showPreview() {
      if (!asset) {
        preview.replaceChildren();
        preview.hidden = true;
        return;
      }
      preview.hidden = false;
      preview.replaceChildren(
        thumbnail({ path: asset, name: asset }),
        h(
          'div',
          {},
          h('strong', {}, asset),
          h('button', { type: 'button', class: 'button button--small', onclick: () => toggleLibrary(true) }, 'Changer d’image')
        )
      );
    }

    /** @param {boolean} open */
    function toggleLibrary(open) {
      library.hidden = !open;
      if (open && !library.childElementCount) {
        mountLibrary(library, {
          pick: true,
          selected: asset,
          onSelect: (media) => {
            asset = media.path;
            showPreview();
            library.hidden = true;
          },
        });
      }
    }

    root.replaceChildren(
      h('div', { class: 'field field--wide' }, h('span', { class: 'field__label' }, 'Image'), preview, library),
      h(
        'label',
        { class: 'field field--wide' },
        h('span', { class: 'field__label' }, 'Description de l’image'),
        alt,
        h('span', { class: 'field__help' }, 'Ce que dirait quelqu’un qui décrit l’image à une personne qui ne la voit pas. Un lecteur d’écran la lira à voix haute.')
      ),
      h(
        'label',
        { class: 'check' },
        h('input', {
          type: 'checkbox',
          checked: decorative,
          onchange: (/** @type {any} */ e) => {
            decorative = e.target.checked;
            alt.disabled = decorative;
          },
        }),
        h('span', {}, 'Image purement décorative : elle n’apporte rien que le texte ne dise déjà.')
      ),
      h(
        'label',
        { class: 'field field--wide' },
        h('span', { class: 'field__label' }, 'Légende'),
        caption,
        h('span', { class: 'field__help' }, 'Facultative. Affichée sous l’image, pour tout le monde.')
      )
    );
    showPreview();
    toggleLibrary(!asset);

    return {
      read() {
        if (!asset) throw new EditorError('Choisissez une image, ou glissez-en une dans la médiathèque.');
        const description = alt.value.trim();
        if (!decorative && !description) {
          throw new EditorError('Décrivez l’image, ou cochez « Image purement décorative ».');
        }
        const next = { ...props, src: { __asset: asset }, alt: decorative ? '' : description };
        if (caption.value.trim()) next.caption = caption.value.trim();
        else delete next.caption;
        // Des dimensions écrites pour l'ancienne image déformeraient la
        // nouvelle : sans elles, Astro lit celles du fichier.
        if (asset !== original) {
          delete next.width;
          delete next.height;
        }
        return next;
      },
    };
  },
};

/**
 * Choisir une image, sans composant autour : la couverture d'une leçon.
 * `read()` rend { path }.
 */
export const imagePicker = {
  label: 'Choisir une image',
  /**
   * @param {HTMLElement} root
   * @param {{ path?: string | null }} props
   */
  mount(root, { path = null }) {
    let selected = path;
    mountLibrary(root, { pick: true, selected, onSelect: (media) => (selected = media.path) });
    return {
      read() {
        if (!selected) throw new EditorError('Cliquez sur une image pour la choisir.');
        return { path: selected };
      },
    };
  },
};

/** Les éditeurs disponibles, par nom de composant. */
export const EDITORS = { Quiz: quiz, Figure: figure };
