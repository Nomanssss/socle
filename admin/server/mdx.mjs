// =============================================================
// mdx.mjs - lire les composants d'une leçon, et les réécrire
//
// Dans une leçon, un composant est du JavaScript :
//
//   <Quiz questions={[{ question: "…", options: ["…"], answer: 0 }]} />
//
// Pour l'éditer dans un formulaire, il faut le lire comme une VALEUR -
// un tableau d'objets - et non comme du texte. On analyse donc le
// texte avec le même parseur que le MDX d'Astro (micromark + son
// extension mdxjs), qui donne pour chaque composant sa position exacte
// dans le fichier et l'arbre de ses expressions (estree).
//
// Une expression n'est éditable que si elle est une valeur littérale :
// textes, nombres, booléens, tableaux et objets de ceux-ci. Dès qu'il y
// a une variable, un appel ou un calcul, le composant reste du texte -
// l'admin le signale, et ne prétend pas savoir le réécrire.
//
// La réécriture est ciblée : printComponent() produit le texte d'UN
// composant, que l'interface substitue à l'emplacement d'origine. Le
// reste de la leçon n'est jamais régénéré.
// =============================================================

import { fromMarkdown } from 'mdast-util-from-markdown';
import { mdxjs } from 'micromark-extension-mdxjs';
import { mdxFromMarkdown } from 'mdast-util-mdx';
import { AdminError } from './lessons.mjs';

// La façon d'écrire chaque composant dans le texte, quand elle s'écarte
// du cas général (un objet par bloc, une propriété par ligne). Celle de
// la Timeline est la plus compacte : une étape par ligne.
const STYLES = {
  Timeline: { inlineObjects: true },
  Flashcards: { inlineObjects: true },
  DragMatch: { inlineObjects: true },
};

class NotLiteral extends Error {}

/**
 * Tous les composants d'un texte de leçon, dans l'ordre du texte.
 *
 * @param {string} body Le texte de la leçon, SANS son en-tête.
 */
export function findComponents(body) {
  let tree;
  try {
    tree = fromMarkdown(body, {
      extensions: [mdxjs()],
      mdastExtensions: [mdxFromMarkdown()],
    });
  } catch (error) {
    // Un texte en cours de frappe est souvent invalide : ce n'est pas une
    // erreur de l'admin, c'est une information pour l'auteur.
    const place = error.line ? ` (ligne ${error.line})` : '';
    return { components: [], error: `Le MDX ne se lit pas${place} : ${error.reason ?? error.message}` };
  }

  const imports = [];
  const components = [];

  visit(tree, (node) => {
    if (node.type === 'mdxjsEsm') {
      for (const match of node.value.matchAll(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/gm)) {
        imports.push({ name: match[1], from: match[2] });
      }
      return;
    }
    if (node.type !== 'mdxJsxFlowElement' || !node.name || !/^[A-Z]/.test(node.name)) return;

    const start = node.position.start.offset;
    const end = node.position.end.offset;
    const component = {
      name: node.name,
      start,
      end,
      line: node.position.start.line,
      // La colonne de départ : un composant posé dans une liste est
      // indenté, et sa réécriture doit l'être aussi.
      indent: node.position.start.column - 1,
      props: null,
      editable: false,
      reason: '',
    };

    try {
      if (node.children.length) throw new NotLiteral('il a un contenu entre ses balises');
      component.props = readProps(node.attributes);
      component.editable = true;
    } catch (error) {
      if (!(error instanceof NotLiteral)) throw error;
      component.reason = `Non éditable ici : ${error.message}.`;
    }
    components.push(component);
  });

  return { components, imports, error: null };
}

/** @param {any[]} attributes */
function readProps(attributes) {
  /** @type {Record<string, unknown>} */
  const props = {};
  for (const attribute of attributes) {
    if (attribute.type !== 'mdxJsxAttribute') throw new NotLiteral('il utilise une décomposition {...}');
    const { name, value } = attribute;
    if (value === null || value === undefined) props[name] = true;
    else if (typeof value === 'string') props[name] = value;
    else {
      const program = value.data?.estree;
      if (program?.comments?.length) throw new NotLiteral(`la propriété « ${name} » contient des commentaires`);
      const statement = program?.body?.[0];
      if (statement?.type !== 'ExpressionStatement') throw new NotLiteral(`la propriété « ${name} » est vide`);
      props[name] = literal(statement.expression, name);
    }
  }
  return props;
}

/**
 * Convertit une expression estree en valeur JavaScript, si et seulement
 * si elle est littérale.
 *
 * @param {any} node
 * @param {string} prop
 * @returns {unknown}
 */
