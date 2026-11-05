# Feuille de route - l'admin

Une interface pour écrire un cours Socle **sans ouvrir un éditeur de
code** : on choisit une leçon, on modifie son en-tête dans un formulaire,
son texte à côté d'un aperçu fidèle, et ses quiz dans un éditeur fait
pour eux. Ce que l'admin enregistre, ce sont les fichiers `.mdx` et
`socle.config.json` eux-mêmes : pas de base de données, Git reste la
seule mémoire du cours.

Les partis pris, posés avant d'écrire la première ligne :

- **Local d'abord.** L'admin n'existe qu'avec `npm run dev`, sur
  `/admin/`. Elle n'est jamais construite : rien d'elle n'arrive dans
  `dist/`, le site livré reste 100 % statique.
- **On ne réécrit que ce qui change.** Modifier un quiz ne touche qu'au
  quiz ; un en-tête inchangé est recopié à l'octet près. Un diff Git
  après passage dans l'admin doit ressembler à celui d'un humain.
- **Pas de WYSIWYG.** Le texte reste du Markdown, lisible et diffable.
  Ce sont les composants - là où le MDX devient du JavaScript - qui ont
  droit à un éditeur visuel.
- **Zéro dépendance côté navigateur**, comme les composants du cours :
  du JavaScript natif, sans framework.

Une case cochée = fait, vérifié, commité sur `feat/admin`.

---

## Phase 0 - Fondations

- [x] Branche `feat/admin` et cette feuille de route
- [x] Une intégration Astro branchée sur le seul serveur de dev (`astro:server:setup`)
- [x] Garde-fous : requêtes locales uniquement, origine vérifiée, écriture confinée à `src/content/lecons/`

## Phase 1 - Éditer une leçon

- [x] API : lister les leçons, rangées par module, avec leur verrou
- [x] API : lire et enregistrer une leçon (en-tête + texte)
- [x] En-tête réécrit dans le style des fichiers existants, et seulement s'il a changé
- [x] Interface : le sommaire des leçons
- [x] Interface : l'en-tête en formulaire (titre, module, ordres, description, points-clés, sources, couverture)
- [x] Interface : l'éditeur de texte, `Ctrl+S`, alerte avant de quitter sans enregistrer
- [x] Interface : l'aperçu de la vraie page, rechargé à l'enregistrement
- [x] L'aperçu quitte la zone d'édition : un lien « Voir la page » suffit, l'éditeur prend toute la largeur

## Phase 2 - Les composants

- [x] Analyse du MDX : chaque composant repéré, avec sa position exacte et ses propriétés lues comme des valeurs
- [x] Réécriture ciblée : seul le texte du composant modifié est remplacé
- [x] Tests de l'aller-retour (lecture → écriture → relecture identique)
- [x] Éditeur du **Quiz** : questions, options, bonne réponse, explication, ordre
- [x] Insérer un nouveau quiz, avec son `import` ajouté s'il manque
- [ ] Éditeurs de la **Timeline**, des **Flashcards**, du **DragMatch**
- [ ] Éditeurs des embeds : **YouTubeEmbed**, **PodcastEmbed**, **CodepenEmbed**

## Phase 3 - La médiathèque

*Pour qu'une image s'ajoute sans savoir ce qu'est un `import`. Les images
vivent dans `src/assets/` : c'est là qu'Astro sait les optimiser.*

- [x] API : lister les images, avec les leçons et les slides qui les utilisent
- [x] Envoyer une image par glisser-déposer : nom de fichier nettoyé, jamais d'écrasement
- [x] Supprimer une image, seulement si rien ne l'utilise
- [x] Une page « Médiathèque » : vignettes, recherche, utilisations
- [x] Insérer une image dans une leçon : choix dans la médiathèque, texte alternatif guidé, légende - les `import` s'écrivent tout seuls
- [x] Modifier une **Figure** existante (image, texte alternatif, légende), l'`import` devenu inutile est retiré
- [x] Choisir la couverture d'une leçon dans la médiathèque, plutôt que d'écrire un chemin

## Phase 4 - Les slides

*Écrire le deck d'une leçon en voyant les slides se dessiner, avec le vrai
thème, sans attendre `npm run slides`.*

- [x] L'assemblage du deck d'une leçon sort de `build-slides.mjs`, pour être partagé avec l'admin (sortie identique vérifiée)
- [ ] Un onglet « Slides » par leçon : son deck écrit à la main, ou à défaut ses points-clés
- [ ] Aperçu des slides en direct, rendu par Marp avec le thème du cours
- [ ] Le curseur dans le texte désigne sa slide dans l'aperçu
- [ ] Ajouter une slide depuis un modèle : standard, intercalaire, phrase forte, colonnes, image…
- [ ] Créer le deck d'une leçon qui n'en a pas, à partir de ses points-clés
- [ ] Les images des slides choisies dans la médiathèque
- [ ] Exporter le PDF de la leçon depuis l'admin

## Phase 5 - Organiser le cours

- [ ] Créer une leçon (dossier de module, nom de fichier, en-tête minimal)
  - ⚠ Constaté : une leçon créée pendant `npm run dev` n'a pas de page tant que le serveur n'a pas redémarré (`getStaticPaths` n'est pas relu). L'admin devra le redémarrer, ou le dire.
- [ ] Renommer, déplacer, supprimer une leçon
- [ ] Réordonner leçons et modules par glisser-déposer (réécrit `order` et `moduleOrder`)
- [ ] Verrouiller / déverrouiller une leçon depuis le sommaire

## Phase 6 - Régler le site

- [ ] Éditer `socle.config.json` en **conservant** les clés `_…`, affichées comme aide sous chaque champ
- [ ] Couleurs et polices, avec `npm run brand` relancé à l'enregistrement
- [ ] La photo de l'auteur choisie dans la médiathèque

## Phase 7 - En ligne (plus tard, si le besoin se confirme)

- [ ] Connexion sans base : empreinte du mot de passe en variable d'environnement, session en cookie signé
- [ ] Enregistrement par commit via l'API GitHub, la CI reconstruit le site
- [ ] `/admin/` rendu côté serveur (adaptateur), le reste du site toujours statique
- [ ] Deux éditions simultanées : détecter le conflit plutôt qu'écraser

## Phase 8 - Documenter

- [ ] Une leçon du cours de démonstration consacrée à l'admin
- [ ] README, `docs/GUIDE.md` et journal des versions
