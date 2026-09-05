---
marp: true
theme: socle
paginate: true
---

<!-- Deck de démonstration des mises en page du thème.
     Les images s'écrivent comme dans une vraie leçon : un chemin normal,
     que la mise en scène copie dans slides/assets/ et réécrit toute seule.
     Ici les chemins partent de la racine du projet ; dans un .slides.md ils
     partent du dossier de la leçon.
     Il ne fait partie d'aucune leçon : il sert à voir l'effet d'une
     modification du thème sur toutes les mises en page d'un coup.
     Lancez `npm run slides:preview`, puis éditez src/styles/marp/. -->

<!-- _class: lead -->
<!-- _paginate: false -->

# Modèles de slides

**Thème socle — banc d'essai**

---

## Slide standard

Le cas le plus courant : un titre en `##`, puis du contenu.

- une liste à puces
- avec du `code en ligne`
- et **du gras**

---

<!-- _class: columns-2 -->

## Deux colonnes

![Illustration du template](src/assets/couverture.jpg)

### Avec un composant

Un quiz, une frise chronologique, des cartes à retourner.

![Couverture du cours](src/assets/couverture.jpg)

### En markdown pur

Titres, listes, citations, tableaux, code : déjà mis en forme.

---

<!-- _class: columns-3 -->

## Trois colonnes

### Écrire

La structure : titres, paragraphes, liens, images. C'est le squelette de la page.

### Habiller

L'apparence : couleurs, tailles, espacements, mise en page.

### Livrer

Le comportement : ce qui réagit au clic, au défilement, à la saisie.

---

<!-- _class: columns-4 -->

## Quatre colonnes

### Écrire

Une leçon en markdown.

### Illustrer

Composants et images.

### Projeter

Un deck par leçon.

### Publier

Un dossier statique.

---

<!-- _class: image-left -->
<!-- _backgroundImage: url('src/assets/couverture.jpg') -->

## Panneau d'image à gauche

**Le ton se décide une fois la cible définie**

À se demander avant d'écrire :

- À qui je parle ?
- Dans quel contexte on m'écoute ?
- Quelle relation je veux créer ?

---

<!-- _class: image-right -->
<!-- _backgroundImage: url('src/assets/couverture.jpg') -->

## Le même, à droite

Le panneau bascule d'un côté à l'autre avec la seule directive `_class`.

Sans image, il retombe sur un aplat de la couleur d'accent.

---

<!-- _class: image-split -->

![bg right:40%](src/assets/couverture.jpg)

## Image et texte côte à côte

`image-split` obtient un résultat voisin de `image-left` et `image-right`, mais par le mécanisme de découpe de Marp plutôt que par un pseudo-élément.

Le côté ET la proportion se règlent dans le markdown : `![bg right:40%]`. Pas de classe à changer, mais pas de réglage possible en CSS non plus.

---

<!-- _class: image-full -->

![bg brightness:0.35](src/assets/couverture.jpg)

## Texte sur image plein cadre

Le contenu se cale en bas, tout le texte passe en blanc.

Pensez au `brightness:` pour garder le texte lisible sur une photo claire.

---

<!-- _class: section -->

## Partie 2 — Les modèles d'image

---

<!-- _class: statement -->

> Une slide vaut une idée. Trois puces. Huit mots par puce.

---

## Tableau et bloc de code

| Balise | Rôle |
| --- | --- |
| `<h1>` | Titre principal |
| `<p>` | Paragraphe |

```css
p {
  color: #333;
}
```
