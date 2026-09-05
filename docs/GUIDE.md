# Guide de Socle

Le détail de chaque brique du template : écrire une leçon, produire les slides,
régler la charte, comprendre les styles. Pour démarrer, voir le [README](../README.md).

## Sommaire

1. [Ajouter une leçon](#ajouter-une-leçon)
2. [Composants disponibles](#composants-disponibles)
3. [Générer les slides](#générer-les-slides)
4. [Livrer le cours : `npm run bundle`](#livrer-le-cours--npm-run-bundle)
5. [Verrouiller une leçon](#verrouiller-une-leçon)
6. [Identité du site et mentions légales](#identité-du-site-et-mentions-légales)
7. [Personnaliser l'apparence (rebranding)](#personnaliser-lapparence-rebranding)
8. [Architecture des styles (ITCSS + BEMIT)](#architecture-des-styles-itcss--bemit)
9. [Progression de l'apprenant](#progression-de-lapprenant)
10. [Faire place nette avec `npm run reset`](#faire-place-nette-avec-npm-run-reset)
11. [Ce qui est versionné, et ce qui ne l'est pas](#ce-qui-est-versionné-et-ce-qui-ne-lest-pas)

---

## Ajouter une leçon

Créez un `.mdx` dans `src/content/lecons/<module>/`. L'URL est déduite du chemin : `src/content/lecons/module-1/lecon-1.mdx` → `/lecons/module-1/lecon-1/`.

```mdx
---
title: "Titre de la leçon"
module: "Module 1 - Prendre le template en main"
moduleOrder: 1
order: 1
description: "Résumé court affiché sur l'accueil."
cover: ../../../assets/ma-cover.png
coverAlt: "Description de l'image"
---

import Quiz from '@components/Quiz.astro';

Votre contenu en Markdown, puis vos composants.

<Quiz questions={[
  { question: "…", options: ["A", "B"], answer: 1, explanation: "…" },
]} />
```

### Champs du frontmatter

Validés par Zod (`src/content.config.ts`). Un champ inconnu est **silencieusement ignoré**, sans erreur de build - vérifiez l'orthographe.

| Champ | Requis | Rôle |
| --- | --- | --- |
| `title` | ✅ | Titre de la leçon (page, sidebar, accueil, slide de titre) |
| `module` | ✅ | Nom lisible du module. **C'est lui qui regroupe les leçons**, pas le nom du dossier |
| `order` | ✅ | Ordre de la leçon *à l'intérieur* de son module (1, 2, 3…) |
| `moduleOrder` | - | Ordre du module sur l'accueil. Absent → modules classés alphabétiquement |
| `description` | - | Résumé affiché sous le titre sur l'accueil |
| `cover` | - | Bandeau en tête de leçon. Chemin **relatif au `.mdx`**, optimisé par Astro |
| `coverAlt` | - | Texte alternatif de la cover (vide si purement décorative) |
| `slidePoints` | - | Deck de secours. **Ignoré si un `.slides.md` existe** - voir « Générer les slides » |

> Le nom du dossier ne sert qu'à construire l'URL et l'identifiant de la leçon. Le regroupement visible par module vient du champ `module`. Gardez les deux cohérents.

---

## Composants disponibles

Tous les composants sont des **`.astro`** : ils s'exécutent au build et ne nécessitent **aucune directive `client:*`**. Importez-les via l'alias `@components/…` en tête de votre `.mdx`.

| Composant | Rôle | Props |
| --- | --- | --- |
| `Figure.astro` | Image optimisée avec légende | `src` (import), `alt`, `caption?`, `width?`, `height?`, `layout?` |
| `YouTubeEmbed.astro` | Vidéo (youtube-nocookie, 16:9, lazy) | `id`, `title?`, `caption?` |
| `PodcastEmbed.astro` | Lecteur audio embarqué | `src`, `title?`, `height?`, `caption?` |
| `CodepenEmbed.astro` | Pen CodePen éditable | `user`, `penId`, `title?`, `defaultTab?`, `height?` |
| `Quiz.astro` | QCM auto-corrigé | `questions`, `title?` |
| `Timeline.astro` | Frise d'étapes dépliables | `steps` |
| `Flashcards.astro` | Cartes recto/verso | `cards` |
| `DragMatch.astro` | Association par glisser-déposer | `pairs` |
| `ProgressBar.astro` | Jauge segmentée d'un module, un segment par leçon (déjà dans le layout) | `lessonIds`, `label?`, `class?` |

Forme des props structurées :

```jsx
<Quiz questions={[
  { question: "…", options: ["A", "B", "C"], answer: 1, explanation: "…" },
]} />          // answer = index de la bonne réponse, à partir de 0

<Timeline steps={[{ title: "1990", description: "Naissance du Web" }]} />
<Flashcards cards={[{ front: "HTML", back: "Structure le contenu" }]} />
<DragMatch pairs={[{ left: "<h1>", right: "Titre principal" }]} />
```

### Images

Passez par `Figure.astro`, qui enveloppe `<Image />` d'`astro:assets` et ajoute la légende :

```mdx
import Figure from '@components/Figure.astro';
import schema from '@assets/mon-schema.png';

<Figure src={schema} alt="Description utile" caption="Légende." width={1000} height={600} />
```

L'image doit être **importée**, pas référencée par une chaîne : c'est ce qui permet à Astro de l'optimiser.

Alias disponibles (`tsconfig.json`) : `@components/*`, `@layouts/*`, `@styles/*`, `@assets/*`.

**Il n'y a rien à installer pour le webp.** Toute image importée depuis `src/assets/` est convertie au build, en plusieurs largeurs, avec le `srcset` et le `sizes` qui vont avec : le navigateur ne télécharge que la variante à sa taille. La couverture d'une leçon, 340 ko sur le disque, est servie en 28 ko sur un écran courant.

```
▶ /_astro/couverture.…webp (before: 340kB, after: 28kB)
```

Deux exceptions à connaître :

- **`public/`** n'est pas traité : ce qui y est posé est servi tel quel. C'est le bon dossier pour ce qui doit garder son URL (un PDF à télécharger), pas pour les illustrations ;
- **les slides Marp** embarquent le fichier source brut - `stage-images.mjs` le copie tel quel dans `slides/assets/`. Une photo de 2 Mo pèse 2 Mo dans le deck, et autant dans le PDF.

D'où une règle simple : **redimensionnez la source à 2 560 px de large au maximum** avant de la déposer dans `src/assets/`. C'est déjà la plus grande variante que le site génère - au-delà, on alourdit le dépôt, le build et les présentations sans que personne ne voie la différence.

---

## Générer les slides

```bash
npm run slides                                   # PDF (défaut)
npm run slides:html                              # HTML, aucune dépendance
node scripts/build-slides.mjs --format=pptx      # PPTX
```

`npm run slides` compile d'abord le thème Sass (`slides:theme`), puis génère **un deck par leçon** dans `slides/<module>-<lecon>.<ext>`. Toutes les leçons sont retraitées à chaque fois.

### La slide de titre est automatique

Ne l'écrivez jamais vous-même : elle est fabriquée depuis le frontmatter du `.mdx` (`title`, `module`, `cover`).

Elle porte un **bandeau sur 30 % de la hauteur**, rempli dans cet ordre :

1. l'image `cover:` de la leçon, si elle en a une ;
2. sinon l'image par défaut du projet, si vous en configurez une ;
3. sinon un aplat de la couleur principale.

L'image par défaut se règle dans `socle.config.json`, avec un chemin relatif à la racine du projet :

```json
{
  "colors": { … },
  "fonts": { … },
  "slides": { "band": "src/assets/bandeau-slides.png" }
}
```

La clé est facultative : sans elle, on retombe sur l'aplat. Si le fichier indiqué n'existe pas, `npm run slides` le signale et garde l'aplat plutôt que de produire un bandeau vide.

Dans les trois cas l'image est recadrée en `cover` : elle remplit le bandeau et déborde, elle n'est **jamais déformée**.

Le cadrage appartient à la mise en page, pas au générateur : `layouts/_lead.scss` récupère l'image dans la variable `--background-image` que Marp expose, et la peint dans un `::before`. Il le fait parce que Marp écrit l'image **en style inline** sur la slide, avec ses propres `background-size` et `background-repeat` — aucune feuille de style ne peut la recadrer, d'où le `background-image: none !important` sur la slide et la reprise dans le bandeau. C'est le seul `!important` du projet en dehors de la couche `utilities` (où il est la règle), et c'est la seule façon de battre un style inline.

Pour le même bandeau sur une slide écrite à la main, la directive suffit :

```md
<!-- _class: lead -->
<!-- _backgroundImage: url('mon-image.png') -->
```

### Trois niveaux, le premier trouvé gagne

```
<lecon>.slides.md existe ?
  ├─ OUI → son contenu devient le deck.  slidePoints est IGNORÉ.
  └─ NON → slidePoints est rempli ?
            ├─ OUI → une slide « Points clés » en liste à puces
            └─ NON → une slide « Résumé » générique
```

`slidePoints` n'est donc **pas** un complément au deck : c'est son remplaçant au rabais. Il permet d'avoir un deck correct pour *toutes* vos leçons sans effort, puis vous « promouvez » au cas par cas celles qui méritent un vrai deck en leur ajoutant un `.slides.md`.

### Écrire un `.slides.md`

Même dossier, **même nom de base** que le `.mdx` - c'est l'appariement. Aucun frontmatter, aucune slide de titre : juste du Markdown Marp, slides séparées par une ligne `---`.

```markdown
## Deux sorties pour un contenu

- **le site** - les pages du cours
- **les slides** - une présentation par leçon

---

<!-- _class: statement -->

> Une slide vaut une idée. Trois puces. Huit mots par puce.
```

Mises en page fournies par le thème (`src/styles/marp/layouts/`), à placer en tête d'une slide, seule dans son commentaire :

| Directive | Effet | À combiner avec |
| --- | --- | --- |
| *(aucune)* | Standard : titre + contenu | - |
| `_class: section` | Intercalaire de chapitre, fond accentué | - |
| `_class: columns-2` | Deux colonnes | un `###` par colonne |
| `_class: columns-3` | Trois colonnes | un `###` par colonne |
| `_class: columns-4` | Quatre colonnes, pour des blocs courts | un `###` par colonne |
| `_class: statement` | Citation / phrase forte centrée | une `> citation` |
| `_class: image-full` | Texte par-dessus une image plein cadre | `![bg brightness:0.45](img.png)` |
| `_class: image-split` | Image et texte côte à côte | `![bg left:40%](img.png)` |
| `_class: image-left` | Panneau d'image à gauche, contenu à droite | `<!-- _backgroundImage: url('img.png') -->` |
| `_class: image-right` | Panneau d'image à droite, contenu à gauche | `<!-- _backgroundImage: url('img.png') -->` |

### Panneau d'image sur un côté

```md
<!-- _class: image-left -->
<!-- _backgroundImage: url('photo.jpg') -->

## Panneau d'image à gauche

**Le texte occupe le reste de la slide**

- l'image tient toute la hauteur
- `image-right` fait basculer le panneau
```

L'image occupe une bande sur toute la hauteur, le contenu le reste. `image-right` fait basculer le panneau de l'autre côté — c'est la seule chose à changer.

Sa largeur se règle par `--media` (38 % par défaut), qui sert deux fois : au panneau et au `padding` qui dégage la place du texte. Sans image, le panneau retombe sur un aplat de la couleur d'accent.

Même mécanique que le bandeau de la slide de titre : Marp peint l'image en style inline sur la slide, donc en pleine page ; `background-image: none !important` l'en empêche, et un `::before` la reprend par la variable `--background-image` pour la cadrer en `cover` sur le panneau.

> `_class: image-split` fait une chose voisine, mais par le mécanisme de découpe de Marp (`![bg left:40%]`). Les deux coexistent ; si vous préférez n'en garder qu'un, c'est `image-split` qui part.

### Deux, trois ou quatre colonnes

Le contenu coule dans des colonnes CSS, et **chaque `###` démarre une colonne** :

```md
<!-- _class: columns-3 -->

## Les trois formats de slides

### HTML
Se projette au navigateur, sans outil.

### PDF
S'imprime et se transmet en un fichier.

### PPTX
S'ouvre dans PowerPoint pour retouche.
```

**Une image par colonne**, au-dessus du titre :

```md
![Schéma du format HTML](schema-html.png)

### HTML

Se projette au navigateur, sans outil.
```

Elle s'inscrit dans une **tuile carrée** en `object-fit: contain` : jamais déformée, jamais rognée, et les colonnes restent alignées quelles que soient les proportions des images. La tuile est centrée dans sa colonne (`margin-inline: auto`), le titre et le texte restant alignés à gauche. Le côté du carré se règle par `--tile`, une valeur par variante (260 / 200 / 170 px).

Une **tuile sur deux** porte le symbole du projet en filigrane derrière elle (`::before` sur le paragraphe qui encadre l'image).

Tous les réglages des colonnes tiennent dans un seul tableau, en tête de `marp/layouts/_columns.scss` :

```scss
$variants: (
  2: (columns: 2, font: 25px, gap: 56px, tile: 260px, mark: 150px),
  3: (columns: 3, font: 22px, gap: 56px, tile: 200px, mark: 120px),
  4: (columns: 4, font: 19px, gap: 40px, tile: 170px, mark: 100px),
);
```

`tile` est le côté du carré, `mark` la taille du filigrane. Les blocs CSS sont produits par une boucle en fin de fichier : **ajouter une variante `columns-5` ne demande qu'une ligne de plus** dans ce tableau.

Deux détails de mécanique, si vous y touchez :

- c'est le **paragraphe** qui porte le cadre et le pseudo-élément, pas l'image : un `<img>` est un élément remplacé, il ne peut pas avoir de `::before` ;
- le fond de la tuile étant opaque, seule la **partie qui déborde** du filigrane se voit. C'est le débordement qui fait l'effet — retirez le fond de la tuile si vous voulez le voir au travers.

**Les deux ordres d'écriture fonctionnent** — image puis titre, ou titre puis image. Une colonne est un *groupe* (image facultative, titre, texte), et c'est son **premier élément** qui ouvre la colonne, quel qu'il soit. Trois exemptions garantissent qu'un groupe ne se fasse jamais couper en deux : le premier groupe de la slide reste dans la première colonne, un titre qui suit son image ne s'en détache pas, et une image qui suit son titre non plus.

Écrivez autant de `###` que la variante a de colonnes : un quatrième dans une `columns-3` déborderait du cadre. Sans `###`, le texte se répartit tout seul.

Le `##` de la slide traverse toutes les colonnes (`column-span: all`). Les variantes ne diffèrent que par deux ou trois déclarations : le nombre de colonnes et la taille du corps, resserrée à mesure que les colonnes se rétrécissent.

| Variante | Largeur d'une colonne | Corps |
| --- | --- | --- |
| `columns-2` | ~530 px | 25 px |
| `columns-3` | ~340 px | 22 px |
| `columns-4` | ~250 px | 19 px (gouttière resserrée) |

Les titres de colonne, eux, sont en `em` : ils suivent le corps de leur variante sans avoir à être redéclarés.

`columns-4` est faite pour des **blocs courts** — un titre, une ligne ou deux. À 250 px de large, un paragraphe se découpe en tranches de quatre mots et devient pénible à lire de loin.

### Les slides partagent la charte du site

Le thème Marp ne redéfinit aucune couleur ni aucune police : il consomme les mêmes settings que le site.

| | Comment |
| --- | --- |
| couleurs | `marp/theme.scss` consomme `generic/_root.scss`. Marp réécrit le `:root` en `section`, donc les variables `--color-*`, `--space-*` et `--text-*` sont disponibles dans les slides. Et comme `colors.get()` produit `var(--color-x, <valeur Sass>)`, le rendu tient même si une variable venait à manquer. |
| polices | mêmes familles, **embarquées en base64** dans `marp/_fonts.scss` (généré par `npm run brand`). |

Pourquoi embarquer les polices côté slides, alors que le site les référence par URL ? Parce que le thème Marp est consommé depuis deux endroits qui ne résolvent pas les chemins de la même façon : le rendu PDF (relatif au dossier `slides/`) et le serveur d'aperçu (relatif à une URL). Une donnée embarquée n'a pas de chemin, donc rien à résoudre — elle fonctionne dans les deux cas, et un deck exporté en HTML emporte ses polices avec lui. Le site, lui, garde des URL : ses fichiers de police sont mis en cache par le navigateur, ce qu'une donnée inline empêcherait.

Conséquence pratique : **changer `socle.config.json` change aussi les slides.** Il faut seulement régénérer (`npm run slides`), là où le site se rafraîchit tout seul.

### Modifier un modèle sans travailler à l'aveugle

```bash
npm run slides:preview
```

Ouvre <http://localhost:8080> et lance deux surveillances :

- `sass --watch` recompile `slides/theme.css` à chaque enregistrement dans `src/styles/` ;
- `marp --server` sert les decks et **recharge le navigateur** à chaque changement.

Un deck de démonstration, `slides.demo.md`, est copié dans la liste sous le nom **00-modeles** : il montre toutes les mises en page à la suite. On modifie `src/styles/marp/layouts/_section.scss`, on enregistre, on voit le résultat sur la slide correspondante — sans régénérer un PDF à chaque essai.

Les vrais decks apparaissent dans la même liste (ils viennent du dernier `npm run slides`), pour vérifier sur votre contenu réel — **images comprises** : le générateur copie celles que vous référencez dans `slides/assets/` et les cite en chemin relatif. Un chemin absolu sur le disque fonctionnerait au rendu PDF mais pas ici, où Marp sert les decks par HTTP : le navigateur irait chercher « /Users/… » sur le serveur. C'est ce qui garantit que l'aperçu ne vous montre pas autre chose que le PDF.

`socle.config.json` est surveillé lui aussi : `sass --watch` ne voit que les fichiers `.scss`, or les couleurs passent d'abord par `apply-brand`. Le script relance donc cette étape tout seul quand la configuration change.

Ctrl+C arrête les deux processus. Quand le rendu convient, `npm run slides` regénère les PDF.

L'aperçu affiche les vraies polices et les vraies couleurs du projet : ce que vous voyez est ce que le PDF rendra.

Les chemins d'images sont écrits **relativement au `.mdx`** : le script les convertit en chemins absolus au build (`build-slides.mjs:55`), car le deck assemblé est écrit dans `slides/`.

> ⚠️ **Les commentaires HTML ne s'imbriquent pas.** Si vous documentez une directive à l'intérieur d'un commentaire, n'y écrivez ni `<!--` ni la séquence de fermeture : le premier `-->` rencontré fermerait le bloc et le reste du texte s'afficherait sur la slide.

---

## Livrer le cours : `npm run bundle`

```bash
npm run bundle
```

Assemble dans `dist/` **tout ce qu'il faut pour transmettre le cours** : le site, et une présentation par leçon aux deux formats.

```
dist/
  index.html, lecons/…        le site
  _astro/, fonts/             ses assets
  slides/
    index.html                sommaire des présentations
    module-1-lecon-1.html     deck projetable
    module-1-lecon-1.pdf      même deck, imprimable
    assets/                   images des decks HTML
  LISEZ-MOI.txt               comment ouvrir le paquet
```

L'ordre compte : `astro build` **vide** `dist/` à chaque passage, donc les slides y sont ajoutées après. C'est tout ce que fait `scripts/bundle-dist.mjs`, qui refuse de tourner si le site n'a pas été construit.

### Le site a besoin d'un serveur, les slides non

C'est la limite à connaître avant d'envoyer le dossier à quelqu'un.

| | Ouverture par double-clic | Servi en HTTP |
| --- | --- | --- |
| Le site | ✗ | ✓ |
| Les decks HTML | ✓ | ✓ |
| Les PDF | ✓ | ✓ |

Le site charge ses scripts en modules ES (`<script type="module" src>`), que les navigateurs refusent de charger depuis un `file://`. Ouvrir `dist/index.html` directement donnerait une page stylée mais sans progression, sans quiz et sans drag-and-drop. Il lui faut donc un hébergeur statique, ou un serveur local :

```bash
cd dist
python3 -m http.server 8000   # → http://localhost:8000
```

Les decks HTML, eux, s'ouvrent hors ligne : les polices sont embarquées en base64 dans le fichier. Seules les **images** restent en chemin relatif, dans `slides/assets/` - c'est pourquoi il faut garder le dossier `slides/` entier si on le déplace. Un PDF, lui, se transmet seul.

`LISEZ-MOI.txt` répète tout ça dans le paquet : le destinataire n'a pas ce README sous les yeux.

### Le sommaire des présentations

`dist/slides/index.html` liste les decks par module, avec un lien HTML et un lien PDF pour chacun. Il est fabriqué à partir de `slides/manifest.json` (écrit par `build-slides.mjs`), et reprend les couleurs et les polices de `socle.config.json` - il suit donc la charte sans dépendre du CSS du site, dont le nom de fichier est haché à chaque build.

**Le site ne pointe pas vers ce sommaire.** Un lien depuis le site serait mort en développement (`npm run dev`), où les slides ne sont pas générées ; c'est une décision à prendre, pas un oubli.

---

## Verrouiller une leçon

Pour mettre le cours en ligne sans donner accès à tout, listez les leçons à fermer dans `socle.config.json` :

```json
"locked": ["module-4/lecon-4"]
```

L'identifiant est le chemin de la leçon sans `.mdx`, tel qu'il apparaît dans l'URL. Les formes approximatives sont tolérées : `src/content/lecons/module-4/lecon-4.mdx`, `/module-4/lecon-4/` et les antislashs Windows donnent tous le même résultat.

Puis `npm run build` (ou `npm run bundle`). **Déverrouiller, c'est retirer la ligne et reconstruire** - rien d'autre à toucher.

> En développement (`npm run dev`), un changement de `locked` n'est pas détecté à chaud : redémarrez le serveur.

### Ce que le verrou fait exactement

| | Leçon ouverte | Leçon verrouillée |
| --- | --- | --- |
| Page générée dans `dist/` | ✓ | **✗ (404)** |
| Contenu présent dans le paquet livré | ✓ | **✗** |
| Slides (HTML + PDF) | ✓ | **✗** |
| Listée au sommaire de l'accueil | ✓ | ✓ grisée, « Bientôt disponible » |
| Listée dans la barre latérale | ✓ | ✓ grisée, avec un cadenas |
| Comptée dans la progression du module | ✓ | ✗ |
| Atteignable par « Précédent / Suivant » | ✓ | ✗ (le parcours l'enjambe) |

Deux points méritent d'être explicités.

**C'est un vrai verrou, pas un masquage.** La leçon est écartée dans `getStaticPaths`, donc aucune page n'est produite : ni URL à deviner, ni contenu dans `dist/`. Sur un site statique, c'est la seule forme de verrou qui tienne - tout contrôle côté JavaScript se contourne en lisant la source.

**La progression exclut les leçons verrouillées.** Sinon un module à quatre leçons dont une est fermée resterait bloqué à 75 %, sans que l'apprenant puisse rien y faire.

### Les garde-fous

```
socle.config.json → « locked » : aucune leçon ne correspond à « module-9/lecon-42 ».
Ces entrées ne verrouillent rien.
```

Une faute de frappe dans un identifiant ne verrouille rien - et sans avertissement, on croirait une leçon protégée alors qu'elle est en ligne. Le build le signale donc (`scripts/config.mjs`, fonction `unknownLocked`). Une erreur de **forme** (`"locked"` qui n'est pas un tableau) fait échouer `npm run brand` tout de suite.

### Où ça vit dans le code

`scripts/config.mjs` est le point d'accès unique au fichier de config, importé à la fois par les scripts Node et par les pages Astro : une leçon verrouillée disparaît du site, de la navigation et des slides sans que trois fichiers en décident séparément.

> ⚠️ Ce module ne déduit pas la racine du projet de `import.meta.url` seul. Vite regroupe le fichier dans `dist/.prerender/` quand Astro l'importe : la racine ainsi calculée désigne le dossier de build, `socle.config.json` devient introuvable et **toutes les leçons se retrouvent déverrouillées en silence**. Il essaie donc les deux racines plausibles et lève une erreur s'il ne trouve rien - un verrou ne doit jamais échouer discrètement.

---

## Identité du site et mentions légales

Le nom du cours, son accroche et les mentions légales se règlent eux aussi dans `socle.config.json`, section `site` :

```json
"site": {
  "title": "Socle",
  "tagline": "Un template de cours en ligne en markdown, statique et personnalisable.",
  "legal": {
    "editor": "",
    "address": "",
    "email": "",
    "publisher": "",
    "host": ""
  }
}
```

| Clé | Où ça s'affiche |
| --- | --- |
| `title` | le titre du bandeau d'accueil, l'onglet du navigateur, le pied de page |
| `tagline` | l'accroche sous le titre, et la `<meta name="description">` de l'accueil |
| `legal.*` | la page `/mentions-legales/`, en deux rubriques : l'éditeur (`editor`, `address`, `email`, `publisher`) et l'hébergement (`host`) |

Un champ `legal` **vide n'affiche pas de ligne à moitié remplie** : il disparaît de la page, et le build le signale — même parti pris que pour `locked`, une omission silencieuse vaut moins qu'un avertissement.

```
⚠ socle.config.json → « site.legal » : « Éditeur du site », « Hébergeur » sont vides.
  Ces lignes n'apparaîtront pas dans les mentions légales.
```

Tant qu'une rubrique est entièrement vide, la page le dit à sa place, dans un encadré en pointillés. Une adresse peut être écrite sur plusieurs lignes (`\n` dans le JSON) : les retours sont respectés à l'affichage.

Les champs sont lus par `scripts/config.mjs` (`site()`, `legalEntries()`, `missingLegal()`), qui reste le point d'accès unique au fichier de configuration. Le texte de cadre — propriété intellectuelle, données personnelles — est écrit en clair dans `src/pages/mentions-legales.astro` : c'est de la prose, elle n'a rien à faire dans un JSON. Relisez-la, elle décrit un site strictement statique, sans compte ni mesure d'audience.

La rubrique **« Conception et réalisation »** crédite le template lui-même et son auteur, [Alexandre Allain](https://www.linkedin.com/in/alexandre-allain-4a2592151). C'est la seule mention de la page qui ne dépend pas de `socle.config.json` : elle parle de Socle, pas du cours qu'il héberge.

### La version de Socle

Cette même rubrique affiche « propulsé par **Socle 1.0.0** », et chaque page du site porte l'information en en-tête :

```html
<meta name="generator" content="Socle 1.0.0">
```

C'est la convention qu'emploient Astro ou WordPress. Un cours en ligne dit ainsi de quelle version du template il est issu - la première question qu'on se pose devant un site livré il y a un an qui se comporte bizarrement.

Le numéro vit dans `scripts/config.mjs` (`SOCLE_VERSION`), et **pas** dans `package.json`. La raison tient à ce qu'est ce dépôt : une fois le template dupliqué, `package.json` appartient à l'auteur du cours, qui y met le nom et le numéro de *son* projet. La mention afficherait alors la version du cours en croyant donner celle du template. Les deux numéros disent la même chose au moment du clone, puis suivent chacun leur vie.

Le pied de page, lui, n'en parle pas : « Socle 1.0.0 » sous le pied de page d'un cours ne dit rien à l'apprenant qui le lit. L'information s'adresse à qui reprend le projet ou inspecte la page, pas au lecteur.

> Pour publier une version de Socle : `SOCLE_VERSION` dans `scripts/config.mjs` **et** `version` dans `package.json`, dans le même commit.

### Le pied de page

`src/components/Footer.astro` est posé sur l'accueil, sur chaque leçon et sur les pages annexes. Il porte trois choses :

- **la marque**, qui ramène à l'accueil. Ce n'est pas une balise `<img>` mais un fond dessiné par `logo.logotype()` — donc toujours dans la couleur de la charte du moment, et assombrie au survol (voir « Les marques du projet ») ;
- **le lien vers les mentions légales** ;
- **la note sur la progression** stockée dans le navigateur : une information de confidentialité, qui a sa place partout et non sur la seule page d'accueil.

Pour ajouter une page annexe (conditions d'utilisation, accessibilité…), dupliquez `mentions-legales.astro` : le gabarit `.c-page` (lien de retour, titre, `.s-richtext`) est fait pour ça, et le lien s'ajoute dans le `<nav>` de `Footer.astro`.

---

## Personnaliser l'apparence (rebranding)

👉 **Un seul fichier à ouvrir : `socle.config.json`, à la racine.** Trois couleurs, deux polices Google Fonts.

```json
{
  "colors": {
    "primary": "#4b5694",
    "text":    "#111844",
    "page":    "#ffffff"
  },
  "fonts": {
    "heading": "Stack Sans Headline",
    "body":    "Google Sans"
  }
}
```

Une troisième clé, facultative, sert aux présentations :

```json
"slides": { "band": "src/assets/bandeau-slides.png" }
```

C'est l'image du bandeau des slides de titre, pour les leçons qui n'ont pas de `cover:` (voir « Générer les slides »).

Puis :

```bash
npm run brand
```

Et c'est tout : le site **et** les slides changent d'apparence. La commande est branchée sur `predev`, `prebuild` et `npm run slides`, donc un simple `npm run dev` suffit en pratique.

### Les trois couleurs

Elles portent le nom de leur **rôle**, jamais celui de leur teinte - on ne veut pas d'une variable `$navy` qui contiendrait du vert après un changement de charte :

| | Rôle | Ce qu'elle habille |
| --- | --- | --- |
| `primary` | la couleur principale | liens, boutons, titres de slides |
| `text` | le foncé | le texte, et le survol des boutons |
| `page` | le fond | le fond de page, dont les surfaces sont éclaircies |

Si vous collez une palette (Coolors, Adobe Color…), l'ordre naturel est : la plus foncée en `text`, la plus claire en `page`, la plus saturée en `primary`.

La palette est **monochrome par construction** : les traits, les filets et les fonds teintés sont tous des dilutions de `primary` vers `page`. C'est un choix, pas une limite du template - le rôle `accent` existe justement pour accueillir une seconde teinte de marque le jour où il en faudra une, et ne pointe aujourd'hui que sur `primary`.

**Tout le reste est calculé** par `settings/_colors.scss`, en mélangeant ces trois couleurs vers le fond de page - vous n'avez aucun ton intermédiaire à choisir :

| Rôle dérivé | Calcul | Sert à |
| --- | --- | --- |
| `primary-soft` | `primary` à 12 % | bandeau d'accueil, leçon courante |
| `surface` | `page` éclairci | cartes, encarts, barre latérale |
| `surface-muted` | `primary` à 8 % | survols, fonds en creux, code en ligne |
| `border` | `primary` à 30 % | filets |
| `accent` | `primary` | rail de la timeline, pointillés, piste de progression |
| `text-muted` | `text` à 72 % | légendes, métadonnées |
| `on-primary` | blanc | texte des boutons |

Les rôles dérivés sont calibrés pour la lisibilité. Avec la palette livrée, le texte atténué est à 5,3:1 sur le blanc et la couleur principale à 7,6:1, au-dessus du seuil AA (4,5:1). `border` tombe à 1,6:1 : c'est un filet décoratif, jamais une couleur de texte ni un porteur d'information.

`success` et `error` restent en dehors de la marque : le vert de la réussite et le rouge de l'erreur ne changent pas d'un projet à l'autre (`settings/_colors.scss`).

### Les deux polices

Donnez le **nom exact** d'une famille Google Fonts. `npm run brand` s'occupe du reste :

- il vérifie que la famille existe - et propose les noms proches en cas de faute de frappe ;
- il choisit les graisses utiles (normale, forte, gras) parmi celles que la famille propose réellement, plus les italiques ;
- il télécharge les `.woff2` dans `public/fonts/` et écrit les `@font-face`.

Les polices sont donc **auto-hébergées** : aucune requête vers Google au chargement d'une page, rien à déclarer côté RGPD, et le build des slides fonctionne hors ligne. Quand une famille est *variable*, un seul fichier couvre toutes les graisses (36 Ko pour Google Sans) - le script le détecte et n'en télécharge qu'un. Les `unicode-range` font qu'une page en français ne charge que le sous-ensemble `latin`.

La police de code n'est pas paramétrable : c'est la pile monospace du système, la plus lisible pour du code et la seule qui ne coûte aucun téléchargement.

### Les garde-fous

`npm run brand` refuse une configuration cassée et **mesure les contrastes** avant de générer quoi que ce soit :

```
Couleurs
  ✓ le texte sur le fond de page : 16.96:1
  ✓ la couleur principale sur le fond de page : 6.87:1
  ✓ le blanc sur la couleur principale (texte des boutons) : 6.87:1
  ✓ les traits sur le fond de page : 3.59:1
```

En dessous du seuil AA (4,5:1 pour du texte), il prévient sans bloquer. Il prévient aussi si `page` est plus sombre que `text` : le thème est conçu pour un fond clair.

### Ce qui est généré

Deux fichiers, à ne **pas** éditer à la main - ils portent un avertissement en tête et sont réécrits à chaque `npm run brand` :

| Fichier | Contenu |
| --- | --- |
| `src/styles/settings/_brand.scss` | les 4 couleurs et les 2 familles, en variables Sass |
| `src/styles/generic/_fonts.scss` | les `@font-face` du site, par URL |
| `src/styles/marp/_fonts.scss` | les mêmes, embarquées en base64 pour les slides (hors dépôt) |

Ils sont malgré tout versionnés, avec `public/fonts/` et `fonts.lock.json` : un clone du dépôt compile sans accès réseau. Le fichier de lock mémorise ce qui a été téléchargé, ce qui permet à `npm run brand` de ne rien refaire quand la configuration n'a pas bougé (`npm run brand -- --force` pour forcer).

### Le reste des réglages

Pour ce que `socle.config.json` ne couvre pas - échelle de tailles de texte, espacements, arrondis, ombres, points de rupture - les fichiers de `settings/` restent la référence :

| Fichier | Contenu |
| --- | --- |
| `src/styles/settings/_typography.scss` | échelle de tailles, graisses, interlignes |
| `src/styles/settings/_spacing.scss` | espacements + rayons d'arrondi |
| `src/styles/settings/_effects.scss` | ombres |
| `src/styles/settings/_global.scss` | base typographique + points de rupture |

**Comment ça circule.** Les settings sont des maps Sass. `generic/_root.scss` les émet en variables CSS sur `:root` (`--color-primary`, `--space-md`, `--text-lg`…), et tout le reste du projet ne consomme que ces variables - jamais une valeur en dur. En Sass, on passe par les fonctions d'accès :

```scss
@use "../settings/colors";
@use "../settings/spacing";

.c-truc {
  padding: spacing.get("md");        // var(--space-md, 1.25rem)
  color: colors.get("primary");      // var(--color-primary, #4b5694)
  border-radius: spacing.radius();   // var(--radius, 0.75rem)
}
```

Elles renvoient la variable CSS avec sa valeur Sass en repli, et **échouent au build** si le nom n'existe pas - une faute de frappe ne passe pas inaperçue.

Deux points d'entrée assemblent tout, et **partagent les mêmes settings** :

| Point d'entrée | Consommé par | Rôle |
| --- | --- | --- |
| `src/styles/theme.scss` | `index.astro`, `LessonLayout.astro` | Le site |
| `src/styles/marp/theme.scss` | `npm run slides:theme` → `slides/theme.css` | Les présentations |

---

## Architecture des styles (ITCSS + BEMIT)

Les feuilles de style sont rangées par **spécificité croissante** : chaque couche est plus spécifique que la précédente, ce qui évite d'avoir à lutter avec la cascade. `theme.scss` les assemble dans cet ordre.

| Couche | Rôle | Préfixe |
| --- | --- | --- |
| `settings/` | Variables Sass. N'émet aucun CSS. | - |
| `tools/` | Mixins et fonctions (`mq`, `fluid-size`, échelle typo). N'émet aucun CSS. | - |
| `generic/` | Reset, `box-sizing`, variables CSS `:root`, focus visible. | - |
| `elements/` | Balises nues : `html`, `h1`…`h6`, `a`, `hr`. | - |
| `objects/` | **Mise en page réutilisable, sans habillage.** | `.o-` |
| `components/` | Morceaux d'interface identifiables. | `.c-` |
| `scopes/` | Zone de contenu rédigé non maîtrisé (le markdown des leçons). | `.s-` |
| `utilities/` | Classes atomiques `!important`, en dernier recours. | `.u-` |

S'y ajoutent les états posés par JavaScript : `.is-completed`, `.is-flipped`, `.is-selected`.

### Les objets : là où vit la mise en page

C'est le point clé : **un composant ne définit ni largeur de page, ni rythme vertical, ni alignement horizontal.** Ces trois choses sont des objets, posés directement dans le HTML, et réglés par des variables CSS locales.

| Objet | Ce qu'il fait | Modificateurs |
| --- | --- | --- |
| `.o-wrapper` | Centre et contraint la largeur du contenu, avec gouttière. | `--small` (620) `--medium` (768) `--large` (896) `--flush` |
| `.o-stack` | Empile verticalement, en n'espaçant **qu'entre** les enfants. Réinitialise les listes. | `--2xs` → `--2xl` |
| `.o-cluster` | Aligne horizontalement avec passage à la ligne. | `--between` `--center` `--end` `--middle` `--baseline` `--nowrap`, `--2xs` → `--2xl` |
| `.o-grid` | Grille fluide `auto-fit`, sans point de rupture à écrire. | `--halves`, `--2xs` → `--2xl` |

```html
<!-- La largeur vient de l'objet, l'habillage du composant -->
<article class="c-lesson__article o-wrapper o-wrapper--medium"> … </article>

<!-- Le rythme entre les cartes vient de l'objet, pas du composant -->
<ul class="o-stack"> … </ul>

<!-- Titre à gauche, méta à droite, alignés sur la ligne de base -->
<div class="c-home__module-head o-cluster o-cluster--between o-cluster--baseline"> … </div>
```

Un composant peut régler un objet posé sur lui en surchargeant sa variable, plutôt qu'en réécrivant la règle :

```scss
.c-lesson__article {
  @include mq.mq($from: medium) {
    --gutter: #{spacing.get("xl")};   // élargit la gouttière de .o-wrapper
  }
}
```

### Où écrire quoi

- **une largeur max, un espacement entre des éléments frères, un alignement en ligne** → un objet dans le HTML, jamais du CSS dans le composant ;
- **une couleur, une bordure, une ombre, un arrondi, un état** → le composant ;
- **une taille de texte** → un mixin de `tools/_fonts.scss` (`@include fonts.h2`, `fonts.small-text`, `fonts.eyebrow`), jamais un `font-size` posé à la main ;
- **une balise nue** (`h2`, `a`, `blockquote`) → uniquement dans `elements/` ou dans le scope `scopes/_richtext.scss` ;
- **un ajustement ponctuel** que rien de ce qui précède ne couvre → une utilitaire (`.u-margin-top-lg`, `.u-hidden-visually`), en sachant que c'est le dernier recours.

### Deux règles de spécificité à ne pas oublier

Les couches basses visent des balises nues, donc sans classe. Deux pièges, dont le projet s'est fait prendre :

- **jamais de pseudo-classe sur une balise nue dans `elements/`.** `a:hover` pèse (0,1,1) et l'emporterait sur `.c-home__lesson` (0,1,0) : toutes les cartes, la navigation et les boutons-liens se soulignent au survol. Le soulignement des liens appartient donc au scope du texte rédigé, pas à `elements/`.
- **un scope ne dresse que les balises sans classe** - d'où les `:not([class])` de `scopes/_richtext.scss`. Sans eux, `.s-richtext h3` (0,1,1) écrase `.c-quiz__title` (0,1,0), et `.s-richtext ul` écrase `.o-stack` : un composant déposé dans une leçon héritait du rythme du texte rédigé.

Corollaire côté objets : **aucun objet ne remet `margin: 0` sur lui-même.** Il annulerait l'espace que lui donne un `.o-stack` parent - spécificité égale, mais déclaré après. Ces remises à zéro sont le travail de `generic/_reset.scss`, qui neutralise aussi puces et retraits de listes ; le scope du texte rédigé les réintroduit là où elles ont un sens.

Le corps des leçons est traité par le scope `.s-richtext` (`src/styles/scopes/_richtext.scss`) : titres, listes, citations, code, tableaux, images et filets y sont déjà stylés. **Une leçon en Markdown pur est donc correctement mise en forme sans aucun composant.**

Un fichier de composant nomme aussi les éléments qu'il ne style pas, sous forme de sélecteur vide (`.c-home__module {}`) : cela documente l'anatomie BEM du bloc sans produire une seule ligne de CSS.

### Les états d'un élément cliquable

Il n'y a **aucune animation décorative** dans ce template, et c'est un choix : une chose qui bouge en continu sur une page qu'on lit finit par gêner la lecture. Les états se contentent de renseigner, puis s'arrêtent.

| État | Bouton | Carte de leçon |
| --- | --- | --- |
| survol | le fond s'assombrit | monte de 2 px, filet coloré, ombre plus marquée, titre en couleur |
| clic | s'enfonce d'1 px | redescend à sa place |
| focus clavier | liseré de `generic/_focus.scss` | idem |

Le bouton d'appel de la page d'accueil (`.c-header__cta`) se soulève en plus des mêmes 2 px que les cartes : c'est le geste déjà en place dans le template, pas un effet supplémentaire.

Le retour au clic passe par `transition-duration: 0s` : un enfoncement qui met 150 ms à démarrer ne se ressent plus comme un appui. Et il est neutralisé sur un bouton désactivé (`:not(:disabled):active`) - sélecteur qui, à (0,3,0), l'emporte au passage sur le survol du bouton d'accueil (0,2,0) : on presse donc bien vers le bas, même en partant de la position soulevée.

### Les marques du projet

`tools/_logo.scss` expose deux **fonctions**, pas des variables :

| | |
| --- | --- |
| `logo.logo($color)` | le symbole seul, carré |
| `logo.logotype($color)` | le symbole accompagné du nom |

```scss
@use "../tools/logo";
@use "../settings/colors";

&::before {
  content: "";
  width: 150px;
  aspect-ratio: logo.$logotype-ratio;
  background-image: logo.logotype(colors.$primary);
  background-size: contain;
  background-repeat: no-repeat;
}
```

Pourquoi des fonctions. Un SVG embarqué en `data:` est opaque pour le CSS : ni `currentColor` ni `var(--color-…)` ne le traversent, la couleur doit être écrite **dans** le SVG. Une variable la figerait une fois pour toutes ; la fonction la reçoit à chaque appel — blanc sur un aplat foncé, `colors.$primary` sur fond clair, `colors.$border` en filigrane.

Les variables `$logo-ratio` et `$logotype-ratio` évitent de retenir les proportions : une seule dimension suffit alors à dimensionner la marque.

Trois contraintes à connaître :

- la couleur attendue est une valeur Sass **opaque** (`colors.$primary`, `colors.$page`…), **pas** un `colors.get()` : ce dernier renvoie un `var(--color-…)`, qui n'a aucun sens dans un data-URI. La couleur est donc figée à la compilation — mais changer `socle.config.json` la met quand même à jour, puisque tout est recompilé ;
- le `#` d'un hexadécimal ouvrirait un fragment d'URL et tronquerait l'image : la fonction l'encode en `%23`, et refuse au build une couleur qu'elle ne sait pas sérialiser ;
- les SVG stockés diffèrent des originaux sur un point : `viewBox` y remplace `width`/`height`. Sans viewBox, un SVG a une taille intrinsèque et **ignore `background-size`** — la marque resterait à sa taille de départ.

Elles sont appelées à cinq endroits. Sur les slides, dans des pseudo-éléments plutôt qu'en couche de fond : un pseudo-élément accepte une opacité, une rotation, un `mix-blend-mode` ou une transition. Le `z-index: -1` sur une slide qui isole son contexte d'empilement les place au-dessus du fond mais sous le texte.

| Où | Quoi |
| --- | --- |
| `components/_header.scss` | le symbole en filigrane du bandeau d'accueil, dans `::after` |
| `components/_footer.scss` | le logotype du pied de page, qui s'assombrit au survol |
| `marp/layouts/_lead.scss` | le logotype en bas à droite, dans `::after` |
| `marp/layouts/_section.scss` | le symbole en blanc, dans `::before` |
| `marp/layouts/_statement.scss` | le symbole en bas à gauche, dans `::before` |

**Deux pièges Marpit** rencontrés en posant le logotype de la slide de titre, à garder en tête pour tout usage de `::after` sur une slide :

- Marpit masque ce pseudo-élément quand la pagination est désactivée (`section:not([data-marpit-pagination])::after { display: none }`) — il faut donc rétablir `display: block` ;
- il y pose aussi `padding: inherit`, pratique pour caler la pagination dans les marges de la slide, mais qui fait ici hériter du `padding-top` réservant le bandeau. `padding: 0` remet les choses en place.

Sur une slide Marp, rappelez-vous enfin que `::after` **est** la pagination : sur une slide qui la garde, il n'y a que `::before` de disponible.

`src/styles/views/` est vide et prévu pour d'éventuels styles propres à une page.

> Ce projet n'utilise **pas** Tailwind. Toute la mise en forme est en Sass, organisée en couches ITCSS.

---

## Progression de l'apprenant

Gérée par `src/scripts/progress.ts`, entièrement côté client :

- clé `localStorage` : `mooc:progress`, contenant `{ "module-1/lecon-1": true, … }` ;
- le bouton **« Marquer comme terminé »** en bas de leçon écrit dans cette clé ;
- chaque écriture émet l'événement `mooc:progress-change`, qui rafraîchit les barres de progression de la page en direct.

Une leçon terminée se signale à trois endroits, tous pilotés par une classe posée en JavaScript : la carte de l'accueil (fond vert et étiquette « Terminé »), la ligne de la barre latérale (fond vert et coche à droite) et la jauge du module, dont le segment de même rang se remplit — puis qui passe au vert et affiche « Terminé » une fois le module bouclé. La coche seule ne suffirait pas : elle est accompagnée d'un texte « Terminé » masqué visuellement (`.u-hidden-visually`), sans quoi l'information n'existerait que pour les voyants.

Aucune donnée ne quitte le navigateur : pas de compte, pas de serveur. Corollaire à annoncer aux apprenants - la progression est perdue s'ils changent de navigateur ou vident leur cache.

---

## Faire place nette avec `npm run reset`

Le dépôt est livré **avec un cours complet**, et ce n'est pas un oubli : il sert de vitrine (tous les composants pédagogiques y passent) et de documentation par l'exemple. Vous pouvez donc lancer `npm run dev` juste après le clone et voir le template fonctionner avant d'écrire une ligne.

Quand vous démarrez votre vrai cours, `npm run reset` :

- vide `src/content/lecons/` - les douze leçons de démonstration et leurs decks ;
- y écrit **une leçon vierge**, `module-1/lecon-1.mdx`, dont le frontmatter passe le schéma Zod du premier coup ;
- remet `locked` à `[]` dans `socle.config.json` - sinon le verrou de démonstration désigne une leçon qui n'existe plus, et chaque build le signale ;
- efface `slides/`, qui contient encore les decks de la démo.

Le script **annonce la liste des fichiers avant de les supprimer** et attend que vous tapiez `oui` : pas de `[O/n]`, sur une suppression le défaut doit être « non ». `npm run reset -- --yes` saute la confirmation, pour un script d'amorçage.

Ce qu'il ne touche pas : `socle.config.json` (votre identité et votre charte y restent), les composants, les styles, et `src/assets/couverture.jpg` - le banc d'essai du thème s'en sert, elle ne fait pas partie du cours.

---

## Ce qui est versionné, et ce qui ne l'est pas

La règle habituelle - « on ne versionne pas ce qu'une commande sait reconstruire » - souffre ici **une exception assumée**. Les fichiers produits par `npm run brand` sont dans le dépôt :

| Versionné, quoique généré | Pourquoi |
| --- | --- |
| `public/fonts/*.woff2` | `apply-brand` les télécharge depuis Google Fonts. Ignorés, ils rendraient le premier `npm run dev` dépendant du réseau |
| `src/styles/settings/_brand.scss` | les couleurs et familles compilées, pour que le SCSS résolve sans étape préalable |
| `src/styles/generic/_fonts.scss` | les `@font-face` du site |
| `fonts.lock.json` | la trace de ce qui a été téléchargé - c'est ce qui permet à `npm run brand` de ne rien refaire quand rien n'a changé |

Un clone compile donc **hors ligne**. Le revers : après un changement de police, ces fichiers apparaissent dans vos diffs. C'est voulu — un changement de charte est un changement de projet, il mérite d'être visible dans l'historique.

Le reste est ignoré (`.gitignore`) : `node_modules/`, `dist/`, `slides/`, `.astro/`, `src/styles/marp/_fonts.scss` (les fontes embarquées en base64 du thème Marp : lourdes, illisibles en diff, reconstruites à chaque `predev`), les `.env`, `.DS_Store`, les réglages d'éditeur et `.claude/settings.local.json`.
