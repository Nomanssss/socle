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
- **Le moins de dépendances possible côté navigateur.** Du JavaScript
  natif, sans framework. Seule exception, l'éditeur de texte
  (CodeMirror) : il ne sert qu'à l'admin, en local, et n'arrive jamais
  dans le site livré.

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
- [x] Éditeurs de la **Timeline**, des **Flashcards**, du **DragMatch**
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
- [x] Un onglet « Slides » par leçon : son deck écrit à la main, ou à défaut ses points-clés
- [x] Aperçu des slides en direct, rendu par Marp avec le thème du cours
- [x] Le curseur dans le texte désigne sa slide dans l'aperçu
- [x] Ajouter une slide depuis un modèle : standard, intercalaire, phrase forte, colonnes, image…
- [x] Créer le deck d'une leçon qui n'en a pas, à partir de ses points-clés
- [x] Les images des slides choisies dans la médiathèque (via les modèles à image)
  - [x] Changer l'image d'une slide existante sans retoucher le chemin à la main (vignette « Changer » de l'éditeur riche)
- [ ] Exporter le PDF de la leçon depuis l'admin

## Phase 5 - Un éditeur de texte pour tout le monde

*Le texte reste le fichier, au caractère près - pas de WYSIWYG qui
réécrirait tout à l'enregistrement. Mais il s'habille : on n'y voit plus
de code, et l'on n'a plus à connaître la syntaxe Markdown.*

- [x] CodeMirror 6 servi à l'admin (empaqueté à la volée, jamais dans `dist/`)
- [x] Le texte d'une leçon dans CodeMirror : titres en grand, gras en gras, syntaxe estompée, retour à la ligne
- [x] Une barre d'outils et ses raccourcis : gras, italique, titres, listes, citation, lien
- [x] Les composants affichés en cartes cliquables, qui ouvrent leur éditeur
- [x] Un interrupteur « texte brut », pour qui préfère voir le fichier tel quel
- [x] Les blocs de code se lisent comme du code : police fixe, fond, coloration (JS, HTML, CSS, YAML, Markdown), Tab qui indente
- [x] Les tableaux en cartes, édités dans une grille : lignes, colonnes, alignement, sans aligner un « | » à la main
- [x] Thème clair seulement : pas de mode sombre
- [ ] Une image collée ou glissée dans le texte part dans la médiathèque et devient une Figure
- [x] Un éditeur riche pour les slides : chaque `---` devient un bandeau « Slide N » avec son menu de mise en page, la directive `_class` disparaît, les images de fond deviennent des vignettes à changer en un clic
- [x] Une barre d'outils adaptée aux slides : titre, colonne, listes, lien, image, tableau, code
- [ ] (Facultatif) La syntaxe n'apparaît que sur la ligne du curseur, comme dans Obsidian

## Phase 6 - Organiser le cours

- [x] Régler un module (nom, place dans le cours) depuis le sommaire ou la leçon : réécrit `module` et `moduleOrder` dans toutes ses leçons, les noms « Module N - … » suivent leur rang ; la leçon ne porte plus ces champs
- [ ] Créer une leçon (dossier de module, nom de fichier, en-tête minimal)
  - ⚠ Constaté : une leçon créée pendant `npm run dev` n'a pas de page tant que le serveur n'a pas redémarré (`getStaticPaths` n'est pas relu). L'admin devra le redémarrer, ou le dire.
- [ ] Renommer, déplacer, supprimer une leçon
- [ ] Réordonner leçons et modules par glisser-déposer (réécrit `order` et `moduleOrder`)
- [x] Verrouiller / déverrouiller une leçon depuis le sommaire (réécrit la seule clé `locked` de `socle.config.json`, effet immédiat sur le serveur de dev)

## Phase 7 - Régler le site

- [x] Éditer `socle.config.json` en **conservant** les clés `_…`, affichées comme aide sous chaque champ (fichier réécrit dans son propre style : relu et réécrit sans changement, il ressort identique)
- [x] Couleurs et polices, avec `npm run brand` relancé à l'enregistrement (refusée par lui, la configuration est remise en l'état)
- [x] La photo de l'auteur choisie dans la médiathèque (copiée dans `public/photos/`)

## Phase 8 - En ligne, sur Vercel

*Un mot de passe par cours ; les enregistrements partent sur une branche
de brouillon, que Vercel construit en aperçu ; « Publier » la verse dans
`main`. Branche `feat/admin-en-ligne`.*

- [x] L'admin ne touche plus le disque : un « stockage » (`admin/server/store.mjs`), le disque en local, une branche GitHub en ligne - commits tout-ou-rien dans les deux cas
- [x] Le stockage GitHub (`admin/server/github-store.mjs`) : le brouillon créé depuis `main`, un commit par opération posé sans forcer, synchroniser / publier / abandonner - testé contre une fausse API (`admin/test/fake-github.mjs`)

- [x] Connexion sans base : empreinte du mot de passe en variable d'environnement (`npm run admin:password`), session en cookie signé, 5 essais puis 15 minutes d'attente
- [x] Enregistrement par commit via l'API GitHub, sur le brouillon ; Vercel en construit l'aperçu
- [x] `/admin/` dans une fonction Vercel (`api/admin.mjs`, réécritures de `vercel.json`), le reste du site toujours statique ; CodeMirror empaqueté à la construction (`npm run vercel-build`), images limitées à 4 Mo, polices vérifiées auprès de Google Fonts avant d'enregistrer
- [ ] Deux éditions simultanées : détecter le conflit plutôt qu'écraser

## Phase 9 - Documenter

- [x] Une leçon du cours de démonstration consacrée à l'admin (module 2, leçon 4)
- [x] README, `docs/GUIDE.md` et journal des versions
