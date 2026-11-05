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

/**
 * Fabrique un élément. Les textes passent par des nœuds texte, jamais
 * par innerHTML : le contenu d'une leçon n'est pas du HTML de confiance.
 *
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {...(Node | string | null | false | undefined)} children
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    // La valeur d'un champ est une propriété, pas un attribut : posé en
    // attribut, le texte d'un <textarea> resterait vide.
    else if (key === 'value' || key === 'checked') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children) {
    if (child === null || child === false || child === undefined) continue;
    el.append(child);
  }
  return el;
}

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

/** Les éditeurs disponibles, par nom de composant. */
export const EDITORS = { Quiz: quiz };
