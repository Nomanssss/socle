// =============================================================
// SUIVI DE PROGRESSION - 100 % côté client (localStorage)
//
// Aucune donnée n'est envoyée à un serveur. On stocke simplement
// la liste des identifiants de leçons marquées « terminées ».
//
// Structure stockée sous la clé STORAGE_KEY :
//   { "module-1/lecon-1": true, "module-1/lecon-2": true, ... }
// =============================================================

const STORAGE_KEY = 'mooc:progress';

/** Événement émis à chaque changement, pour rafraîchir l'UI en direct. */
export const PROGRESS_EVENT = 'mooc:progress-change';

type ProgressMap = Record<string, boolean>;

function read(): ProgressMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as ProgressMap;
  } catch {
    return {};
  }
}

function write(map: ProgressMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  // Prévenir tous les composants (ProgressBar, bouton, etc.) de la page.
  window.dispatchEvent(new CustomEvent(PROGRESS_EVENT));
}

/** La leçon `id` est-elle marquée comme terminée ? */
export function isCompleted(id: string): boolean {
  return read()[id] === true;
}

/** Marque / retire l'état « terminé » d'une leçon. */
export function setCompleted(id: string, done: boolean): void {
  const map = read();
  if (done) map[id] = true;
  else delete map[id];
  write(map);
}

/** Bascule l'état « terminé » d'une leçon et renvoie le nouvel état. */
export function toggleCompleted(id: string): boolean {
  const done = !isCompleted(id);
  setCompleted(id, done);
  return done;
}

/**
 * Compte, parmi une liste d'identifiants de leçons, combien sont terminées.
 * Utilisé par la barre de progression d'un module.
 */
export function countCompleted(ids: string[]): number {
  const map = read();
  return ids.filter((id) => map[id] === true).length;
}
