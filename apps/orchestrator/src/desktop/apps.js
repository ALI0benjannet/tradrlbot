import { isWin, isMac, safeExec, ok, fail } from './platform.js';

// Ouverture / fermeture d'applications via child_process (commandes natives OS).

export async function openApp(name) {
  if (!name) return fail('Quelle application dois-je ouvrir ?');
  const safe = name.replace(/"/g, '');
  let res;
  if (isWin) res = await safeExec(`start "" "${safe}"`);
  else if (isMac) res = await safeExec(`open -a "${safe}"`);
  else res = await safeExec(`(setsid "${safe}" >/dev/null 2>&1 &) || (xdg-open "${safe}")`);
  return res.ok ? ok(`Ouverture de ${name}.`) : fail(`Impossible d'ouvrir ${name}.`);
}

export async function closeApp(name) {
  if (!name) return fail('Quelle application dois-je fermer ?');
  const safe = name.replace(/"/g, '');
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
