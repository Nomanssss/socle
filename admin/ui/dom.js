// =============================================================
// dom.js - fabriquer des éléments sans innerHTML
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
