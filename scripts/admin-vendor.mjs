// =============================================================
// admin-vendor.mjs - CodeMirror empaqueté d'avance, pour l'admin en ligne
//
// En local, le serveur de l'admin empaquette CodeMirror à la première
// demande (admin/server/vendor.mjs). En ligne, la fonction Vercel ne
// doit pas faire tourner esbuild : ce script le fait une fois, pendant
// la construction du site (npm run vercel-build), et écrit le module
// dans admin/ui/vendor/codemirror.js, que la fonction servira tel quel.
//
// Le fichier produit n'est pas versionné : il se reconstruit à chaque
// déploiement.
// =============================================================

import { writeFileSync } from 'node:fs';
import { codemirrorBundle, PREBUILT } from '../admin/server/vendor.mjs';

writeFileSync(PREBUILT, await codemirrorBundle({ fresh: true }));
console.log(`  ✓ CodeMirror empaqueté : ${PREBUILT}`);
