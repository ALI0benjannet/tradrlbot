import { optionalImport, ok, fail } from './platform.js';

// Gestion des fenêtres : liste, fenêtre active, focus, minimiser/maximiser.
// Librairies : `node-window-manager` (manipulation) + `active-win` (fenêtre active).

async function getWM() {
  const mod = await optionalImport('node-window-manager');
  return mod?.windowManager ?? null;
}

// Fenêtre actuellement au premier plan.
export async function getActiveWindow() {
  const activeWin = await optionalImport('active-win');
  if (activeWin) {
    const win = await activeWin();
    if (!win) return ok('Aucune fenêtre active détectée.');
    return ok(`Fenêtre active : ${win.owner?.name} — « ${win.title} »`, win);
  }
  const wm = await getWM();
  if (wm) {
    const win = wm.getActiveWindow();
    return ok(`Fenêtre active : « ${win?.getTitle?.() ?? 'inconnue'} »`);
  }
  return fail('Installez `active-win` ou `node-window-manager`.');
}

// Liste les fenêtres ouvertes (titre + application).
export async function listWindows() {
  const wm = await getWM();
  if (!wm) return fail('Installez `node-window-manager`.');
  const windows = wm
    .getWindows()
    .filter((w) => w.isVisible() && w.getTitle())
    .map((w) => ({ id: w.id, title: w.getTitle(), path: w.path }));
  return ok(`${windows.length} fenêtre(s) ouverte(s).`, windows);
}

// Met au premier plan la première fenêtre dont le titre correspond.
export async function focusWindow(titlePart) {
  const wm = await getWM();
  if (!wm) return fail('Installez `node-window-manager`.');
  if (!titlePart) return fail('Quel titre de fenêtre cibler ?');
  const target = wm
    .getWindows()
    .find((w) => w.getTitle()?.toLowerCase().includes(titlePart.toLowerCase()));
  if (!target) return fail(`Aucune fenêtre « ${titlePart} » trouvée.`);
  target.bringToTop();
  target.restore();
  return ok(`Fenêtre « ${target.getTitle()} » mise au premier plan.`);
}

export async function minimizeActive() {
  const wm = await getWM();
  if (!wm) return fail('Installez `node-window-manager`.');
  const win = wm.getActiveWindow();
  win?.minimize();
  return ok('Fenêtre active minimisée.');
}

export async function maximizeActive() {
  const wm = await getWM();
  if (!wm) return fail('Installez `node-window-manager`.');
  const win = wm.getActiveWindow();
  win?.maximize();
  return ok('Fenêtre active maximisée.');
}
