# Journal des versions

Toutes les évolutions notables de **Socle**, le template. Le contenu du
cours de démonstration n'y figure que lorsqu'il illustre une nouveauté du
template.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et
la numérotation le [versionnage sémantique](https://semver.org/lang/fr/) :
une version *majeure* casse les cours déjà écrits, une *mineure* ajoute sans
rien casser, un *correctif* répare.

> Le numéro de version vit à deux endroits, et c'est voulu : `package.json`
> (celui du dépôt, qui deviendra celui de votre cours après le clone) et
> `SOCLE_VERSION` dans `scripts/config.mjs` (celui du template, affiché dans
> les mentions légales). Les deux se mettent à jour ensemble à chaque
> publication.

---

## Non publié

### Ajouté

- **L'admin** (`/admin/`, avec `npm run dev`) : écrire le cours sans éditeur
  de code. L'en-tête d'une leçon en formulaire, son texte en Markdown avec
  une barre d'outils, chaque composant (Quiz, Timeline, Flashcards,
  DragMatch, Figure, tableaux) dans un éditeur dédié, les slides avec un
  aperçu dans le thème du cours, une médiathèque où l'on glisse ses images,
  le verrou d'une leçon d'un clic, le réglage d'un module pour toutes ses
  leçons, et une page **Réglages** pour `socle.config.json` - la charte
  régénérée à l'enregistrement. L'admin écrit les fichiers du cours eux-mêmes,
  ne réécrit que ce qui change, n'écoute que la machine locale, et n'arrive
  jamais dans le site publié.