function literal(node, prop) {
  switch (node.type) {
    case 'Literal':
      if (node.regex || typeof node.value === 'bigint') break;
      return node.value;
    case 'TemplateLiteral':
      if (node.expressions.length) break;
      return node.quasis.map((q) => q.value.cooked).join('');
    case 'UnaryExpression':
      if (node.operator === '-' && node.argument.type === 'Literal' && typeof node.argument.value === 'number') {
        return -node.argument.value;
      }
      break;
    case 'ArrayExpression':
      return node.elements.map((element) => {
        if (!element || element.type === 'SpreadElement') throw new NotLiteral(`« ${prop} » n’est pas une liste simple`);
        return literal(element, prop);
      });
    case 'ObjectExpression': {
      /** @type {Record<string, unknown>} */
      const object = {};
      for (const property of node.properties) {
        if (property.type !== 'Property' || property.computed || property.kind !== 'init' || property.method || property.shorthand) {
          throw new NotLiteral(`« ${prop} » contient un objet calculé`);
        }
        const key = property.key.type === 'Identifier' ? property.key.name : String(property.key.value);
        object[key] = literal(property.value, prop);
      }
      return object;
    }
  }
  throw new NotLiteral(`« ${prop} » contient du code (${node.type})`);
}

/**
 * Le texte d'un composant, écrit comme dans les leçons du cours :
 *
 *   <Quiz questions={[          <Quiz
 *     {                           title="…"
 *       question: "…",            questions={[
 *       …                           …
 *     },                          ]}
 *   ]} />                       />
 *
 * Une seule propriété tient sur la ligne de la balise ; à partir de
 * deux, une par ligne. `indent` décale toutes les lignes sauf la
 * première, qui est déjà à sa place dans le texte.
 *
 * @param {unknown} name
 * @param {unknown} props
 * @param {unknown} [indent]
 */
export function printComponent(name, props, indent = 0) {
  if (typeof name !== 'string' || !/^[A-Z][\w]*$/.test(name)) throw new AdminError(400, 'Nom de composant invalide.');
  if (!props || typeof props !== 'object' || Array.isArray(props)) throw new AdminError(400, 'Propriétés invalides.');

  const style = STYLES[name] ?? {};
  const entries = Object.entries(props).filter(([, value]) => value !== undefined && value !== null);
  for (const [key] of entries) {
    if (!/^[A-Za-z_][\w-]*$/.test(key)) throw new AdminError(400, `Nom de propriété invalide : « ${key} ».`);
  }

  let text;
  if (!entries.length) text = `<${name} />`;
  else if (entries.length === 1) text = `<${name} ${attribute(entries[0], '', style)} />`;
  else text = `<${name}\n${entries.map((entry) => `  ${attribute(entry, '  ', style)}`).join('\n')}\n/>`;

  const pad = ' '.repeat(Math.max(0, Number(indent) || 0));
  return text.replace(/\n/g, `\n${pad}`);
}

/**
 * @param {[string, unknown]} entry
 * @param {string} indent
 * @param {{ inlineObjects?: boolean }} style
 */
function attribute([key, value], indent, style) {
  if (value === true) return key;
  // Une chaîne JSX entre guillemets n'a pas d'échappement : un guillemet
  // ou un saut de ligne l'obligerait à passer en expression.
  if (typeof value === 'string' && !/["\n{}<>]/.test(value)) return `${key}="${value}"`;
  return `${key}={${print(value, indent, style)}}`;
}

/**
 * @param {unknown} value
 * @param {string} indent
 * @param {{ inlineObjects?: boolean }} style
 * @returns {string}
 */
function print(value, indent, style) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value);

  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    // Une liste de textes ou de nombres tient sur une ligne, comme les
    // options d'un quiz ; une liste d'objets prend un élément par ligne.
    if (value.every((item) => item === null || typeof item !== 'object')) {
      return `[${value.map((item) => print(item, indent, style)).join(', ')}]`;
    }
    if (!value.length) return '[]';
    return `[\n${value.map((item) => `${inner}${print(item, inner, style)},`).join('\n')}\n${indent}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (!entries.length) return '{}';
    const fields = entries.map(([k, v]) => `${key(k)}: ${print(v, inner, style)}`);
    if (style.inlineObjects) return `{ ${fields.join(', ')} }`;
    return `{\n${fields.map((field) => `${inner}${field},`).join('\n')}\n${indent}}`;
  }

  throw new AdminError(400, `Valeur impossible à écrire : ${typeof value}.`);
}

/** @param {string} name */
function key(name) {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

/**
 * @param {any} node
 * @param {(node: any) => void} callback
 */
function visit(node, callback) {
  callback(node);
  if (node.children) for (const child of node.children) visit(child, callback);
}
