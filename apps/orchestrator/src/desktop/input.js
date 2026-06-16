import { optionalImport, ok, fail } from './platform.js';

// Automatisation clavier / souris via nut.js (@nut-tree-fork/nut-js).
// La librairie est optionnelle (build natif) : repli explicite si absente.

async function getNut() {
  return optionalImport('@nut-tree-fork/nut-js');
}

// Tape une chaîne de texte au clavier.
export async function typeText(text) {
  if (!text) return fail('Aucun texte à saisir.');
  const nut = await getNut();
  if (!nut) return fail('Installez `@nut-tree-fork/nut-js` pour l’automatisation clavier.');
  await nut.keyboard.type(text);
  return ok(`Texte saisi (${text.length} caractères).`);
}

// Envoie une combinaison de touches, ex: ['LeftControl', 'C'].
export async function pressKeys(keys = []) {
  const nut = await getNut();
  if (!nut) return fail('Installez `@nut-tree-fork/nut-js`.');
  const { keyboard, Key } = nut;
  const resolved = keys.map((k) => Key[k]).filter((k) => k !== undefined);
  if (resolved.length === 0) return fail('Aucune touche valide fournie.');
  await keyboard.pressKey(...resolved);
  await keyboard.releaseKey(...resolved);
  return ok(`Combinaison envoyée : ${keys.join(' + ')}.`);
}

// Déplace le curseur à une position absolue (x, y).
export async function moveMouse(x, y) {
  const nut = await getNut();
  if (!nut) return fail('Installez `@nut-tree-fork/nut-js`.');
  const { mouse, Point } = nut;
  await mouse.setPosition(new Point(Number(x), Number(y)));
  return ok(`Curseur déplacé en (${x}, ${y}).`);
}

// Clic souris : 'left' (défaut), 'right' ou 'middle'.
export async function click(button = 'left') {
  const nut = await getNut();
  if (!nut) return fail('Installez `@nut-tree-fork/nut-js`.');
  const { mouse, Button } = nut;
  const map = { left: Button.LEFT, right: Button.RIGHT, middle: Button.MIDDLE };
  await mouse.click(map[button] ?? Button.LEFT);
  return ok(`Clic ${button}.`);
}

// Capture la position actuelle du curseur.
export async function cursorPosition() {
  const nut = await getNut();
  if (!nut) return fail('Installez `@nut-tree-fork/nut-js`.');
  const pos = await nut.mouse.getPosition();
  return ok(`Curseur en (${pos.x}, ${pos.y}).`, pos);
}
