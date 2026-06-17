import { askAI } from '../services/aiClient.js';
import { runDesktopAction } from '../desktop/index.js';
import { recordInteraction } from '../data/db.js';

// Routeur de commandes : décide entre action bureau locale et requête IA.
// 1) Détecte les commandes bureau simples par mots-clés (offline rapide).
// 2) Sinon délègue à la couche IA (STT/NLU/LLM) pour comprendre l'intention.

// Chaque règle : un test regex (sur texte normalisé sans accents) -> { action, params }
const DESKTOP_RULES = [
  // Volume — réglage à une valeur précise (prioritaire : présence d'un nombre)
  {
    re: /(?:regl\w*|met\w*|fix\w*|mont\w*|augment\w*|augmant\w*|augmat\w*|baiss\w*|diminu\w*|pass\w*|set).*(?:volume|son|sound).*?(\d{1,3})\s*%?/i,
    map: (m) => ({ action: 'volume.set', params: { level: m[1] } }),
  },
  { re: /(?:monte|augmente|augmant|augmat|hausse|plus de|up).*(volume|son|sound)/i, map: () => ({ action: 'volume.up' }) },
  { re: /(?:baisse|diminue|reduis|moins de|down).*(volume|son|sound)/i, map: () => ({ action: 'volume.down' }) },
  { re: /(?:coupe|mute|silence|muet).*(son|volume|sound)/i, map: () => ({ action: 'volume.mute' }) },

  // Luminosité — réglage à une valeur précise (tolère "lumiere", "lumenisite", etc.)
  {
    re: /(?:regl\w*|met\w*|fix\w*|mont\w*|augment\w*|augmant\w*|augmat\w*|baiss\w*|diminu\w*|pass\w*|set).*(?:luminosit|luminisit|lumenisit|lumin|lumier|lumiere|brillance|brightness|ecran|screen).*?(\d{1,3})\s*%?/i,
    map: (m) => ({ action: 'brightness.set', params: { level: m[1] } }),
  },
  { re: /(?:monte|augmente|augmant|augmat|hausse|plus de|up).*(luminosit|luminisit|lumenisit|lumin|lumier|lumiere|brillance|brightness|ecran|screen)/i, map: () => ({ action: 'brightness.up' }) },
  { re: /(?:baisse|diminue|reduis|moins de|down).*(luminosit|luminisit|lumenisit|lumin|lumier|lumiere|brillance|brightness|ecran|screen)/i, map: () => ({ action: 'brightness.down' }) },

  // Fenêtres
  { re: /(quelle|quel).*(fenetre|application).*(active|ouverte|premier plan)/i, map: () => ({ action: 'window.active' }) },
  { re: /(liste|montre).*(fenetres|applications ouvertes)/i, map: () => ({ action: 'window.list' }) },
  { re: /(minimise|reduis).*(fenetre)/i, map: () => ({ action: 'window.minimize' }) },
  { re: /(maximise|agrandis).*(fenetre)/i, map: () => ({ action: 'window.maximize' }) },

  // Alimentation / session
  { re: /(verrouille|lock).*(session|ecran|ordinateur)/i, map: () => ({ action: 'power.lock' }) },
  { re: /(mets?|mise).*(veille)/i, map: () => ({ action: 'power.sleep' }) },
  { re: /(eteins|coupe).*(ecran)/i, map: () => ({ action: 'power.displayOff' }) },

  // Fichiers / dossiers
  {
    re: /(?:cree?|creer|crie|crier|nouveau|nouvelle|ajoute|fais)\b.*\b(dossier|repertoire|folder)/i,
    map: (m, text) => ({ action: 'files.mkdir', params: { path: parseFolderPath(text) } }),
  },
  {
    re: /(?:liste|montre|affiche|contenu).*(?:dossier|repertoire|fichiers|contenu).*(?:bureau|desktop|documents|telechargements|downloads)/i,
    map: (m, text) => ({ action: 'files.list', params: { path: parseLocation(text) } }),
  },
  // Variante courte : "liste le bureau", "montre le contenu du bureau"
  {
    re: /(?:liste|montre|affiche|ouvre).*(?:bureau|desktop|documents|telechargements|downloads)/i,
    map: (m, text) => ({ action: 'files.list', params: { path: parseLocation(text) } }),
  },
  // Renommer : "renomme X en Y" (tolère fautes : renome, ave/avec, etc.)
  {
    re: /(?:reno?mm?e[rz]?|rebaptise[rz]?|rename)\s+(?:le\s+|la\s+|l'|du\s+)?(?:dossier|repertoire|fichier|folder)?\s*["']?([a-z0-9][a-z0-9 _.-]*?)["']?\s+(?:en|vers|avec(?:\s+le\s+nom)?|ave|->)\s+["']?([a-z0-9][a-z0-9 _.-]*?)["']?\s*$/i,
    map: (m, text) => {
      const base = parseLocation(text);
      const fromName = cleanName(m[1]);
      const toName = cleanName(m[2]);
      const from = base ? `${base}/${fromName}` : fromName;
      const to = base ? `${base}/${toName}` : toName;
      return { action: 'files.move', params: { from, to } };
    },
  },
  // Déplacer : "deplace X vers <emplacement>"
  {
    re: /(?:deplace[rz]?|bouge)\s+(?:le\s+|la\s+|l'|du\s+)?(?:dossier|repertoire|fichier|folder)?\s*["']?([a-z0-9][a-z0-9 _.-]*?)["']?\s+(?:vers|dans|->)\s+(.+)$/i,
    map: (m, text) => {
      const name = cleanName(m[1]);
      const from = parseItemPath(name, text);
      const destBase = parseLocation(m[2]) || cleanName(m[2]);
      return { action: 'files.move', params: { from, to: `${destBase}/${name}` } };
    },
  },
  // Écrire dans un fichier : "ecris <contenu> dans le fichier X"
  {
    re: /(?:ecri[stz]+|note|enregistre)\s+(.+?)\s+dans\s+(?:le\s+)?(?:fichier\s+)?["']?([a-z0-9][a-z0-9 _.-]*?)["']?\s*$/i,
    map: (m, text) => ({
      action: 'files.write',
      params: { path: parseItemPath(cleanName(m[2]), text), content: m[1].trim() },
    }),
  },
  // Supprimer : confirm:true car la suppression est explicitement demandée
  {
    re: /(?:supprime[rz]?|efface[rz]?|enleve|retire|jette)\b.*\b(dossier|repertoire|folder|fichier)/i,
    map: (m, text) => ({ action: 'files.delete', params: { path: parseDeletePath(text), confirm: true } }),
  },

  // Applications (testées en dernier car très permissives)
  {
    re: /(?:ferme[rz]?|quitte[rz]?|close|kill)\s+(?:l'?app(?:lication)?\s+)?(.+)/i,
    map: (m) => ({ action: 'app.close', params: { name: m[1].trim() } }),
  },
  {
    re: /(?:ouvr\w*|lanc\w*|demarr\w*|execute[rz]?|open|start|launch|run)\s+(?:l'?app(?:lication)?\s+)?(.+)/i,
    map: (m) => ({ action: 'app.open', params: { name: m[1].trim() } }),
  },
];

// Supprime les accents/diacritiques pour un matching robuste.
const stripAccents = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Déduit un dossier de base (relatif à HOME) à partir du texte.
function parseLocation(text) {
  if (/(bureau|desktop)/i.test(text)) return 'Desktop';
  if (/(documents?)/i.test(text)) return 'Documents';
  if (/(telechargements?|downloads?)/i.test(text)) return 'Downloads';
  return '';
}

// Retire les suffixes d'emplacement parasites d'un nom capturé
// (ex: "demo2 sur le bureau" -> "demo2").
function cleanName(raw) {
  return (raw || '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+(?:sur|dans|vers|du|de|le|la|l')\s+(?:le\s+|la\s+|mon\s+|mes\s+)?(?:bureau|desktop|documents?|telechargements?|downloads?|dossier|repertoire)\b.*$/i, '')
    .trim();
}

// Extrait le nom de dossier + son emplacement depuis une commande naturelle.
function parseFolderPath(text) {
  let name = null;
  // "... avec le nom X", "... nomme X", "... appele X", "... intitule X"
  let mm = text.match(/\b(?:nom\w*|appel\w*|intitul\w*)\s+(?:de\s+|du\s+|le\s+|la\s+)?["']?([a-z0-9][a-z0-9 _.-]*?)["']?\s*$/i);
  // "... dossier X" (X = dernier mot si pas d'emplacement parasite)
  if (!mm) mm = text.match(/\b(?:dossier|repertoire|folder)\s+["']?([a-z0-9][a-z0-9_.-]*)["']?\s*$/i);
  if (mm) name = mm[1].trim();
  // repli : dernier "mot" alphanumérique de la phrase
  if (!name) {
    const tokens = text.match(/[a-z0-9_.-]{2,}/gi) || [];
    name = tokens[tokens.length - 1] || 'nouveau-dossier';
  }
  name = cleanName(name) || 'nouveau-dossier';
  const base = parseLocation(text);
  return base ? `${base}/${name}` : name;
}

// Construit un chemin (relatif à HOME) pour un nom + un emplacement déduit du texte.
function parseItemPath(name, text) {
  const clean = cleanName(name);
  const base = parseLocation(text);
  return base ? `${base}/${clean}` : clean;
}

// Extrait la cible à supprimer (nom + emplacement) depuis une commande naturelle.
function parseDeletePath(text) {
  let name = null;
  // "... dossier/fichier X" ou "... nomme X"
  let mm = text.match(/\b(?:dossier|repertoire|folder|fichier)\s+(?:nomm\w*\s+|appel\w*\s+)?["']?([a-z0-9][a-z0-9_.-]*)["']?/i);
  if (!mm) mm = text.match(/\b(?:nom\w*|appel\w*|intitul\w*)\s+(?:de\s+|du\s+|le\s+|la\s+)?["']?([a-z0-9][a-z0-9 _.-]*?)["']?\s*$/i);
  if (mm) name = mm[1].trim();
  if (!name) {
    const tokens = text.match(/[a-z0-9_.-]{2,}/gi) || [];
    name = tokens[tokens.length - 1] || '';
  }
  name = cleanName(name);
  const base = parseLocation(text);
  return base ? `${base}/${name}` : name;
}

export async function routeCommand(text, ctx = {}) {
  ctx.broadcast?.({ type: 'state', state: 'thinking' });

  const normalized = stripAccents(text);

  // 1) Règles bureau locales (rapides, hors-ligne)
  for (const rule of DESKTOP_RULES) {
    const match = normalized.match(rule.re);
    if (match) {
      const { action, params } = rule.map(match, normalized);
      const result = await runDesktopAction(action, params ?? {});
      recordInteraction({ input: text, response: result.message, intent: action });
      ctx.broadcast?.({ type: 'state', state: 'idle' });
      return { source: 'desktop', intent: action, response: result.message, data: result.data };
    }
  }

  // 2) Délégation à la couche IA
  try {
    const ai = await askAI(text);
    recordInteraction({ input: text, response: ai.response, intent: ai.intent });
    ctx.broadcast?.({ type: 'state', state: 'idle' });
    return { source: 'ai', intent: ai.intent, response: ai.response };
  } catch (err) {
    ctx.broadcast?.({ type: 'state', state: 'error' });
    const fallback = "La couche IA est indisponible. Vérifiez que le service Python (port 8000) est lancé.";
    recordInteraction({ input: text, response: fallback, intent: 'error' });
    return { source: 'error', intent: 'error', response: fallback };
  }
}
