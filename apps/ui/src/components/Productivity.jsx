import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchProductivity, saveProductivity, classifyIntent } from '../lib/api';

const FEATURES = [
  { id: 'tasks',     label: 'Gérer tâches et to-do lists', icon: '✅', color: '#a855f7', placeholder: 'Écrire une tâche…' },
  { id: 'reminders', label: 'Rappels intelligents',        icon: '⏰', color: '#f59e0b', placeholder: "Ex : J'ai pause chaque jour à 13h…" },
  { id: 'agenda',    label: 'Agenda & réunions',           icon: '📅', color: '#3b82f6', placeholder: 'Ex : Réunion le 17/06/2026 à 15h20… ou « sport chaque semaine à 18h »' },
  { id: 'pomodoro',  label: 'Pomodoro & focus mode',       icon: '🍅', color: '#ef4444', placeholder: 'Démarrer une session focus…' },
  { id: 'projects',  label: 'Suivi de projets',            icon: '📊', color: '#22c55e', placeholder: 'Écrire un projet à suivre…' },
];

const ALARM_LEAD_MS = 10 * 60 * 1000; // 10 minutes avant
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// ----- Récurrence -----
// Détecte la fréquence + le nb d'occurrences générées à l'avance (horizon).
// daily a skipSundays:true -> on saute les dimanches (« tous les jours sauf dimanche »).
// Les abréviations sont acceptées : jr, jrs, tlj, sem, etc.
const RECURRENCE_RULES = [
  { freq: 'daily',   re: /\b(chaque\s+(?:jours?|jrs?|j)|tous\s+les\s+jours|quotidien(?:ne)?s?|tlj)\b/i,        label: 'tous les jours (sauf dim.)', count: 52, skipSundays: true },
  { freq: 'weekly',  re: /\b(chaque\s+(?:semaines?|sem)|toutes\s+les\s+semaines|hebdomadaire?s?)\b/i,           label: 'toutes les semaines',        count: 26 },
  { freq: 'monthly', re: /\b(chaque\s+mois|tous\s+les\s+mois|mensuel(?:le)?s?)\b/i,                          label: 'tous les mois',              count: 12 },
  { freq: 'yearly',  re: /\b(chaque\s+an(?:s|n[ée]e?s?)?|tous\s+les\s+ans|annuel(?:le)?s?)\b/i,             label: 'tous les ans',               count: 5 },
];

function parseRecurrence(raw) {
  for (const r of RECURRENCE_RULES) {
    const m = raw.match(r.re);
    if (m) return { freq: r.freq, matched: m[0], label: r.label, count: r.count, skipSundays: !!r.skipSundays };
  }
  return null;
}

// Décale une date selon la fréquence (n intervalles)
function addInterval(date, freq, n) {
  const d = new Date(date);
  if (freq === 'daily')        d.setDate(d.getDate() + n);
  else if (freq === 'weekly')  d.setDate(d.getDate() + n * 7);
  else if (freq === 'monthly') d.setMonth(d.getMonth() + n);
  else if (freq === 'yearly')  d.setFullYear(d.getFullYear() + n);
  return d;
}

// Construit toutes les occurrences à partir d'une 1ère date ISO.
// Pour le quotidien avec skipSundays, on ignore les dimanches (getDay() === 0).
function buildOccurrences(startISO, freq, count, opts = {}) {
  const out = [];
  const skipSundays = freq === 'daily' && opts.skipSundays;
  let i = 0;
  const guard = count * 3 + 30; // garde-fou anti-boucle infinie
  while (out.length < count && i < guard) {
    const d = addInterval(startISO, freq, i);
    i++;
    if (skipSundays && d.getDay() === 0) continue; // 0 = dimanche -> on saute
    out.push(d.toISOString());
  }
  return out;
}

