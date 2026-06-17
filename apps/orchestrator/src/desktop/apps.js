import { isWin, isMac, safeExec, ok, fail } from './platform.js';

// Ouverture / fermeture d'applications via child_process (commandes natives OS).

// Table d'alias : noms familiers/français -> exécutable réel par plateforme.
// La clé est normalisée (minuscules, sans accents).
const APP_ALIASES = {
  // Navigateurs
  navigateur: { win: 'chrome', mac: 'Google Chrome', linux: 'google-chrome' },
  chrome: { win: 'chrome', mac: 'Google Chrome', linux: 'google-chrome' },
  google: { win: 'chrome', mac: 'Google Chrome', linux: 'google-chrome' },
  'google chrome': { win: 'chrome', mac: 'Google Chrome', linux: 'google-chrome' },
  firefox: { win: 'firefox', mac: 'Firefox', linux: 'firefox' },
  edge: { win: 'msedge', mac: 'Microsoft Edge', linux: 'microsoft-edge' },
  'microsoft edge': { win: 'msedge', mac: 'Microsoft Edge', linux: 'microsoft-edge' },
  // Outils système
  calculatrice: { win: 'calc', mac: 'Calculator', linux: 'gnome-calculator' },
  calculette: { win: 'calc', mac: 'Calculator', linux: 'gnome-calculator' },
  calculator: { win: 'calc', mac: 'Calculator', linux: 'gnome-calculator' },
  'bloc-notes': { win: 'notepad', mac: 'TextEdit', linux: 'gedit' },
  'bloc notes': { win: 'notepad', mac: 'TextEdit', linux: 'gedit' },
  notepad: { win: 'notepad', mac: 'TextEdit', linux: 'gedit' },
  paint: { win: 'mspaint', mac: 'Preview', linux: 'gimp' },
  explorateur: { win: 'explorer', mac: 'Finder', linux: 'nautilus' },
  'explorateur de fichiers': { win: 'explorer', mac: 'Finder', linux: 'nautilus' },
  terminal: { win: 'wt', mac: 'Terminal', linux: 'gnome-terminal' },
  'invite de commande': { win: 'cmd', mac: 'Terminal', linux: 'gnome-terminal' },
  cmd: { win: 'cmd', mac: 'Terminal', linux: 'gnome-terminal' },
  parametres: { win: 'ms-settings:', mac: 'System Preferences', linux: 'gnome-control-center' },
  reglages: { win: 'ms-settings:', mac: 'System Preferences', linux: 'gnome-control-center' },
  // Apps courantes
  'vs code': { win: 'code', mac: 'Visual Studio Code', linux: 'code' },
  vscode: { win: 'code', mac: 'Visual Studio Code', linux: 'code' },
  spotify: { win: 'spotify', mac: 'Spotify', linux: 'spotify' },
  discord: { win: 'discord', mac: 'Discord', linux: 'discord' },
  word: { win: 'winword', mac: 'Microsoft Word', linux: 'libreoffice --writer' },
  excel: { win: 'excel', mac: 'Microsoft Excel', linux: 'libreoffice --calc' },
};

const stripAccents = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Nettoie le nom capturé : enlève accents, articles initiaux et espaces.
function normalizeAppName(name) {
  return stripAccents(name)
    .toLowerCase()
    .replace(/^\s*(?:l'|le |la |les |mon |ma |mes |un |une )/i, '')
    .trim();
}

// Résout le nom familier vers l'exécutable réel pour la plateforme courante.
function resolveApp(name) {
  const key = normalizeAppName(name);
  const alias = APP_ALIASES[key];
  if (alias) return isWin ? alias.win : isMac ? alias.mac : alias.linux;
  return key || name.trim();
}

export async function openApp(name) {
  if (!name) return fail('Quelle application dois-je ouvrir ?');
  const target = resolveApp(name).replace(/"/g, '');
  let res;
  if (isWin) {
    // 1) Tente via `start` (gère les App Paths et les URI ms-settings:).
    res = await safeExec(`start "" "${target}"`);
    // 2) Repli : lance directement l'exécutable (ex: code, spotify sur le PATH).
    if (!res.ok) res = await safeExec(`"${target}"`);
  } else if (isMac) {
    res = await safeExec(`open -a "${target}"`);
  } else {
    res = await safeExec(`(setsid ${target} >/dev/null 2>&1 &) || (xdg-open "${target}")`);
  }
  return res.ok ? ok(`Ouverture de ${name}.`) : fail(`Impossible d'ouvrir ${name}.`);
}

export async function closeApp(name) {
  if (!name) return fail('Quelle application dois-je fermer ?');
  const safe = resolveApp(name).replace(/"/g, '');
  let res;
  if (isWin) {
    // Tente par nom d'image (.exe) puis par titre de fenêtre.
    const exe = safe.endsWith('.exe') ? safe : `${safe}.exe`;
    res = await safeExec(`taskkill /IM "${exe}" /F`);
    if (!res.ok) res = await safeExec(`taskkill /FI "WINDOWTITLE eq ${safe}*" /F`);
  } else if (isMac) {
    res = await safeExec(`osascript -e 'quit app "${safe}"'`);
  } else {
    res = await safeExec(`pkill -f "${safe}"`);
  }
  return res.ok ? ok(`Fermeture de ${name}.`) : fail(`Impossible de fermer ${name}.`);
}

// Ouvre un fichier ou une URL avec l'application par défaut du système.
export async function openPath(target) {
  if (!target) return fail('Quel fichier ou lien dois-je ouvrir ?');
  const safe = target.replace(/"/g, '');
  let res;
  if (isWin) res = await safeExec(`start "" "${safe}"`);
  else if (isMac) res = await safeExec(`open "${safe}"`);
  else res = await safeExec(`xdg-open "${safe}"`);
  return res.ok ? ok(`Ouverture de ${target}.`) : fail(`Impossible d'ouvrir ${target}.`);
}
