// =============================================================
// login.js - la page de connexion de l'admin en ligne
//
// Le mot de passe part à /admin/api/login ; en retour, le serveur pose
// un cookie de session (invisible au JavaScript) et l'on recharge la
// page, qui sert alors l'admin.
// =============================================================

const form = /** @type {HTMLFormElement} */ (document.getElementById('login-form'));
const error = /** @type {HTMLElement} */ (document.getElementById('login-error'));
const button = /** @type {HTMLButtonElement} */ (form.querySelector('button'));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = /** @type {HTMLInputElement} */ (form.elements.namedItem('password')).value;
  if (!password) return;
  button.disabled = true;
  error.hidden = true;
  try {
    const response = await fetch('api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (response.ok) {
      location.reload();
      return;
    }
    const payload = await response.json().catch(() => ({}));
    error.textContent = payload.error ?? `Erreur ${response.status}.`;
    error.hidden = false;
    /** @type {HTMLInputElement} */ (form.elements.namedItem('password')).select();
  } catch {
    error.textContent = 'Le serveur ne répond pas.';
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
});
