import { exec } from 'node:child_process';
import { promisify } from 'node:util';

export const execAsync = promisify(exec);

export const isWin = process.platform === 'win32';
export const isMac = process.platform === 'darwin';
export const isLinux = !isWin && !isMac;

// Exécute une commande shell de façon sûre (timeout + capture d'erreur).
export async function safeExec(cmd, { timeout = 8000 } = {}) {
  try {
    const { stdout } = await execAsync(cmd, { timeout, windowsHide: true });
    return { ok: true, stdout: stdout.trim() };
  } catch (err) {
    console.error('[desktop] échec commande:', err.message);
    return { ok: false, stdout: '', error: err.message };
  }
}

// Importe dynamiquement une dépendance native optionnelle.
// Retourne le module ou null s'il n'est pas installé (build natif absent).
export async function optionalImport(name) {
  try {
    const mod = await import(name);
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

// Format de réponse uniforme pour toutes les actions desktop.
export const ok = (message, data) => ({ ok: true, message, data });
export const fail = (message, data) => ({ ok: false, message, data });
