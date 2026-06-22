// Couche Contrôle du bureau — point d'entrée unique.
// Mappe une action normalisée "domaine.action" vers la bonne implémentation.
import * as apps from './apps.js';
import * as volume from './volume.js';
import * as brightness from './brightness.js';
import * as windows from './windows.js';
import * as power from './power.js';
import * as files from './files.js';
import * as input from './input.js';
import { fail } from './platform.js';

// Table de routage : action -> handler(params)
const ACTIONS = {
  // Applications
  'app.open': (p) => apps.openApp(p.name),
  'app.close': (p) => apps.closeApp(p.name),
  'app.openPath': (p) => apps.openPath(p.target),

  // Volume
  'volume.up': () => volume.changeVolume('up'),
  'volume.down': () => volume.changeVolume('down'),
  'volume.set': (p) => volume.setVolume(p.level),
  'volume.mute': () => volume.toggleMute(),

  // Luminosité
  'brightness.up': () => brightness.changeBrightness('up'),
  'brightness.down': () => brightness.changeBrightness('down'),
  'brightness.set': (p) => brightness.setBrightness(p.level),

  // Fenêtres
  'window.active': () => windows.getActiveWindow(),
  'window.list': () => windows.listWindows(),
  'window.focus': (p) => windows.focusWindow(p.title),
  'window.minimize': () => windows.minimizeActive(),
  'window.maximize': () => windows.maximizeActive(),

  // Alimentation / session
  'power.lock': () => power.lockScreen(),
  'power.sleep': () => power.sleep(),
  'power.displayOff': () => power.turnOffDisplay(),
  'power.shutdown': (p) => power.shutdown(p),
  'power.restart': (p) => power.restart(p),

  // Fichiers / dossiers
  'files.list': (p) => files.listDir(p.path),
  'files.mkdir': (p) => files.createFolder(p.path),
  'files.read': (p) => files.readTextFile(p.path),
  'files.write': (p) => files.writeTextFile(p.path, p.content),
  'files.move': (p) => files.moveItem(p.from, p.to),
  'files.delete': (p) => files.deleteItem(p.path, p),
  'files.open': (p) => files.openItem(p.path),

  // Clavier / souris
  'input.type': (p) => input.typeText(p.text),
  'input.keys': (p) => input.pressKeys(p.keys),
  'input.mouseMove': (p) => input.moveMouse(p.x, p.y),
  'input.click': (p) => input.click(p.button),
  'input.cursor': () => input.cursorPosition(),
};

export function listDesktopActions() {
  return Object.keys(ACTIONS);
}

// Exécute une action desktop. Retourne toujours { ok, message, data? }.
export async function runDesktopAction(action, params = {}) {
  const handler = ACTIONS[action];
  if (!handler) return fail(`Action bureau inconnue : ${action}`);
  try {
    return await handler(params);
  } catch (err) {
    return fail(`Erreur lors de « ${action} » : ${err.message}`);
  }
}