// Extrait une DATE (JJ/MM/AAAA ou JJ/MM) + une HEURE (15.20 / 15:20 / 15h20) + une récurrence depuis le texte
function parseDateTime(raw) {
  const dm = raw.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/); // date
  const tm = raw.match(/(\d{1,2})\s*[:hH.]\s*(\d{2})/);         // heure
  const rec = parseRecurrence(raw);                            // récurrence

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
    d.setHours(Math.min(23, parseInt(tm[1], 10)), Math.min(59, parseInt(tm[2], 10)), 0, 0);
  } else {
    d.setHours(9, 0, 0, 0); // heure par défaut si non précisée
  }
  // Si aucune date donnée et l'heure est déjà passée -> demain
  // (sauf pour un événement récurrent : on démarre la série dès aujourd'hui)
  if (!dm && !rec && d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);

  // Nettoie le libellé (date, heure, mots de récurrence et petits mots)
  let label = raw;
  if (dm) label = label.replace(dm[0], '');
  if (tm) label = label.replace(tm[0], '');
  if (rec) label = label.replace(rec.matched, '');
  label = label.replace(/\b(le|à|a|vers|pour|du|j'ai|jai)\b\s*/gi, '').trim() || 'Rendez-vous';

  return { label, at: d.toISOString(), hasDate: !!dm, recurrence: rec };
}

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Construit la grille du mois (cases vides incluses, semaine commençant le lundi)
function buildCalendar(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Lundi = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function Productivity({ onSend }) {
  const [active, setActive] = useState('tasks');
  const [input, setInput] = useState('');
  const [items, setItems] = useState(() =>
    Object.fromEntries(FEATURES.map((f) => [f.id, []]))
  );
  const [sortDir, setSortDir] = useState('desc');
  const [now, setNow] = useState(Date.now());          // pour le compte à rebours
  const [ringingFor, setRingingFor] = useState(null);  // label du rappel qui sonne
  const [feedback, setFeedback] = useState(null);      // retour visuel (ajout/suppression compris)
  const [calMonth, setCalMonth] = useState(() => {     // mois affiché dans l'agenda
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  });

  const inputRef = useRef(null);
  const audioCtxRef = useRef(null);
  const remindersRef = useRef(items.reminders);

  const feature = FEATURES.find((f) => f.id === active) ?? FEATURES[0];

  useEffect(() => { remindersRef.current = items.reminders; }, [items.reminders]);
  useEffect(() => { inputRef.current?.focus(); }, [active]);

  // ----- Persistance en base (chargement au démarrage) -----
  const loadedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    fetchProductivity()
      .then((saved) => {
        if (cancelled || !saved || typeof saved !== 'object') return;
        setItems((prev) => {
          const merged = { ...prev };
          for (const f of FEATURES) {
            if (Array.isArray(saved[f.id])) merged[f.id] = saved[f.id];
          }
          return merged;
        });
      })
      .catch(() => { /* orchestrateur indisponible : on reste en mémoire */ })
      .finally(() => { loadedRef.current = true; });
    return () => { cancelled = true; };
  }, []);

  // ----- Persistance en base (sauvegarde automatique, anti-rebond) -----
  useEffect(() => {
    if (!loadedRef.current) return; // n'écrase pas la base avant le 1er chargement
    const id = setTimeout(() => {
      saveProductivity(items).catch(() => { /* réessaie au prochain changement */ });
    }, 400);
    return () => clearTimeout(id);
  }, [items]);

  // Précharge les voix de synthèse vocale
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, []);

  // ----- Audio -----
  const unlockAudio = () => {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtxRef.current = new AC();
    }
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
  };

  const speakReminder = (label) => {
    if (!('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(`${label} !! `.repeat(3));
    u.lang = 'fr-FR';
    u.rate = 1;
    u.pitch = 1.1;
    u.volume = 1;
    const frVoice = synth.getVoices().find((v) => v.lang.startsWith('fr'));
    if (frVoice) u.voice = frVoice;
    synth.speak(u);
  };

  const playAlarm = (label) => {
    setRingingFor(label);
    setTimeout(() => speakReminder(label), 700);
    const ctx = audioCtxRef.current;
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      let count = 0;
      const beep = () => {
        if (count >= 2) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = count % 2 === 0 ? 880 : 660;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
        count++;
        setTimeout(beep, 300);
      };
      beep();
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🔔 Rappel dans 10 min', { body: label });
    }
    setTimeout(() => setRingingFor(null), 8000);
  };

  // ----- Timer : tic + alarmes -----
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const due = remindersRef.current.filter(
        (r) => r.at && !r.alarmed &&
               t >= new Date(r.at).getTime() - ALARM_LEAD_MS &&
               t <= new Date(r.at).getTime()
      );
      if (due.length > 0) {
        playAlarm(due[0].label);
        setItems((prev) => ({
          ...prev,
          reminders: prev.reminders.map((r) =>
            due.some((d) => d.id === r.id) ? { ...r, alarmed: true } : r
          ),
        }));
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Ajoute un élément dans la bonne liste (gère agenda/rappels + récurrence).
  const addToTarget = (target, text) => {
    const base = { id: crypto?.randomUUID?.() ?? String(Date.now()), createdAt: new Date().toISOString() };

    if (target === 'reminders' || target === 'agenda') {
      // Un rendez-vous va dans l'AGENDA *et* dans les RAPPELS (même id pour les lier)
      const { label, at, recurrence } = parseDateTime(text);
      if (Notification?.permission === 'default') Notification.requestPermission();

      if (recurrence) {
        // Événement récurrent : on génère toutes les occurrences à l'avance
        const occ = buildOccurrences(at, recurrence.freq, recurrence.count, { skipSundays: recurrence.skipSundays });
        const recId = base.id;
        const meta = { recId, recFreq: recurrence.freq, recLabel: recurrence.label };

        const agendaItems = occ.map((iso, i) => ({
          id: `${recId}-${i}`, createdAt: base.createdAt, label, at: iso, ...meta,
        }));
        const reminderItems2 = occ.map((iso, i) => ({
          id: `${recId}-${i}`, createdAt: base.createdAt, label, at: iso, alarmed: false, ...meta,
        }));

        setItems((prev) => ({
          ...prev,
          agenda:    [...prev.agenda,    ...agendaItems],
          reminders: [...prev.reminders, ...reminderItems2],
        }));
      } else {
        // Événement unique
        setItems((prev) => ({
          ...prev,
          agenda:    [...prev.agenda,    { ...base, label, at }],
          reminders: [...prev.reminders, { ...base, label, at, alarmed: false }],
        }));
      }

      // Affiche le mois du 1er rendez-vous dans le calendrier
      const evDate = new Date(at);
      setCalMonth(new Date(evDate.getFullYear(), evDate.getMonth(), 1));
      return label;
    }

    setItems((prev) => ({ ...prev, [target]: [...prev[target], { ...base, text }] }));
    return text;
  };

  // Cherche l'élément le plus pertinent dans une liste à partir d'une requête.
  // Renvoie l'index ou -1. Sans requête : dernier élément ajouté.
  const findMatch = (list, query) => {
    if (!list.length) return -1;
    const q = (query || '').toLowerCase().trim();
    if (!q) return list.length - 1;
    const words = q.split(/\s+/).filter(Boolean);
    let best = -1, bestScore = 0;
    list.forEach((it, i) => {
      const hay = `${it.text || ''} ${it.label || ''}`.toLowerCase();
      const score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
      if (score > bestScore) { bestScore = score; best = i; }
    });
    return bestScore > 0 ? best : -1;
  };

  // Supprime un élément (par requête) dans la bonne liste.
  const deleteFromTarget = (target, query) => {
    let removedLabel = null;
    setItems((prev) => {
      const list = prev[target] || [];
      const idx = findMatch(list, query);
      if (idx < 0) return prev;
      const removed = list[idx];
      removedLabel = removed.text || removed.label || 'élément';
      if (target === 'agenda' || target === 'reminders') {
        return {
          ...prev,
          agenda: prev.agenda.filter((it) => it.id !== removed.id),
          reminders: prev.reminders.filter((it) => it.id !== removed.id),
        };
      }
      return { ...prev, [target]: list.filter((_, i) => i !== idx) };
    });
    return removedLabel;
  };

  const submit = async (e) => {
    e.preventDefault();
    unlockAudio();
    const text = input.trim();
    if (!text) return;
    setInput('');

    // Compréhension d'intention (Gemini → OpenAI → repli local par règles).
    let intent = null;
    try {
      intent = await classifyIntent(text, active);
    } catch {
      intent = null; // couche IA indisponible : on ajoute par défaut
    }

    const validTarget = (t) => FEATURES.some((f) => f.id === t);
    const action = intent?.action || 'add';
    const target = intent?.target && validTarget(intent.target) ? intent.target : active;
    const tLabel = FEATURES.find((f) => f.id === target)?.label.toLowerCase() ?? target;

    if (action === 'delete' || action === 'complete') {
      const removed = deleteFromTarget(target, intent?.query || text);
      setFeedback(removed
        ? { kind: 'del', msg: `🗑 « ${removed} » supprimé de ${tLabel}` }
        : { kind: 'warn', msg: `Aucun élément trouvé à supprimer dans ${tLabel}` });
    } else if (action === 'list') {
      setActive(target);
      setFeedback({ kind: 'info', msg: `Voici ${tLabel}` });
    } else {
      const added = addToTarget(target, intent?.content || text);
      setFeedback({ kind: 'add', msg: `✓ « ${added} » ajouté à ${tLabel}` });
    }

    onSend?.(text);
    inputRef.current?.focus();
  };

  // Supprime UNE occurrence dans l'agenda ET les rappels (éléments liés)
  const removeEvent = (id) =>
    setItems((prev) => ({
      ...prev,
      agenda: prev.agenda.filter((it) => it.id !== id),
      reminders: prev.reminders.filter((it) => it.id !== id),
    }));

  // Supprime TOUTE une série récurrente (agenda + rappels)
  const removeSeries = (recId) =>
    setItems((prev) => ({
      ...prev,
      agenda: prev.agenda.filter((it) => it.recId !== recId),
      reminders: prev.reminders.filter((it) => it.recId !== recId),
    }));

  const removeItem = (id) =>
    setItems((prev) => ({ ...prev, [active]: prev[active].filter((it) => it.id !== id) }));

  // Efface le retour visuel après quelques secondes
  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), 3500);
    return () => clearTimeout(id);
  }, [feedback]);

  // Listes triées
  const genericItems = [...items[active]].sort((a, b) => {
    const cmp = (a.text || '').localeCompare(b.text || '', 'fr', { sensitivity: 'base' });
    return sortDir === 'asc' ? cmp : -cmp;
  });
  const reminderItems = [...items.reminders].sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
  const eventsForDay = (date) =>
    items.agenda
      .filter((e) => e.at && sameDay(new Date(e.at), date))
      .sort((a, b) => new Date(a.at) - new Date(b.at));

  // Formatage
  const fmtDate = (iso) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const fmtDay  = (iso) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const countdown = (iso) => {
    const diff = new Date(iso).getTime() - now;
    if (diff <= 0) return 'maintenant';
    const min = Math.floor(diff / 60000);
    const h = Math.floor(min / 60);
    const mm = min % 60;
    return h > 0 ? `dans ${h}h${String(mm).padStart(2, '0')}` : `dans ${min} min`;
  };

  const headerCount = active === 'reminders' ? reminderItems.length
    : active === 'agenda' ? items.agenda.length
    : genericItems.length;

  return (
    <div className="flex h-full flex-col">
      {/* Bandeau d'alarme */}
      <AnimatePresence>
        {ringingFor && (
          <motion.div
            initial={ { opacity: 0, y: -8 } }
            animate={ { opacity: 1, y: 0 } }
            exit={ { opacity: 0, y: -8 } }
            className="mb-4 flex items-center gap-3 rounded-xl bg-amber-500/15 px-4 py-3 ring-1 ring-amber-400/40"
          >
            <span className="text-xl">🔔</span>
            <span className="text-sm text-amber-200">
              Rappel : <strong>{ringingFor}</strong> dans 10 minutes !
            </span>
            <button onClick={() => { window.speechSynthesis?.cancel(); setRingingFor(null); }} className="ml-auto rounded-md px-2 py-1 text-amber-200/70 hover:bg-white/5">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Retour visuel de la compréhension (ajout / suppression) */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={ { opacity: 0, y: -8 } }
            animate={ { opacity: 1, y: 0 } }
            exit={ { opacity: 0, y: -8 } }
            className={
              'mb-4 flex items-center gap-3 rounded-xl px-4 py-3 text-sm ring-1 ' +
              (feedback.kind === 'add' ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/40'
                : feedback.kind === 'del' ? 'bg-rose-500/15 text-rose-200 ring-rose-400/40'
                : feedback.kind === 'warn' ? 'bg-amber-500/15 text-amber-200 ring-amber-400/40'
                : 'bg-sky-500/15 text-sky-200 ring-sky-400/40')
            }
          >
            <span>{feedback.msg}</span>
            <button onClick={() => setFeedback(null)} className="ml-auto rounded-md px-2 py-1 opacity-70 hover:bg-white/5">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* En-tête */}
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ring-1 ring-white/10" style={ { background: '#a855f722', color: '#a855f7' } }>📅</div>
        <div>
          <h1 className="text-xl font-semibold text-white">Productivité</h1>
          <p className="text-sm text-gray-400">Organisez, planifiez et restez focus.</p>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* Colonne gauche : boutons */}
        <div className="flex flex-col gap-2 rounded-2xl bg-surface-800/60 p-4 ring-1 ring-white/5">
          <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wider text-brand">Fonctions</p>
          {FEATURES.map((f) => (
            <button
              key={f.id}
              onClick={() => { setActive(f.id); setInput(''); }}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                active === f.id ? 'bg-brand/15 text-white ring-1 ring-brand/40' : 'text-gray-400 hover:bg-white/5'
              }`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ring-1 ring-white/10" style={{ background: `${f.color}22`, color: f.color }}>{f.icon}</span>
              <span className="font-medium">{f.label}</span>
              {items[f.id].length > 0 && (
                <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-xs text-gray-300">{items[f.id].length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Colonne droite */}
        <div className="flex min-h-0 flex-col rounded-2xl bg-surface-800/60 ring-1 ring-white/5">
          <div className="flex items-center gap-3 border-b border-white/5 p-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg text-base ring-1 ring-white/10" style={{ background: `${feature.color}22`, color: feature.color }}>{feature.icon}</span>
            <h2 className="text-base font-semibold text-white">{feature.label}</h2>
            <span className="ml-auto text-xs text-gray-500">{headerCount} élément(s)</span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            {/* ---- VUE AGENDA (calendrier) ---- */}
            {active === 'agenda' ? (
              <div className="flex h-full flex-col gap-3">
                {/* Navigation mois */}
                <div className="flex items-center justify-between">
                  <button onClick={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="rounded-lg px-3 py-1.5 text-sm text-gray-400 ring-1 ring-white/10 hover:bg-white/5">‹ Préc.</button>
                  <h3 className="text-sm font-semibold capitalize text-white">{calMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</h3>
                  <button onClick={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="rounded-lg px-3 py-1.5 text-sm text-gray-400 ring-1 ring-white/10 hover:bg-white/5">Suiv. ›</button>
                </div>
                {/* En-têtes jours */}
                <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-500">
                  {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
                </div>
                {/* Grille du mois */}
                <div className="grid grid-cols-7 gap-1">
                  {buildCalendar(calMonth).map((date, i) => {
                    if (!date) return <div key={i} className="min-h-[76px] rounded-lg" />;
                    const evs = eventsForDay(date);
                    const isToday = sameDay(date, new Date());
                    const isSunday = date.getDay() === 0;
                    return (
                      <div key={i} className={`min-h-[76px] rounded-lg p-1.5 ring-1 ${isToday ? 'bg-brand/10 ring-brand/40' : isSunday ? 'bg-surface-900/20 ring-white/5' : 'bg-surface-900/40 ring-white/5'}`}>
                        <div className={`mb-1 text-xs ${isToday ? 'font-bold text-brand' : isSunday ? 'text-gray-600' : 'text-gray-500'}`}>{date.getDate()}</div>
                        <div className="flex flex-col gap-1">
                          {evs.map((e) => (
                            <div key={e.id} title={`${fmtTime(e.at)} — ${e.label}${e.recLabel ? ` (🔁 ${e.recLabel})` : ''}`} onClick={() => removeEvent(e.id)}
                                 className="cursor-pointer truncate rounded bg-brand/20 px-1.5 py-0.5 text-[10px] text-white hover:bg-red-500/30">
                              {e.recId ? '🔁 ' : ''}{fmtTime(e.at)} {e.label}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-600">Astuce : tape « pause chaque jour à 13h » (ou « chaque jrs ») pour remplir tout le mois automatiquement, sauf les dimanches. Clique sur un rendez-vous pour supprimer cette occurrence.</p>
              </div>
            /* ---- VUE RAPPELS ---- */
            ) : active === 'reminders' ? (
              reminderItems.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-600">Aucun rappel pour le moment.</div>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                      <th className="px-3 py-2">Rendez-vous</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Heure</th>
                      <th className="px-3 py-2">Alarme</th>
                      <th className="w-24 px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {reminderItems.map((r) => (
                      <tr key={r.id} className="border-t border-white/5 hover:bg-white/5">
                        <td className="px-3 py-2 text-white">
                          {r.recId && <span title={`Répété ${r.recLabel}`} className="mr-1">🔁</span>}
                          {r.label}
                        </td>
                        <td className="px-3 py-2 text-gray-400">{r.at ? fmtDay(r.at) : '—'}</td>
                        <td className="px-3 py-2 text-gray-200">{r.at ? fmtTime(r.at) : '—'}</td>
                        <td className="px-3 py-2">
                          {!r.at ? <span className="text-gray-600">aucune heure détectée</span>
                            : r.alarmed ? <span className="text-amber-400">🔔 sonnée</span>
                            : <span className="text-gray-400">{countdown(r.at)} <span className="text-gray-600">(alarme 10 min avant)</span></span>}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button onClick={() => { unlockAudio(); playAlarm(r.label); }} title="Tester la voix" className="mr-1 rounded-md px-2 py-1 text-gray-500 transition hover:bg-white/5 hover:text-brand">🔊</button>
                          <button onClick={() => removeEvent(r.id)} title="Supprimer cette occurrence" className="rounded-md px-2 py-1 text-gray-500 transition hover:bg-red-500/10 hover:text-red-400">✕</button>
                          {r.recId && (
                            <button onClick={() => removeSeries(r.recId)} title="Supprimer toute la série" className="ml-1 rounded-md px-2 py-1 text-gray-500 transition hover:bg-red-500/10 hover:text-red-400">🗑️</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            /* ---- VUE GÉNÉRIQUE (tâches, pomodoro, projets) ---- */
            ) : (
              genericItems.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-600">Aucun élément pour le moment.</div>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                      <th className="w-10 px-3 py-2">#</th>
                      <th className="cursor-pointer select-none px-3 py-2 hover:text-brand" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
                        Contenu {sortDir === 'asc' ? '▲' : '▼'}
                      </th>
                      <th className="px-3 py-2">Ajouté le</th>
                      <th className="w-10 px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {genericItems.map((it, i) => (
                      <tr key={it.id} className="border-t border-white/5 hover:bg-white/5">
                        <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                        <td className="px-3 py-2 text-white">{it.text}</td>
                        <td className="px-3 py-2 text-gray-400">{fmtDate(it.createdAt)}</td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => removeItem(it.id)} className="rounded-md px-2 py-1 text-gray-500 transition hover:bg-red-500/10 hover:text-red-400">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>

          {/* Saisie + Envoyer */}
          <form onSubmit={submit} className="flex shrink-0 gap-3 border-t border-white/5 p-4">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={feature.placeholder}
              className="flex-1 rounded-xl bg-surface-900 px-4 py-3 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-brand"
              style={ { caretColor: '#6366f1' } }
            />
            <button type="submit" className="rounded-xl bg-brand px-5 py-3 text-sm font-medium text-white transition hover:bg-brand-dark">Envoyer</button>
          </form>
        </div>
      </div>
    </div>
  );
}
