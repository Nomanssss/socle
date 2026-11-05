// =============================================================
// media.js - la médiathèque, côté interface
//
// Une seule grille d'images, montée de deux façons :
//
//   - en GESTION (la page « Médiathèque ») : on envoie, on voit où
//     chaque image sert, on supprime celles qui ne servent plus ;
//   - en CHOIX (une figure, une couverture) : on clique une image pour
//     la retenir, et l'on peut en envoyer une nouvelle sans quitter
//     l'éditeur.
//
// Dans les deux cas, envoyer une image se fait en la glissant sur la
// grille : personne n'a à savoir ce qu'est src/assets/.
// =============================================================

import { h } from './dom.js';

const API = './api';

/** @typedef {{ path: string, name: string, size: number, modified: number, usages: { kind: string, id: string | null, label: string }[] }} Media */

/** L'adresse d'une vignette. La date de modification déjoue le cache. */
export function mediaUrl(/** @type {{ path: string, modified?: number }} */ media) {
  return `${API}/media/file?path=${encodeURIComponent(media.path)}${media.modified ? `&v=${Math.round(media.modified)}` : ''}`;
}

/** @returns {Promise<Media[]>} */
export async function fetchMedia() {
  const response = await fetch(`${API}/media`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error);
  return payload.media;
}

/**
 * Envoie des fichiers un par un ; les refus n'arrêtent pas les autres.
 *
 * @param {FileList | File[]} files
 * @returns {Promise<{ sent: Media[], errors: string[] }>}
 */
