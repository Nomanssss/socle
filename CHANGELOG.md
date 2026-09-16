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

### Modifié

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
