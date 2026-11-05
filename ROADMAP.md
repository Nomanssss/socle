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
- [ ] Interface : le sommaire des leçons
- [ ] Interface : l'en-tête en formulaire (titre, module, ordres, description, points-clés, sources, couverture)
- [ ] Interface : l'éditeur de texte, `Ctrl+S`, alerte avant de quitter sans enregistrer
- [ ] Interface : l'aperçu de la vraie page, rechargé à l'enregistrement

## Phase 2 - Les composants

- [x] Analyse du MDX : chaque composant repéré, avec sa position exacte et ses propriétés lues comme des valeurs
- [ ] Réécriture ciblée : seul le texte du composant modifié est remplacé
- [x] Tests de l'aller-retour (lecture → écriture → relecture identique)
- [ ] Éditeur du **Quiz** : questions, options, bonne réponse, explication, ordre
- [ ] Insérer un nouveau quiz, avec son `import` ajouté s'il manque
- [ ] Éditeurs de la **Timeline**, des **Flashcards**, du **DragMatch**
- [ ] Éditeurs des médias : **Figure**, **YouTubeEmbed**, **PodcastEmbed**, **CodepenEmbed**

## Phase 3 - Organiser le cours

- [ ] Créer une leçon (dossier de module, nom de fichier, en-tête minimal)
- [ ] Renommer, déplacer, supprimer une leçon
- [ ] Réordonner leçons et modules par glisser-déposer (réécrit `order` et `moduleOrder`)
- [ ] Verrouiller / déverrouiller une leçon depuis le sommaire

## Phase 4 - Régler le site

- [ ] Éditer `socle.config.json` en **conservant** les clés `_…`, affichées comme aide sous chaque champ
- [ ] Couleurs et polices, avec `npm run brand` relancé à l'enregistrement
- [ ] Envoyer une image (couverture, photo de l'auteur, figure)

## Phase 5 - En ligne (plus tard, si le besoin se confirme)

- [ ] Connexion sans base : empreinte du mot de passe en variable d'environnement, session en cookie signé
- [ ] Enregistrement par commit via l'API GitHub, la CI reconstruit le site
- [ ] `/admin/` rendu côté serveur (adaptateur), le reste du site toujours statique
- [ ] Deux éditions simultanées : détecter le conflit plutôt qu'écraser

## Phase 6 - Documenter

- [ ] Une leçon du cours de démonstration consacrée à l'admin
- [ ] README, `docs/GUIDE.md` et journal des versions
