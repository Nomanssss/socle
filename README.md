# Socle - template de MOOC (Astro)

Template **réutilisable** pour créer un cours en ligne / MOOC. **100 % statique** : ni backend, ni base de données, ni authentification. La progression de l'apprenant vit dans le `localStorage` de son navigateur.

Un même contenu produit **deux sorties** :

| Sortie | Source | Commande | Résultat |
| --- | --- | --- | --- |
| Le **site** du cours | `src/content/lecons/**/*.mdx` | `npm run build` | `dist/` |
| Les **slides** (une présentation par leçon) | `**/*.slides.md` ou `slidePoints` | `npm run slides` | `slides/` |

📖 **[Le guide complet](docs/GUIDE.md)** — écrire une leçon, les composants pédagogiques, les slides, la charte graphique, l'architecture des styles.

---

## Prérequis

- **Node ≥ 22.12** - exigé par Astro 7. Avec nvm : `nvm use 22`.
- Pour exporter les slides en **PDF ou PPTX** : Chrome/Chromium installé (Marp s'appuie dessus). L'export **HTML** n'en a pas besoin.

---

## Partir de ce template

Socle est un **dépôt-modèle** : on le duplique, puis on écrit son cours dedans.

| Méthode | Comment | Ce qu'on obtient |
| --- | --- | --- |
| **GitHub** | bouton **« Use this template »** | un dépôt neuf, à vous, sans l'historique de Socle |
| **degit** | `npx degit Nomanssss/socle mon-cours` | les fichiers seuls, sans `.git` - le plus rapide |
| **Archive** | *Code → Download ZIP* | idem, à décompresser ; pensez au `git init` derrière |

Puis, dans le dossier obtenu :

```bash
nvm use          # Node 22 (le projet fournit un .nvmrc)
npm install
npm run dev      # le cours de démonstration, pour voir le template tourner
npm run reset    # quand vous démarrez le vôtre : efface la démo
```

Le dépôt est livré **avec un cours complet**, et ce n'est pas un oubli : il sert de vitrine (tous les composants pédagogiques y passent) et de documentation par l'exemple. `npm run reset` le remplace par une leçon vierge — après vous avoir montré la liste des fichiers et demandé confirmation.

→ [Ce que `reset` fait exactement, et ce qui est versionné ou non](docs/GUIDE.md#faire-place-nette-avec-npm-run-reset)

---

## Structure du projet

```
src/
├── content/
│   ├── lecons/               → VOS LEÇONS, rangées par dossier de module
│   │   └── module-1/
│   │       ├── lecon-1.mdx        → la page web de la leçon
│   │       └── lecon-1.slides.md  → son deck Marp (optionnel)
│   └── ../content.config.ts  → schéma Zod du frontmatter des leçons
├── components/               → composants pédagogiques (.astro)
│   └── Footer.astro          → pied de page commun (marque + mentions légales)
├── layouts/
│   └── LessonLayout.astro    → gabarit d'une leçon (sidebar + progression)
├── pages/
│   ├── index.astro           → accueil : liste les modules et leurs leçons
│   ├── mentions-legales.astro → page annexe, alimentée par socle.config.json
│   └── lecons/[...id].astro  → route dynamique des leçons
├── scripts/progress.ts       → suivi de progression (localStorage)
├── assets/                   → images sources, optimisées par Astro
└── styles/                   → ITCSS + BEMIT (voir le guide)
public/fonts/                 → polices auto-hébergées (générées)
socle.config.json             → LE FICHIER À RÉGLER : identité, couleurs, polices, leçons verrouillées
fonts.lock.json               → trace des polices téléchargées (généré)
scripts/config.mjs            → lecture de socle.config.json (scripts + pages Astro)
scripts/apply-brand.mjs       → applique socle.config.json au projet
scripts/build-slides.mjs      → générateur des decks Marp
scripts/bundle-dist.mjs       → assemble le paquet livrable dans dist/
scripts/reset-content.mjs     → efface le cours de démonstration (npm run reset)
.nvmrc                        → la version de Node attendue (nvm use)
docs/GUIDE.md                 → le guide complet
LICENSE                       → MIT, voir « Licence » en fin de document
```

⚠️ Le fichier de configuration des collections est bien `src/content.config.ts` (Astro 5+/7), et **non** `src/content/config.ts`.

`dist/`, `slides/` et `.astro/` sont générés : ils sont dans `.gitignore`. Ne les éditez jamais à la main. Les fichiers de charte, eux, sont générés **et** versionnés — voir [« Ce qui est versionné, et ce qui ne l'est pas »](docs/GUIDE.md#ce-qui-est-versionné-et-ce-qui-ne-lest-pas).

---

## Les commandes

| Commande | Ce qu'elle fait |
| --- | --- |
| `npm run dev` | serveur de développement → <http://localhost:4321> |
| `npm run build` | le site statique, dans `dist/` |
| `npm run preview` | prévisualise le build |
| `npm run brand` | applique la charte de `socle.config.json` (couleurs + polices) |
| `npm run slides` | les présentations en PDF, une par leçon |
| `npm run slides:html` | les mêmes, en HTML autonome |
| `npm run slides:preview` | aperçu live du thème des slides → <http://localhost:8080> |
| `npm run bundle` | le livrable complet : le site **et** les présentations |
| `npm run reset` | efface le cours de démonstration |

`brand` tourne tout seul avant `dev` et `build` : une couleur changée dans `socle.config.json` est prise en compte sans rien lancer d'autre.

> ⚠️ `npm run check` (vérification des types) n'est **pas** disponible tel quel : Astro demande d'abord à installer `@astrojs/check` et `typescript`, via une invite interactive. Pour l'avoir en permanence : `npm i -D @astrojs/check typescript`. En attendant, `npm run build` valide déjà tous les frontmatters (les erreurs Zod y font échouer le build).

---

## Écrire une leçon

Un fichier `.mdx` dans `src/content/lecons/<module>/`, et c'est tout : la navigation, le classement et le sommaire s'en déduisent. Aucun menu à tenir à jour.

```mdx
---
title: "Les sélecteurs CSS"
module: "Module 2 - Le style"
moduleOrder: 2
order: 1
description: "Cibler un élément, et un seul."
---

Le contenu de la leçon, en markdown.
```

Ces quatre premiers champs sont obligatoires — le build échoue si l'un manque. Les composants pédagogiques (quiz, flashcards, frise, glisser-déposer, vidéo, podcast, CodePen) s'importent en tête de fichier.

→ [Frontmatter complet, composants et images](docs/GUIDE.md#ajouter-une-leçon)

---

## Déployer

Le site étant statique, l'hébergement est simple et souvent gratuit :

1. poussez le projet sur un dépôt Git ;
2. connectez-le à un hébergeur statique (Netlify, Vercel, Cloudflare Pages, GitHub Pages) ;
3. commande de build : `npm run build` - dossier à publier : `dist/`.

Le `.nvmrc` du projet est lu par Netlify, Vercel et Cloudflare Pages : ils construisent avec la bonne version de Node sans réglage. Sur GitHub Pages, précisez-la dans le workflow (`actions/setup-node` avec `node-version-file: .nvmrc`).

Les slides ne sont pas incluses dans `dist/` : ce sont des fichiers autonomes à distribuer comme vous l'entendez.

---

## Licence

Le **code** du template est publié sous licence MIT (fichier `LICENSE`) : reprenez-le, modifiez-le, utilisez-le en projet commercial, à la seule condition de conserver la notice de copyright. Le cours de démonstration livré avec le dépôt suit la même licence - il est fait pour être supprimé (`npm run reset`) ou recyclé.

Le **contenu que vous écrivez** avec Socle, lui, vous appartient : la licence porte sur l'outil, pas sur ce qu'on produit avec. C'est ce que rappelle la rubrique « Propriété intellectuelle » de la page des mentions légales.
