// =============================================================
// admin-password.mjs - le mot de passe de l'admin en ligne
//
// Demande un mot de passe (sans l'afficher), puis écrit les deux
// valeurs à donner à Vercel, dans Settings → Environment Variables :
//
//   ADMIN_PASSWORD_HASH    l'empreinte du mot de passe (scrypt, salée)
//   ADMIN_SESSION_SECRET   le secret qui signe les sessions
//
// Le mot de passe lui-même n'est écrit nulle part : ni dans le dépôt,
// ni chez Vercel. Pour en changer, relancez la commande et remplacez
// ADMIN_PASSWORD_HASH - toutes les sessions ouvertes sont déconnectées.
//
// Usage : npm run admin:password
// =============================================================

import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { hashPassword } from '../admin/server/auth.mjs';

/** Lit une ligne au clavier sans l'afficher. */
function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (text) => write(text.startsWith(question) ? text : '');
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const password = await ask('Mot de passe de l’admin (12 caractères au moins) : ');
const again = await ask('Encore une fois : ');
if (password !== again) {
  console.error('\n✗ Les deux saisies diffèrent.\n');
  process.exit(1);
}

let hash;
try {
  hash = hashPassword(password);
} catch (error) {
  console.error(`\n✗ ${error.message}\n`);
  process.exit(1);
}

console.log(`
À ajouter dans Vercel → Settings → Environment Variables :

  ADMIN_PASSWORD_HASH   ${hash}
  ADMIN_SESSION_SECRET  ${randomBytes(48).toString('base64url')}

Le secret de session ne change pas quand on change de mot de passe :
gardez celui déjà en place, s'il y en a un.
`);
