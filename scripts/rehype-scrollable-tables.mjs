// =============================================================
// rehype-scrollable-tables.mjs - enveloppe les tableaux du markdown
//
// Un tableau markdown se rend en `<table>` nu. Trop large pour l'écran,
// il n'est pas rétréci : il élargit le document, et c'est la page ENTIÈRE
// qui se met à défiler de côté - titres et paragraphes compris, pour un
// seul élément. Sur un téléphone, cinq colonnes suffisent.
//
// On l'entoure donc d'un `.o-scroller`, qui garde le défilement pour lui.
// Fait à la compilation plutôt qu'en CSS : `display: block` sur un
// `<table>` ferait bien défiler, mais en cassant la mise en page interne
// (les colonnes cessent de s'aligner sur toute la hauteur). Un conteneur
// laisse le tableau être un tableau.
//
// Branché dans astro.config.mjs, pour tous les .md et .mdx.
// =============================================================

/**
 * Pas de dépendance à `unist-util-visit` pour ça : on remplace des enfants
 * dans leur parent, ce que `visit` ne fait pas plus simplement qu'une
 * récursion de dix lignes.
 */
export default function rehypeScrollableTables() {
  return (tree) => {
    walk(tree);
  };
}

function walk(node) {
  if (!Array.isArray(node.children)) return;

  node.children = node.children.map((child) => {
    walk(child);

    if (child.type !== 'element' || child.tagName !== 'table') return child;

    return {
      type: 'element',
      tagName: 'div',
      properties: {
        className: ['o-scroller'],
        // Une zone qui défile doit pouvoir recevoir le focus : sans ça,
        // elle est inatteignable au clavier. Posé sans `role="region"` -
        // une région sans nom accessible vaut moins que pas de région.
        tabIndex: 0,
      },
      children: [child],
    };
  });
}
