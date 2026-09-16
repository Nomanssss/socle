<!-- Deck écrit à la main pour la leçon « Les mises en page de slides ».
     Il démontre le niveau 1 du générateur : ce fichier prend le dessus sur
     tout champ `slidePoints` de la leçon.

     Deux règles en écrivant ici :
       - ne PAS remettre de slide de titre : elle est déjà générée depuis
         l'en-tête du .mdx (title, module, cover) ;
       - les chemins d'images partent du dossier de CETTE leçon ; le
         générateur les réécrit en copiant les fichiers à côté du deck ;
       - chaque famille de modèle veut SA syntaxe d'image : directive
         `_backgroundImage` pour image-left/right, `![bg …]` pour
         image-split et image-full. Une image markdown ordinaire y
         serait traitée comme un contenu, et la mise en page casserait. -->

## Une slide standard

Le cas le plus courant : un titre en `##`, puis du contenu.

- une liste à puces
- avec du `code en ligne`
- et **du gras**

Sans directive `_class`, c'est ce modèle qui s'applique.

---

<!-- _class: section -->

## Partie 1 — Les modèles de texte

---

<!-- _class: statement -->

> Une slide vaut une idée. Trois puces. Huit mots par puce.

---

<!-- _class: columns-2 -->

## Deux colonnes

Le paragraphe écrit juste sous le titre traverse les colonnes : c'est le chapô, et il est facultatif.

### Le site

Des pages web, une par leçon. La sortie principale, produite par `npm run build`.

### Les slides

Une présentation par leçon, un PDF par module. Produits par `npm run slides`.

---

<!-- _class: columns-3 -->

## Trois colonnes

### HTML

Se projette au navigateur. Aucun outil requis.

### PDF

S'imprime et se transmet en un seul fichier.

### PPTX

S'ouvre dans PowerPoint pour retouche.

---

<!-- _class: columns-4 -->

## Quatre colonnes

### Écrire

Un `.mdx` par leçon.

### Assembler

Astro déduit tout.

### Habiller

Trois couleurs suffisent.

### Livrer

`npm run bundle`.

---

<!-- _class: section -->

## Partie 2 — Les modèles d'image

---

<!-- _class: image-left -->
<!-- _backgroundImage: url('../../../assets/couverture.jpg') -->

## Image à gauche

Le texte occupe l'autre moitié. Le panneau bascule à droite avec la seule directive `image-right`.

---

<!-- _class: image-split -->

![bg right:40%](../../../assets/couverture.jpg)

## Image en moitié

L'image prend la moitié de la slide, le texte l'autre.

---

<!-- _class: image-full -->

![bg brightness:0.35](../../../assets/couverture.jpg)

## Image plein cadre

Le contenu se cale en bas, tout le texte passe en blanc.

---

## Tableau et bloc de code

| Directive | Effet |
| --- | --- |
| *(aucune)* | Titre et contenu |
| `section` | Intercalaire |
| `statement` | Phrase forte |

```markdown
<!-- _class: section -->

## Partie 2 — Le CSS
```

---

<!-- _class: statement -->

> Pour juger d'une modification du thème : `npm run slides:preview`, puis le deck `00-modeles`.