- **L'admin en ligne, sur Vercel** : le site reste statique, `/admin` passe
  par une fonction (`api/admin.mjs`). Connexion par mot de passe (empreinte
  scrypt en variable d'environnement, `npm run admin:password`), session en
  cookie signé. Les enregistrements sont des commits sur une branche de
  **brouillon**, dont Vercel construit l'aperçu ; un bandeau dit ce qui
  attend, ouvre l'aperçu, **publie** dans `main` ou **abandonne**. Mise en
  ligne pas à pas dans le guide.
- **Une slide de fin** à chaque deck : un remerciement, le logo, le nom et les
  liens de l'auteur (`author.name`, `author.links`).

### Modifié

- Le serveur de dev **relit `socle.config.json` à chaque changement** : une
  leçon verrouillée passe aussitôt en 404, sans redémarrage.
- L'assemblage des decks est partagé entre `build-slides` et l'aperçu de
  l'admin (`scripts/slides-deck.mjs`) : l'aperçu montre exactement ce que
  produira `npm run slides`.

---

## [1.1.0] - 2026-11-07

Refonte de l'interface - accueil, leçon, slides - et trois nouvelles
pages : les présentations, les sources du cours et l'auteur. Rien à
réécrire dans un cours existant : les nouveaux champs sont facultatifs.

### Ajouté

- **Page « Slides »** (`/presentations/`) : les présentations réunies sur
  une page du site, accessible depuis la barre du haut et le bandeau
  d'accueil - chaque module en ligne et en PDF, chaque leçon en ligne.
- **Les slides se consultent en ligne** : `npm run slides:html` publie
  désormais les decks HTML (et leurs images) dans `public/slides/`, et
  chaque leçon gagne un bouton **« Voir en slides »**. Jusqu'ici, le HTML
  ne vivait que dans le paquet de `npm run bundle`.
- **Sources du cours** : un champ `sources` dans le frontmatter (titre,
  auteur et adresse facultatifs) liste les références d'une leçon en fin de
  page, et la page `/sources/` les réunit toutes, module par module - liée
  depuis la barre du haut et le pied de page dès qu'une source existe. Une
  leçon verrouillée n'y apparaît pas.
- La barre du haut apparaît aussi sur les **mentions légales** et la page
  **404**, qui perdent leur lien « ← Accueil » devenu redondant.
- **Page 404** : une adresse inconnue tombe désormais sur une page du cours,
  et non sur l'erreur brute de l'hébergeur. Elle explique aussi le cas d'une
  leçon verrouillée, dont l'adresse est devinable depuis le sommaire.
- **Lien d'évitement** (« Aller au contenu »), premier élément de chaque
  page : au clavier, la quinzaine de liens du sommaire se saute d'une
  tabulation. Critère 12.7 du RGAA.
- **Plan du site** (`sitemap.xml`) et **`robots.txt`**, tous deux générés à
  partir de l'adresse publique renseignée dans `socle.config.json`. Sans
  elle, ni l'un ni l'autre n'est produit - même parti pris que pour les
  liens canoniques.
- **La langue du cours se règle** : `site.lang` dans `socle.config.json`
  (« fr-FR » par défaut) alimente l'attribut `lang` de chaque page et la
  balise `og:locale`.
- **Intégration continue** (GitHub Actions) : à chaque poussée, les types
  sont vérifiés et le site construit.
- **Ce journal**.
- **`Timeline` peut désormais se titrer** : une prop `title` nomme la frise,
  et un champ `heading` sur une étape ouvre un intertitre pour regrouper les
  étapes qui couvrent plusieurs périodes.
- **Page « À propos de l'auteur »** (`/a-propos/`), liée depuis le pied de
  page : une présentation facultative (paragraphe, photo carrée et liens -
  site personnel, réseaux sociaux…) renseignée dans la nouvelle section
  `author` de `socle.config.json`. Rien n'est requis, contrairement aux
  mentions légales. La photo est un chemin dans `public/`, servi tel quel
  et non optimisé par Astro. La page suit la nouvelle interface : barre du
  haut, et une carte qui réunit photo, présentation et liens.

### Modifié

- **Accueil redessiné** : une barre du haut commune à toutes les pages, un
  hero qui annonce le cours en chiffres et propose de **reprendre** là où
  l'on s'était arrêté, une **carte de progression** (part du cours terminée,
  leçon à suivre) et le programme en **cartes de module** - jauge, état de
  chaque leçon, PDF du module. Tout reste calculé dans le navigateur, sans
  compte.
- **Slides redessinées** : un surtitre de module et une bande de pied qui
  porte le cours, la leçon et la pagination « 2 / 12 », écrits par
  `build-slides` ; une slide de titre avec la couverture en panneau à droite,
  un surtitre et le chapô de la leçon ; des puces en losange et des listes
  numérotées en pastilles ; des colonnes numérotées, aux images recadrées
  pleine largeur plutôt qu'en tuiles carrées.
- **Leçon redessinée** : fil d'Ariane et **jauge de lecture** dans la barre
  du haut, progression du cours et sommaire **replié par module** dans la
  barre latérale, un en-tête qui situe la leçon (« Module 2 · Leçon 1 sur
  3 »), son chapô et sa **durée de lecture**, puis un bloc **« En bref »**
  tiré des `slidePoints`. Le PDF du module se télécharge désormais depuis
  l'en-tête de chaque leçon, et non plus depuis la seule dernière.
- **`Timeline` perd le chevron de dépliage**, qui ne rendait pas bien, et
  gagne un peu d'air entre son titre et la frise.

- `npm run check` **fonctionne sans installation supplémentaire** :
  `@astrojs/check` et `typescript` font désormais partie des dépendances de
  développement. La vérification passe sans erreur ni avertissement.
- Le sommaire des présentations (`npm run bundle`) porte le **nom du cours**
  et sa langue, au lieu de « Socle » en dur.
- `src/content.config.ts` importe `z` depuis `astro/zod` : l'export
  d'`astro:content` est déprécié depuis Astro 7.
- `.gitignore` : la ligne `!.env.example` désignait un fichier qui n'existe
  pas, et n'a jamais existé - le projet n'utilise aucune variable
  d'environnement.

---

## [1.0.0] - 2026-09-05

Première version publique du template.

### Ajouté

- **Le site du cours** : leçons en `.mdx` rangées par dossier de module,
  navigation, sommaire et classement déduits de l'arborescence.
- **Les présentations** : un deck Marp par leçon et un par module, en PDF,
  HTML autonome ou PPTX, depuis le même contenu.
- **Les composants pédagogiques** : quiz, flashcards, frise, glisser-déposer,
  figure, vidéo YouTube, podcast et CodePen.
- **Suivi de progression** dans le navigateur (`localStorage`), sans compte
  ni serveur.
- **La charte en un fichier** : trois couleurs et deux polices Google Fonts
  dans `socle.config.json`, appliquées au site *et* aux slides par
  `npm run brand`, polices auto-hébergées comprises.
- **Leçons verrouillées** : annoncées au sommaire, mais ni page ni slides
  générées.
- **Architecture des styles** en ITCSS + BEMIT.
- **Mentions légales** alimentées par la configuration, et **manifeste
  d'application** généré.
- **Sommaire repliable** sur mobile, et tableaux larges qui défilent dans
  leur propre conteneur.
- **PDF résumé de module**, proposé à la fin de chaque module.
- **`npm run bundle`** : le paquet livrable, site et présentations réunis.
- **`npm run reset`** : efface le cours de démonstration, après confirmation.
- **La documentation** : un README d'accueil, le détail dans
  `docs/GUIDE.md`.