export async function uploadFiles(files) {
  const sent = [];
  const errors = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      errors.push(`« ${file.name} » n’est pas une image.`);
      continue;
    }
    const response = await fetch(`${API}/media?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) sent.push(payload.media);
    else errors.push(`« ${file.name} » : ${payload.error ?? `erreur ${response.status}`}`);
  }
  return { sent, errors };
}

/**
 * @param {HTMLElement} root
 * @param {{ pick?: boolean, selected?: string | null, onSelect?: (media: Media) => void }} [options]
 */
export function mountLibrary(root, { pick = false, selected = null, onSelect } = {}) {
  /** @type {Media[]} */
  let media = [];
  let query = '';
  let current = selected;

  const input = h('input', {
    type: 'file',
    accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif,image/svg+xml',
    multiple: true,
    hidden: true,
    onchange: () => {
      if (input.files?.length) send(input.files);
      input.value = '';
    },
  });
  const message = h('p', { class: 'library__message', role: 'status', 'aria-live': 'polite' });
  const grid = h('ul', { class: 'library__grid', role: pick ? 'listbox' : 'list', 'aria-label': 'Images du cours' });
  const search = h('input', {
    type: 'search',
    class: 'library__search',
    placeholder: 'Rechercher une image…',
    'aria-label': 'Rechercher une image',
    oninput: () => {
      query = search.value.trim().toLowerCase();
      render();
    },
  });

  const drop = h(
    'div',
    { class: 'library__drop' },
    h('strong', {}, 'Glissez vos images ici'),
    h('span', {}, ' ou '),
    h('button', { type: 'button', class: 'button button--small', onclick: () => input.click() }, 'choisissez des fichiers'),
    h('span', { class: 'library__formats' }, 'JPG, PNG, WebP, GIF, AVIF ou SVG.'),
    input
  );

  const library = h('div', { class: `library${pick ? ' library--pick' : ''}` }, drop, h('div', { class: 'library__tools' }, search, message), grid);

  // Le dépôt se fait sur toute la médiathèque, pas sur la seule zone
  // en pointillés : viser une cible précise en glissant est pénible.
  let depth = 0;
  library.addEventListener('dragenter', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    depth++;
    library.classList.add('library--over');
  });
  library.addEventListener('dragover', (event) => {
    if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
  });
  library.addEventListener('dragleave', () => {
    if (--depth <= 0) library.classList.remove('library--over');
  });
  library.addEventListener('drop', (event) => {
    event.preventDefault();
    depth = 0;
    library.classList.remove('library--over');
    if (event.dataTransfer?.files.length) send(event.dataTransfer.files);
  });

  /** @param {FileList | File[]} files */
  async function send(files) {
    say(`Envoi de ${files.length} image${files.length > 1 ? 's' : ''}…`);
    const { sent, errors } = await uploadFiles(files);
    await refresh();
    // En mode choix, l'image qu'on vient d'envoyer est celle qu'on veut.
    if (pick && sent.length) choose(sent[sent.length - 1]);
    say(
      [sent.length && `${sent.length} image${sent.length > 1 ? 's' : ''} ajoutée${sent.length > 1 ? 's' : ''}.`, ...errors]
        .filter(Boolean)
        .join(' '),
      errors.length ? 'error' : 'ok'
    );
  }

  /**
   * @param {string} text
   * @param {'' | 'ok' | 'error'} [tone]
   */
  function say(text, tone = '') {
    message.textContent = text;
    message.dataset.tone = tone;
  }

  /** @param {Media} item */
  function choose(item) {
    current = item.path;
    render();
    onSelect?.(item);
  }

  async function refresh() {
    try {
      media = await fetchMedia();
      render();
    } catch (error) {
      say(error.message, 'error');
    }
  }

  function render() {
    const shown = media.filter((m) => !query || m.path.toLowerCase().includes(query));
    if (!media.length) {
      grid.replaceChildren(h('li', { class: 'library__empty' }, 'Aucune image pour l’instant. Glissez-en une ci-dessus.'));
      return;
    }
    if (!shown.length) {
      grid.replaceChildren(h('li', { class: 'library__empty' }, `Aucune image ne correspond à « ${query} ».`));
      return;
    }
    grid.replaceChildren(...shown.map((item) => (pick ? pickCard(item) : manageCard(item))));
  }

  /** @param {Media} item */
  function pickCard(item) {
    const isCurrent = item.path === current;
    return h(
      'li',
      { role: 'option', 'aria-selected': String(isCurrent) },
      h(
        'button',
        { type: 'button', class: `media${isCurrent ? ' media--current' : ''}`, onclick: () => choose(item), title: item.path },
        thumbnail(item, { lazy: true }),
        h('span', { class: 'media__name' }, item.name)
      )
    );
  }

  /** @param {Media} item */
  function manageCard(item) {
    const dimensions = h('span', { class: 'media__meta' }, size(item.size));
    const img = thumbnail(item, { lazy: true });
    img.addEventListener('load', () => {
      dimensions.textContent = `${img.naturalWidth} × ${img.naturalHeight} px · ${size(item.size)}`;
    });
    return h(
      'li',
      { class: 'media' },
      h('a', { href: mediaUrl(item), target: '_blank', rel: 'noopener', class: 'media__open', title: 'Ouvrir en grand' }, img),
      h('span', { class: 'media__name' }, item.path),
      dimensions,
      item.usages.length
        ? h(
            'span',
            { class: 'media__usages' },
            'Utilisée dans ',
            ...item.usages.flatMap((usage, i) => [
              i ? ', ' : '',
              usage.id ? h('a', { href: `#${usage.id}` }, usage.label) : usage.label,
            ])
          )
        : h(
            'span',
            { class: 'media__usages media__usages--none' },
            'Inutilisée · ',
            h('button', {
              type: 'button',
              class: 'link link--danger',
              onclick: async () => {
                if (!confirm(`Supprimer définitivement « ${item.path} » ?`)) return;
                const response = await fetch(`${API}/media?path=${encodeURIComponent(item.path)}`, { method: 'DELETE' });
                const payload = await response.json().catch(() => ({}));
                say(response.ok ? `« ${item.path} » supprimée.` : payload.error, response.ok ? 'ok' : 'error');
                refresh();
              },
            }, 'Supprimer')
          )
    );
  }

  root.replaceChildren(library);
  refresh();
  return { refresh };
}

/**
 * @param {{ path: string, name: string, modified?: number }} item
 * @param {{ lazy?: boolean }} [options] Différer le chargement : pour une grille, pas pour une image seule.
 */
export function thumbnail(item, { lazy = false } = {}) {
  return h('img', { class: 'media__thumb', src: mediaUrl(item), alt: '', loading: lazy ? 'lazy' : false, decoding: 'async' });
}

/** @param {number} bytes */
function size(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}
