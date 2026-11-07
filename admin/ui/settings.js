// =============================================================
// settings.js - la page « Réglages » : socle.config.json en formulaire
//
// Une section par partie du fichier : le cours, les mentions légales,
// l'auteur, la charte (couleurs et polices), les leçons verrouillées.
// Sous chaque section, l'explication « _… » que le fichier porte déjà :
// l'aide reste écrite à un seul endroit, et l'admin la montre.
//
// L'enregistrement passe par le serveur, qui ne touche qu'aux champs
// prévus et réécrit le fichier dans son style. Si couleurs ou polices
// ont changé, il relance `npm run brand` ; son journal est affiché ici,
// et un refus de sa part laisse le fichier tel qu'il était.
// =============================================================

import { h } from './dom.js';

/**
 * @typedef {{
 *   request: (path: string, options?: Record<string, any>) => Promise<any>,
 *   openDialog: (editor: any, props: Record<string, unknown>) => Promise<Record<string, unknown> | null>,
 *   imagePicker: any,
 *   setStatus: (message: string, tone?: '' | 'ok' | 'dirty' | 'error') => void,
 * }} Deps
 */

/**
 * @param {HTMLElement} root
 * @param {Deps} deps
 */
export function mountSettings(root, { request, openDialog, imagePicker, setStatus }) {
  /** @type {{ config: Record<string, any>, hash: string } | null} */
  let loaded = null;
  let saved = '';
  let saving = false;

  const form = h('form', { class: 'settings', novalidate: true });
  const saveButton = h('button', { type: 'submit', class: 'button button--primary', disabled: true }, 'Enregistrer les réglages');
  const log = h('details', { class: 'settings__log', hidden: true }, h('summary', {}, 'Journal de npm run brand'), h('pre', {}));
  root.replaceChildren(
    h('h1', { class: 'media-view__title' }, 'Réglages'),
    h(
      'p',
      { class: 'media-view__intro' },
      'Tout ce qui se règle dans socle.config.json. L’enregistrement ne touche qu’aux champs de cette page : les explications du fichier et les leçons verrouillées restent en place.'
    ),
    form
  );

  /**
   * Un champ, relié à un chemin de la configuration (« site.title »).
   *
   * @param {string} path
   * @param {string} label
   * @param {{ help?: string, multiline?: boolean, type?: string, placeholder?: string, wide?: boolean, required?: boolean }} [options]
   */
  const field = (path, label, { help, multiline, type = 'text', placeholder, wide, required } = {}) =>
    h(
      'label',
      { class: wide || multiline ? 'field field--wide' : 'field' },
      h('span', { class: 'field__label' }, label, required && h('abbr', { title: 'obligatoire' }, ' *')),
      multiline
        ? h('textarea', { 'data-path': path, rows: 4, placeholder })
        : h('input', { 'data-path': path, type, placeholder, spellcheck: type === 'text' ? 'true' : 'false' }),
      help && h('span', { class: 'field__help' }, help)
    );

  /** Une section du formulaire, avec l'explication du fichier sous son titre. */
  const section = (/** @type {string} */ title, /** @type {string | undefined} */ help, /** @type {Node[]} */ ...fields) =>
    h(
      'section',
      { class: 'panel' },
      h('h2', { class: 'panel__title' }, title),
      help && h('p', { class: 'field__help settings__help' }, help),
      h('div', { class: 'fields' }, ...fields)
    );

  // -- Couleurs : un sélecteur et le code hexadécimal, synchronisés -------
  const color = (/** @type {string} */ key, /** @type {string} */ label, /** @type {string} */ help) => {
    const text = h('input', { 'data-path': `colors.${key}`, placeholder: '#4647AE', spellcheck: 'false', 'aria-label': `${label} (hexadécimal)` });
    const picker = h('input', { type: 'color', class: 'settings__swatch', 'aria-label': `${label} (sélecteur)` });
    picker.addEventListener('input', () => {
      text.value = picker.value;
      changed();
    });
    text.addEventListener('input', () => {
      if (/^#[0-9a-f]{6}$/i.test(text.value)) picker.value = text.value;
    });
    return h(
      'div',
      { class: 'field' },
      h('span', { class: 'field__label' }, label),
      h('div', { class: 'settings__color' }, picker, text),
      h('span', { class: 'field__help' }, help)
    );
  };

  // -- Photo de l'auteur ---------------------------------------------------
  const photoPreview = h('div', { class: 'cover__thumb settings__photo' });
  const photoInput = h('input', { type: 'hidden', 'data-path': 'author.photo' });
  const photoRemove = h('button', { type: 'button', class: 'link link--danger' }, 'Retirer');
  const renderPhoto = () => {
    const photo = photoInput.value;
    photoRemove.hidden = !photo;
    // Juste copiée dans public/, la photo n'est servie qu'une fraction de
    // seconde plus tard - le temps que le serveur de dev la remarque. Une
    // seconde tentative suffit.
    const img = h('img', { src: photo, alt: '' });
    img.addEventListener('error', () => setTimeout(() => (img.src = `${photo}?${Date.now()}`), 400), { once: true });
    photoPreview.replaceChildren(photo ? img : h('span', { class: 'cover__none' }, 'Aucune'));
  };
  const photoPick = h('button', { type: 'button', class: 'button button--small' }, 'Choisir dans la médiathèque');
  photoPick.addEventListener('click', async () => {
    const picked = await openDialog(imagePicker, { path: null });
    if (!picked) return;
    try {
      const { photo } = await request('/settings/photo', { method: 'POST', json: { path: picked.path } });
      photoInput.value = photo;
      renderPhoto();
      changed();
    } catch (error) {
      setStatus(/** @type {Error} */ (error).message, 'error');
    }
  });
  photoRemove.addEventListener('click', () => {
    photoInput.value = '';
    renderPhoto();
    changed();
  });

  // -- Liens de l'auteur ---------------------------------------------------
  const links = h('ol', { class: 'sources' });
  const linkRow = (/** @type {{ label?: string, url?: string }} */ link = {}) => {
    const row = h(
      'li',
      { class: 'source' },
      h('input', { class: 'link__label', value: link.label ?? '', placeholder: 'Libellé (Mastodon, site…)', 'aria-label': 'Libellé du lien' }),
      h('input', { class: 'link__url', value: link.url ?? '', placeholder: 'https://…', type: 'url', 'aria-label': 'Adresse du lien' }),
      h('button', {
        type: 'button',
        class: 'icon icon--danger',
        title: 'Retirer ce lien',
        'aria-label': 'Retirer ce lien',
        onclick: () => {
          row.remove();
          changed();
        },
      }, '✕')
    );
    return row;
  };
  const addLink = h('button', { type: 'button', class: 'button button--small' }, '+ Ajouter un lien');
  addLink.addEventListener('click', () => {
    const row = linkRow();
    links.append(row);
    /** @type {HTMLInputElement} */ (row.querySelector('input')).focus();
    changed();
  });

  const lockedList = h('ul', { class: 'settings__locked' });

  // -- Lecture et écriture du formulaire -----------------------------------
  const get = (/** @type {Record<string, any>} */ obj, /** @type {string} */ path) =>
    path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), obj);
  const set = (/** @type {Record<string, any>} */ obj, /** @type {string} */ path, /** @type {unknown} */ value) => {
    const keys = path.split('.');
    let target = obj;
    for (const key of keys.slice(0, -1)) target = target[key] ??= {};
    target[/** @type {string} */ (keys.at(-1))] = value;
  };

  /** Les champs de la page, en objet prêt à envoyer. */
  const collect = () => {
    /** @type {Record<string, any>} */
    const config = {};
    for (const input of form.querySelectorAll('[data-path]')) {
      set(config, /** @type {HTMLElement} */ (input).dataset.path ?? '', /** @type {HTMLInputElement} */ (input).value);
    }
    set(
      config,
      'author.links',
      [...links.children].map((row) => ({
        label: /** @type {HTMLInputElement} */ (row.querySelector('.link__label')).value,
        url: /** @type {HTMLInputElement} */ (row.querySelector('.link__url')).value,
      }))
    );
    return config;
  };

  const fill = (/** @type {Record<string, any>} */ config) => {
    for (const input of form.querySelectorAll('[data-path]')) {
      const value = get(config, /** @type {HTMLElement} */ (input).dataset.path ?? '');
      /** @type {HTMLInputElement} */ (input).value = value ?? '';
    }
    for (const swatch of form.querySelectorAll('.settings__color')) {
      const [picker, text] = /** @type {HTMLInputElement[]} */ ([...swatch.children]);
      if (/^#[0-9a-f]{6}$/i.test(text.value)) picker.value = text.value;
    }
    links.replaceChildren(...(config.author?.links ?? []).map(linkRow));
    lockedList.replaceChildren(
      ...(config.locked?.length
        ? config.locked.map((/** @type {string} */ id) => h('li', {}, h('a', { href: `#${id}` }, id)))
        : [h('li', { class: 'field__help' }, 'Aucune.')])
    );
    renderPhoto();
  };

  const isDirty = () => loaded !== null && JSON.stringify(collect()) !== saved;
  const changed = () => {
    saveButton.disabled = !isDirty() || saving;
  };
  form.addEventListener('input', changed);

  /** @param {boolean} [force] */
  async function save(force = false) {
    if (!loaded || saving || !isDirty()) return;
    saving = true;
    saveButton.disabled = true;
    log.hidden = true;
    setStatus('Enregistrement…');
    try {
      const result = await request('/settings', { method: 'PUT', json: { config: collect(), hash: loaded.hash, force } });
      if (result.brand) showLog(result.brand.log);
      await load();
      setStatus(result.brand ? 'Réglages enregistrés, charte régénérée.' : 'Réglages enregistrés.', 'ok');
    } catch (error) {
      const err = /** @type {any} */ (error);
      if (err.status === 409 && confirm(`${err.message}\n\nÉcraser quand même avec les valeurs de cette page ?`)) {
        saving = false;
        return save(true);
      }
      if (err.payload?.brand) showLog(err.payload.brand.log);
      setStatus(err.message, 'error');
    } finally {
      saving = false;
      changed();
    }
  }

  const showLog = (/** @type {string} */ text) => {
    /** @type {HTMLElement} */ (log.querySelector('pre')).textContent = text;
    log.hidden = false;
    log.open = true;
  };

  async function load() {
    const { config, hash } = await request('/settings');
    loaded = { config, hash };
    fill(config);
    saved = JSON.stringify(collect());
    changed();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    save();
  });

  // -- La page -------------------------------------------------------------
  const help = (/** @type {string} */ key) => loaded?.config[key];

  async function render() {
    await load();
    form.replaceChildren(
      section(
        'Le cours',
        help('_site'),
        field('site.title', 'Nom du cours', { required: true }),
        field('site.lang', 'Langue', { help: help('_lang'), placeholder: 'fr-FR' }),
        field('site.tagline', 'Accroche', { wide: true, help: 'La phrase affichée sous le nom du cours, sur l’accueil.' }),
        field('site.url', 'Adresse publique', { type: 'url', wide: true, placeholder: 'https://mon-cours.fr', help: help('_url') })
      ),
      section(
        'Mentions légales',
        'Affichées sur /mentions-legales/. Un champ vide n’y apparaît pas, et le build le signale.',
        field('site.legal.editor', 'Éditeur du site'),
        field('site.legal.publisher', 'Directeur de la publication'),
        field('site.legal.email', 'Contact', { type: 'email', placeholder: 'contact@exemple.fr' }),
        field('site.legal.address', 'Adresse', { multiline: true }),
        field('site.legal.host', 'Hébergeur', { multiline: true, help: 'Son nom et son adresse.' })
      ),
      section(
        'Auteur',
        help('_author'),
        field('author.name', 'Nom', { help: 'Repris aussi sur la slide de fin des présentations.' }),
        h(
          'div',
          { class: 'field' },
          h('span', { class: 'field__label' }, 'Photo'),
          h('div', { class: 'cover' }, photoPreview, h('div', { class: 'cover__actions' }, photoPick, photoRemove), photoInput),
          h('span', { class: 'field__help' }, 'Carrée de préférence. Copiée dans public/photos/.')
        ),
        field('author.photoAlt', 'Description de la photo', { wide: true, help: 'Vide si elle est purement décorative.' }),
        field('author.bio', 'Présentation', { multiline: true }),
        h('div', { class: 'field field--wide' }, h('span', { class: 'field__label' }, 'Liens'), links, addLink)
      ),
      section(
        'Charte',
        'Trois couleurs et deux polices : tout le reste en est déduit, sur le site comme dans les slides. À l’enregistrement, la charte est régénérée (npm run brand) : elle vérifie les contrastes, et télécharge les polices quand elles changent - seul ce cas demande une connexion.',
        color('primary', 'Couleur principale', 'Liens, boutons, titres de slides.'),
        color('text', 'Texte', 'Le texte, et les aplats les plus foncés.'),
        color('page', 'Fond de page', 'En général blanc, ou presque.'),
        h('div', { class: 'field' }),
        field('fonts.heading', 'Police des titres', { help: 'Le nom exact d’une famille Google Fonts.' }),
        field('fonts.body', 'Police du texte', { help: 'Le nom exact d’une famille Google Fonts.' })
      ),
      h(
        'section',
        { class: 'panel' },
        h('h2', { class: 'panel__title' }, 'Leçons verrouillées'),
        h('p', { class: 'field__help settings__help' }, 'Elles se verrouillent et se rouvrent depuis le sommaire, avec le cadenas de chaque leçon.'),
        lockedList
      ),
      h('div', { class: 'settings__actions' }, saveButton),
      log
    );
    fill(loaded.config);
    saved = JSON.stringify(collect());
    changed();
  }

  return {
    render,
    save,
    isDirty,
  };
}
