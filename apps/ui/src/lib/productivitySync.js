function stripCommandPrefix(raw) {
  let out = String(raw || '').replace(/[’`]/g, "'").trim();
  if (!out) return out;

  const patterns = [
    /^\s*(?:please\s+|svp\s+)?(?:add|ajoute\w*|create|cr[ée]e\w*|new|nouveau|nouvelle|note|mets?|put|insert)\b[:\s-]*/i,
    /^\s*(?:please\s+|svp\s+)?(?:modify\w*|modif\w*|change\w*|update|rename|renomm\w*|edit\w*|replace|remplace\w*)\b[:\s-]*/i,
    /^\s*(?:please\s+|svp\s+)?(?:delete|remove|suppr\w*|supp\b|supprime\w*|retire\w*|efface\w*)\b[:\s-]*/i,
    /^\s*(?:task|tasks|t[âa]che|todo|to-?do|project|projects|projet|rdv|rendez-?vous|meeting|event|reminder|rappel)s?\b[:\s-]*/i,
    /^\s*(?:named|name|with\s+name|avec\s+le\s+nom|nomm?[ée]?|nom)\b[:\s-]*/i,
    /^\s*(?:je\s+vais\s+)?t[âa]che\s+/i,
    /^\s*(?:ais|j'ai|j'ais)\s+t[âa]che\s+/i,
  ];

  for (let i = 0; i < 4; i++) {
    const before = out;
    for (const re of patterns) out = out.replace(re, '');
    out = out.replace(/^\s*(?:de|du|des|la|le|les|un|une|the|a|an)\b\s*/i, '');
    out = out.replace(/\s+/g, ' ').replace(/^[\s\-:,.]+|[\s\-:,.]+$/g, '');
    if (out === before) break;
  }

  return out || String(raw || '').trim();
}

function parseDateTime(raw) {
  const dm = raw.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  const tm = raw.match(/(\d{1,2})\s*[:hH. ]\s*(\d{2})/);

  const d = new Date();
  d.setSeconds(0, 0);

  if (dm) {
    const day = parseInt(dm[1], 10);
    const month = parseInt(dm[2], 10) - 1;
    let year = dm[3] ? parseInt(dm[3], 10) : d.getFullYear();
    if (year < 100) year += 2000;
    d.setFullYear(year, month, day);
  }

  if (tm) {
    const h = Math.min(23, parseInt(tm[1], 10));
    const m = Math.min(59, parseInt(tm[2], 10));
    d.setHours(h, m, 0, 0);
  } else {
    d.setHours(9, 0, 0, 0);
  }

  if (!dm && d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);

  let label = raw;
  if (dm) label = label.replace(dm[0], '');
  if (tm) label = label.replace(tm[0], '');

  label = label
    .replace(/[’`]/g, "'")
    .replace(/^(j'ai|jai|j')\s+(?:un[e]?\s+)?/i, '')
    .replace(/(?:^|\s+)(?:le|la|les|du|des|au|aux|à|a|de|vers|pour|sur|par)(?=\s|$)/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim() || 'Rendez-vous';

  return { label, at: d.toISOString() };
}

function ensureShape(data) {
  return {
    tasks: Array.isArray(data?.tasks) ? data.tasks : [],
    reminders: Array.isArray(data?.reminders) ? data.reminders : [],
    agenda: Array.isArray(data?.agenda) ? data.agenda : [],
    pomodoro: Array.isArray(data?.pomodoro) ? data.pomodoro : [],
    projects: Array.isArray(data?.projects) ? data.projects : [],
  };
}

function findMatch(list, query) {
  if (!Array.isArray(list) || !list.length) return -1;
  const q = String(query || '').toLowerCase().trim();
  if (!q) return list.length - 1;
  const words = q.split(/\s+/).filter(Boolean);
  let best = -1;
  let bestScore = 0;

  list.forEach((it, i) => {
    const hay = `${it?.text || ''} ${it?.label || ''}`.toLowerCase();
    const score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });

  return bestScore > 0 ? best : -1;
}

function addLinked(items, target, text) {
  const cleanedText = stripCommandPrefix(text);
  const base = {
    id: crypto?.randomUUID?.() ?? String(Date.now()),
    createdAt: new Date().toISOString(),
  };

  if (target === 'tasks' || target === 'agenda' || target === 'reminders') {
    const { label, at } = parseDateTime(cleanedText);
    items.tasks.push({ ...base, text: cleanedText });
    items.agenda.push({ ...base, label, at });
    items.reminders.push({ ...base, label, at, alarmed: false });
    return true;
  }

  if (target === 'projects') {
    items.projects.push({ ...base, text: cleanedText });
    return true;
  }

  return false;
}

function deleteLinked(items, target, query) {
  const list = items[target] || [];
  const idx = findMatch(list, query);
  if (idx < 0) return false;
  const removed = list[idx];

  if (target === 'tasks' || target === 'agenda' || target === 'reminders') {
    const id = removed?.id;
    items.tasks = items.tasks.filter((it) => it.id !== id);
    items.agenda = items.agenda.filter((it) => it.id !== id);
    items.reminders = items.reminders.filter((it) => it.id !== id);
    return true;
  }

  items[target] = list.filter((_, i) => i !== idx);
  return true;
}

function updateLinked(items, target, query, newText) {
  const list = items[target] || [];
  const idx = findMatch(list, query);
  if (idx < 0) return false;
  const old = list[idx];
  const id = old?.id;
  const cleanedNewText = stripCommandPrefix(newText);

  if (target === 'tasks' || target === 'agenda' || target === 'reminders') {
    const { label, at } = parseDateTime(cleanedNewText);
    items.tasks = items.tasks.map((it) => (it.id === id ? { ...it, text: cleanedNewText } : it));
    items.agenda = items.agenda.map((it) => (it.id === id ? { ...it, label, at } : it));
    items.reminders = items.reminders.map((it) => (it.id === id ? { ...it, label, at, alarmed: false } : it));
    return true;
  }

  items[target] = list.map((it, i) => (i === idx ? { ...it, text: cleanedNewText } : it));
  return true;
}

function detectTarget(text, defaultTarget = 'tasks') {
  const t = String(text || '').toLowerCase();
  if (/\b(rappel|reminder|alarm|alarme)\b/.test(t)) return 'reminders';
  if (/\b(rdv|rendez-?vous|r[ée]union|agenda|calendrier|meeting|event)\b/.test(t)) return 'agenda';
  if (/\b(projet|project)\b/.test(t)) return 'projects';
  if (/\b(t[âa]che|task|todo|to-?do|liste)\b/.test(t)) return 'tasks';
  return defaultTarget;
}

function splitUpdateText(cleaned) {
  const primary = cleaned.split(/\s+(?:en|par|to|vers|->|:)\s+/i);
  if (primary.length >= 2) {
    return { query: primary[0].trim(), content: primary.slice(1).join(' ').trim() };
  }

  // English fallback: "update X with Y"
  const withParts = cleaned.split(/\s+with\s+/i);
  if (withParts.length >= 2) {
    return { query: withParts[0].trim(), content: withParts.slice(1).join(' ').trim() };
  }

  return { query: '', content: cleaned };
}

export function classifyIntentLocal(rawText, defaultTarget = 'tasks') {
  const text = String(rawText || '').trim();
  const lowered = text.toLowerCase();

  let action = 'add';
  if (/\b(modif\w*|modify\w*|change\w*|update\w*|rename\w*|renomm\w*|remplace\w*|edit\w*)\b/.test(lowered)) {
    action = 'update';
  } else if (/\b(delete|remove|suppr\w*|supp\b|supprime\w*|retire\w*|efface\w*|annule\w*|termine\w*|finis\w*|complete\w*|done)\b/.test(lowered)) {
    action = 'delete';
  } else if (/\b(ajout\w*|ajoute\w*|add\w*|create\w*|cr[ée]e\w*|new|nouveau|nouvelle|note\w*|mets?)\b/.test(lowered)) {
    action = 'add';
  }

  const target = detectTarget(lowered, defaultTarget);
  const cleaned = stripCommandPrefix(text);

  if (action === 'update') {
    const { query, content } = splitUpdateText(cleaned);
    return { action: 'update', target, query, content };
  }

  if (action === 'delete') {
    return { action: 'delete', target, query: cleaned || text, content: '' };
  }

  return { action: 'add', target, query: '', content: cleaned || text };
}

export function applyIntentToProductivity(currentItems, intent, rawText, defaultTarget = 'tasks') {
  const items = ensureShape(currentItems);
  const action = intent?.action || 'add';
  const target = intent?.target || defaultTarget;
  const query = intent?.query || '';
  const content = intent?.content || rawText;

  if (!['tasks', 'agenda', 'reminders', 'projects'].includes(target)) {
    return { changed: false, items };
  }

  if (action === 'delete' || action === 'complete') {
    return { changed: deleteLinked(items, target, query || rawText), items };
  }

  if (action === 'update') {
    return { changed: updateLinked(items, target, query, content), items };
  }

  if (action === 'add') {
    return { changed: addLinked(items, target, content), items };
  }

  return { changed: false, items };
}

// Détecte si un texte est une commande de focus / pomodoro
// (« start focus one minute », « lance un focus de 25 min », « stop focus »…).
export function isFocusCommand(text) {
  return /\b(focus|pomodoro|concentration|deep\s*work)\b/i.test(String(text || ''));
}
