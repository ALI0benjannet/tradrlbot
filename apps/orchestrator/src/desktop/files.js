import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ok, fail } from './platform.js';
import { openPath } from './apps.js';

// Opérations fichiers/dossiers via le module `fs` de Node.
// Sécurité : toutes les opérations sont confinées au dossier personnel de
// l'utilisateur (HOME) pour éviter les accès système sensibles / path traversal.

const HOME = os.homedir();

function resolveSafe(target) {
  const abs = path.resolve(HOME, target ?? '');
  if (abs !== HOME && !abs.startsWith(HOME + path.sep)) {
    return null; // hors du périmètre autorisé
  }
  return abs;
}

export async function listDir(target = '.') {
  const dir = resolveSafe(target);
  if (!dir) return fail('Chemin hors du dossier personnel autorisé.');
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const data = entries.map((e) => ({
      name: e.name,
      type: e.isDirectory() ? 'dir' : 'file',
    }));
    return ok(`${data.length} élément(s) dans ${dir}.`, data);
  } catch (err) {
    return fail(`Lecture impossible : ${err.message}`);
  }
}

export async function createFolder(target) {
  const dir = resolveSafe(target);
  if (!dir) return fail('Chemin hors du dossier personnel autorisé.');
  try {
    await fs.mkdir(dir, { recursive: true });
    return ok(`Dossier créé : ${dir}.`);
  } catch (err) {
    return fail(`Création impossible : ${err.message}`);
  }
}

export async function readTextFile(target) {
  const file = resolveSafe(target);
  if (!file) return fail('Chemin hors du dossier personnel autorisé.');
  try {
    const content = await fs.readFile(file, 'utf-8');
    return ok(`Contenu de ${path.basename(file)}.`, content.slice(0, 5000));
  } catch (err) {
    return fail(`Lecture impossible : ${err.message}`);
  }
}

export async function writeTextFile(target, content = '') {
  const file = resolveSafe(target);
  if (!file) return fail('Chemin hors du dossier personnel autorisé.');
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf-8');
    return ok(`Fichier écrit : ${file}.`);
  } catch (err) {
    return fail(`Écriture impossible : ${err.message}`);
  }
}

export async function moveItem(from, to) {
  const src = resolveSafe(from);
  const dest = resolveSafe(to);
  if (!src || !dest) return fail('Chemin hors du dossier personnel autorisé.');
  try {
    await fs.rename(src, dest);
    return ok(`Déplacé : ${path.basename(src)} → ${dest}.`);
  } catch (err) {
    return fail(`Déplacement impossible : ${err.message}`);
  }
}

// Action sensible : suppression confinée + confirmation explicite.
export async function deleteItem(target, { confirm = false } = {}) {
  const item = resolveSafe(target);
  if (!item) return fail('Chemin hors du dossier personnel autorisé.');
  if (item === HOME) return fail('Suppression du dossier personnel interdite.');
  if (!confirm) return fail('Suppression non confirmée. Repassez avec confirm=true.');
  try {
    await fs.rm(item, { recursive: true, force: true });
    return ok(`Supprimé : ${item}.`);
  } catch (err) {
    return fail(`Suppression impossible : ${err.message}`);
  }
  
}
// Ouvre un dossier ou un fichier avec l'application par défaut du système.
export async function openItem(target) {
  const item = resolveSafe(target);
  if (!item) return fail('Chemin hors du dossier personnel autorisé.');
  try {
    await fs.access(item);
  } catch {
    return fail(`Introuvable : ${target}.`);
  }
  return openPath(item);
}