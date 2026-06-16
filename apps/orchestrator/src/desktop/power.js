import { isWin, isMac, safeExec, ok, fail } from './platform.js';

// Verrouillage / veille / extinction via commandes natives OS (child_process).
// Les actions destructives (shutdown/restart) renvoient un avertissement clair.

export async function lockScreen() {
  let res;
  if (isWin) res = await safeExec('rundll32.exe user32.dll,LockWorkStation');
  else if (isMac)
    res = await safeExec(
      '/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend'
    );
  else res = await safeExec('loginctl lock-session || xdg-screensaver lock');
  return res.ok ? ok('Session verrouillée.') : fail('Échec du verrouillage.');
}

export async function sleep() {
  let res;
  if (isWin) res = await safeExec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
  else if (isMac) res = await safeExec('pmset sleepnow');
  else res = await safeExec('systemctl suspend');
  return res.ok ? ok('Mise en veille…') : fail('Échec de la mise en veille.');
}

export async function turnOffDisplay() {
  let res;
  if (isWin)
    res = await safeExec(
      'powershell -NoProfile -Command "(Add-Type \'[DllImport(\\"user32.dll\\")]public static extern int SendMessage(int hWnd,int hMsg,int wParam,int lParam);\' -Name a -Pas)::SendMessage(-1,0x0112,0xF170,2)"'
    );
  else if (isMac) res = await safeExec('pmset displaysleepnow');
  else res = await safeExec('xset dpms force off');
  return res.ok ? ok('Écran éteint.') : fail("Échec de l'extinction de l'écran.");
}

// Action sensible : nécessite confirm:true pour éviter un arrêt accidentel.
export async function shutdown({ confirm = false } = {}) {
  if (!confirm) return fail('Arrêt non confirmé. Repassez avec confirm=true.');
  let res;
  if (isWin) res = await safeExec('shutdown /s /t 5');
  else if (isMac) res = await safeExec('osascript -e \'tell app "System Events" to shut down\'');
  else res = await safeExec('systemctl poweroff');
  return res.ok ? ok('Arrêt du système dans 5 s…') : fail("Échec de l'arrêt.");
}

// Action sensible : nécessite confirm:true.
export async function restart({ confirm = false } = {}) {
  if (!confirm) return fail('Redémarrage non confirmé. Repassez avec confirm=true.');
  let res;
  if (isWin) res = await safeExec('shutdown /r /t 5');
  else if (isMac) res = await safeExec('osascript -e \'tell app "System Events" to restart\'');
  else res = await safeExec('systemctl reboot');
  return res.ok ? ok('Redémarrage dans 5 s…') : fail('Échec du redémarrage.');
}
