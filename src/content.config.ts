import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
// Astro 7 : `z` ne s'importe plus depuis « astro:content », qui le
// signale comme déprécié. C'est le même Zod, au même endroit.
import { z } from 'astro/zod';

// =============================================================
// COLLECTION DE CONTENU - LEÇONS
//
// Chaque leçon est un fichier .mdx dans src/content/lecons/,
// rangé par sous-dossier de module (ex : module-1/lecon-1.mdx).
// L'`id` d'une leçon correspond à son chemin (ex : "module-1/lecon-1").
//
// ⚠️ Astro 5+/7 : le fichier de config des collections se trouve à
//    src/content.config.ts (et non plus src/content/config.ts) et
//    utilise un "loader" (ici glob) pour charger les fichiers.
// =============================================================

const lecons = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/lecons' }),
  // `image()` permet de référencer une image (chemin relatif au fichier .mdx)
  // qu'Astro optimisera automatiquement.
  schema: ({ image }) =>
    z.object({
      // Titre affiché de la leçon.
      title: z.string(),
      // Nom lisible du module auquel la leçon appartient (ex : "Module 1 - Les bases").
      module: z.string(),
      // Ordre de la leçon À L'INTÉRIEUR de son module (1, 2, 3…).
      order: z.number(),
      // Résumé court, optionnel (affiché sur la page d'accueil).
      description: z.string().optional(),
      // Image de couverture, optionnelle : chemin RELATIF au fichier .mdx
      // (ex : cover: ../../../assets/ma-cover.png). Affichée en bandeau.
      cover: image().optional(),
      // Texte alternatif de la cover (laisser vide si purement décorative).
      coverAlt: z.string().optional(),
      // Points-clés, optionnels : réutilisés plus tard pour un export Marp (slides).
      slidePoints: z.array(z.string()).optional(),
      // Ordre du module lui-même sur la page d'accueil, optionnel (1, 2, 3…).
      // Si absent, les modules sont classés par ordre alphabétique de leur nom.
      moduleOrder: z.number().optional(),
    }),
});

export const collections = { lecons };
