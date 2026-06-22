import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchProductivity, saveProductivity, classifyIntent, transcribeAudio } from '../lib/api';

// ===== Hook personnalisé : Saisie vocale via enregistrement audio + STT serveur =====
// Web Speech API ne fonctionne pas dans Electron (pas de service Google embarqué).
// On enregistre donc l'audio avec MediaRecorder puis on l'envoie à la couche IA
// (Gemini / Whisper) qui renvoie la transcription.
function useSpeechRecognition(onFinalTranscript) {
  const [isListening, setIsListening] = useState(false);   // enregistrement en cours
  const [isProcessing, setIsProcessing] = useState(false); // transcription en cours
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  // Référence STABLE vers le callback pour éviter les fermetures périmées.
  const callbackRef = useRef(onFinalTranscript);
  useEffect(() => { callbackRef.current = onFinalTranscript; }, [onFinalTranscript]);

  const isSupported = typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof window !== 'undefined' && 'MediaRecorder' in window;

  // Libère le micro proprement.
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  // Nettoyage au démontage (évite les fuites micro).
  useEffect(() => () => releaseStream(), [releaseStream]);

  // Convertit un Blob en base64 (sans le préfixe data:).
  const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result || '';
      const base64 = String(result).split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const start = useCallback(async () => {
    if (!isSupported) {
      setError("Micro non supporté par cet environnement.");
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        releaseStream();

        if (blob.size === 0) { setIsProcessing(false); return; }

        setIsProcessing(true);
        try {
          const base64 = await blobToBase64(blob);
          const cleanMime = type.split(';')[0]; // "audio/webm;codecs=opus" → "audio/webm"
          const { text } = await transcribeAudio(base64, cleanMime);
          const transcript = (text || '').trim();
          if (!transcript || transcript.startsWith('[STT')) {
            setError("Transcription vide : configure la clé IA ou réessaie.");
          } else if (callbackRef.current) {
            callbackRef.current(transcript);
          }
        } catch (err) {
          console.error('Erreur transcription :', err);
          setError("Échec de la transcription (couche IA injoignable ?).");
        } finally {
          setIsProcessing(false);
        }
      };

      recorder.start();
      setIsListening(true);
    } catch (err) {
      console.error('Accès micro refusé :', err);
      releaseStream();
      setIsListening(false);
      setError("Accès au micro refusé. Autorise le microphone.");
    }
  }, [isSupported, releaseStream]);

  const stop = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop(); // déclenche onstop → transcription
    }
    setIsListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else start();
  }, [isListening, start, stop]);

  return { isListening, isProcessing, interimTranscript: '', error, toggle, isSupported };
}

const FEATURES = [
  { id: 'tasks',     label: 'Gérer tâches et to-do lists', icon: '✅', color: '#a855f7', placeholder: 'Écrire une tâche…' },
  { id: 'reminders', label: 'Rappels intelligents',        icon: '⏰', color: '#f59e0b', placeholder: "Ex : J'ai pause chaque jour à 13h…" },
  { id: 'agenda',    label: 'Agenda & réunions',           icon: '📅', color: '#3b82f6', placeholder: 'Ex : Réunion le 17/06/2026 à 15h20… ou « sport chaque semaine à 18h »' },
  { id: 'pomodoro',  label: 'Pomodoro & focus mode',       icon: '🍅', color: '#ef4444', placeholder: 'Ex : démarrer un focus de 50 min…' },
  { id: 'projects',  label: 'Suivi de projets',            icon: '📊', color: '#22c55e', placeholder: 'Écrire un projet à suivre…' },
];

const ALARM_LEAD_MS = 10 * 60 * 1000; // 10 minutes avant
const REMINDER_KEEP_MS = 60 * 1000;   // on garde un rappel 1 min après son heure, puis suppression auto
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
  const tm = raw.match(/(\d{1,2})\s*[:hH.]\s*(\d{2})/);         // heure avec minutes (15:20, 15h20…)
  // Heure SEULE suivie de am/pm ou de « h » : « 4 pm », « 16h », « 9 heures »
  const hourOnly = !tm ? raw.match(/(?<![\d:])(\d{1,2})\s*(?:h\b|heures?\b|(?=\s*[ap]\.?\s*m\.?\b))/i) : null;
  // Marqueur AM / PM (anglais) — gère « pm », « p.m. », « p m »
  const mer = raw.match(/\b([ap])\.?\s*m\.?\b/i);
  // Moment de la journée en français
  const frPM = /\b(apr[èe]s[- ]?midi|soir|du soir)\b/i.test(raw);
  const frAM = /\b(matin|du matin)\b/i.test(raw);
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
  // Détermine l'heure (en gérant AM/PM)
  let hours = null, minutes = 0;
  if (tm) { hours = parseInt(tm[1], 10); minutes = parseInt(tm[2], 10); }
  else if (hourOnly) { hours = parseInt(hourOnly[1], 10); minutes = 0; }
  if (hours !== null) {
    const isPM = (mer && mer[1].toLowerCase() === 'p') || frPM;
    const isAM = (mer && mer[1].toLowerCase() === 'a') || frAM;
    if (isPM && hours < 12) hours += 12; // 4 pm -> 16h
    if (isAM && hours === 12) hours = 0; // 12 am -> 00h
    d.setHours(Math.min(23, hours), Math.min(59, minutes), 0, 0);
  } else {
    d.setHours(9, 0, 0, 0); // heure par défaut si non précisée
  }
  // Si aucune date donnée et l'heure est déjà passée -> demain
  // (sauf pour un événement récurrent : on démarre la série dès aujourd'hui)
  if (!dm && !rec && d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);

  // Nettoie le libellé (date, heure, am/pm, mots de récurrence et mots parasites)
  let label = raw;
  if (dm) label = label.replace(dm[0], '');
  if (tm) label = label.replace(tm[0], '');
  else if (hourOnly) label = label.replace(hourOnly[0], '');
  if (mer) label = label.replace(mer[0], '');
  if (rec) label = label.replace(rec.matched, '');

  // 1. Normalise les apostrophes : la voix peut envoyer ' (U+2019) au lieu de ' (U+0027)
  label = label.replace(/[''`]/g, "'");

  // 2. Retire l'introduction vocale en DÉBUT de phrase : "j'ai [un/une]"
  //    On garde les adjectifs ("petite", "grande"…) car ils font partie du libellé voulu.
  label = label.replace(/^(j'ai|jai|j')\s+(?:un[e]?\s+)?/i, '');

  // 3. Retire les prépositions/articles ORPHELINS restants (laissés par la suppression
  //    de la date ou de l'heure). On utilise \s au lieu de \b car \b ne fonctionne pas
  //    avec les caractères accentués (à, é…).
  label = label
    .replace(/(?:^|\s+)(?:le|la|les|du|des|au|aux|à|a|de|vers|pour|sur|par)(?=\s|$)/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim() || 'Rendez-vous';

  return { label, at: d.toISOString(), hasDate: !!dm, recurrence: rec };
}

// Extrait une DURÉE en minutes depuis un texte libre (tolère les fautes de frappe).
// Gère : "50min", "50 minutes", "50m", "1h30", "2h", "25", "une demi-heure"…
function parseDuration(raw) {
  const t = raw.toLowerCase();
  if (/\bdemi[- ]?heure\b/.test(t)) return 30;
  // "1h30", "1 h 30"
  const hm = t.match(/(\d{1,2})\s*h\s*(\d{1,2})/);
  if (hm) return parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);
  // "2h", "2 heures" (sans minutes derrière)
  const h = t.match(/(\d{1,2})\s*(?:h\b|heures?\b)/);
  if (h) return parseInt(h[1], 10) * 60;
  // "50 min", "50min", "50 minutes", "50m" (tolère "mindre", "minute", etc.)
  const m = t.match(/(\d{1,3})\s*m/);
  if (m) return parseInt(m[1], 10);
  // juste un nombre -> minutes
  const n = t.match(/\b(\d{1,3})\b/);
  if (n) return parseInt(n[1], 10);
  return 25; // défaut Pomodoro
}

// Nettoie le libellé d'une session focus (retire verbes, "focus", durée…)
function cleanFocusLabel(raw) {
  return raw
    .replace(/(\d{1,3})\s*(?:h\s*\d{0,2}|min(?:ute)?s?|m|heures?)/gi, '')
    .replace(/\b(d[ée]marr?e?r?|d[ée]mare?r?|lance?r?|commenc\w*|start|focus|mode|session|pomodoro|concentration|un|une|de|d'|pendant|pour)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
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
  const [pomo, setPomo] = useState(null);              // session focus : { label, totalMs, endsAt, paused, remainingMs }
  const [calMonth, setCalMonth] = useState(() => {     // mois affiché dans l'agenda
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  });
  const [selectedDay, setSelectedDay] = useState(null); // jour sélectionné dans le calendrier

  const inputRef = useRef(null);
  const audioCtxRef = useRef(null);
  const remindersRef = useRef(items.reminders);
  const pomoRef = useRef(null);

  // ===== Reconnaissance vocale (Web Speech API) =====
  // Callback : quand la reconnaissance vocale finalise, on remplit le champ input et on envoie
  const handleVoiceTranscript = async (transcript) => {
    const text = transcript.trim();
    if (text) {
      // Saisie vocale : ajout automatique dans l'agenda ET les rappels.
      await handleSubmitText(text, { forceAgenda: true });
    }
  };
  const { isListening, isProcessing, error: voiceError, toggle: toggleVoice, isSupported: voiceSupported } = useSpeechRecognition(handleVoiceTranscript);
  const feature = FEATURES.find((f) => f.id === active) ?? FEATURES[0];

  useEffect(() => { remindersRef.current = items.reminders; }, [items.reminders]);
  useEffect(() => { pomoRef.current = pomo; }, [pomo]);
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
    const u = new SpeechSynthesisUtterance(label);
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
      // Suppression automatique des anciens rappels (heure dépassée)
      const expired = remindersRef.current.filter(
        (r) => r.at && t > new Date(r.at).getTime() + REMINDER_KEEP_MS
      );
      if (expired.length > 0) {
        const expiredIds = new Set(expired.map((r) => r.id));
        setItems((prev) => ({
          ...prev,
          reminders: prev.reminders.filter((r) => !expiredIds.has(r.id)),
        }));
      }
      // Fin de session focus
      const p = pomoRef.current;
      if (p && !p.paused && t >= p.endsAt) {
        playAlarm(`Focus terminé : ${p.label}`);
        recordSession(p, 'done');
        setPomo(null);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ----- Mode Focus (Pomodoro) -----
  const startPomodoro = (text) => {
    unlockAudio();
    if (Notification?.permission === 'default') Notification.requestPermission();
    const min = Math.max(1, parseDuration(text));
    const totalMs = min * 60000;
    const label = cleanFocusLabel(text) || 'Focus';
    setPomo({ label, minutes: min, totalMs, startedAt: Date.now(), endsAt: Date.now() + totalMs, paused: false, remainingMs: totalMs });
    return `${label} — ${min} min`;
  };

  const togglePomo = () =>
    setPomo((p) => {
      if (!p) return p;
      return p.paused
        ? { ...p, paused: false, endsAt: Date.now() + p.remainingMs }
        : { ...p, paused: true, remainingMs: Math.max(0, p.endsAt - Date.now()) };
    });

  // Enregistre une session terminée dans l'historique (persisté).
  const recordSession = (p, status) => {
    if (!p) return;
    const elapsedMs = status === 'done'
      ? p.totalMs
      : Math.max(0, p.totalMs - (p.paused ? p.remainingMs : p.endsAt - Date.now()));
    const trackedMin = Math.max(0, Math.round(elapsedMs / 60000));
    const session = {
      id: crypto?.randomUUID?.() ?? String(Date.now()),
      label: p.label,
      minutes: p.minutes,
      trackedMin,
      status, // 'done' | 'stopped'
      createdAt: new Date(p.startedAt).toISOString(),
      endedAt: new Date().toISOString(),
    };
    setItems((prev) => ({ ...prev, pomodoro: [...prev.pomodoro, session] }));
  };

  const finishPomodoro = () => {
    const p = pomoRef.current;
    recordSession(p, 'done');
    setPomo(null);
  };

  const stopPomodoro = () => {
    const p = pomoRef.current;
    recordSession(p, 'stopped');
    setPomo(null);
  };

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
    const text = input.trim();
    if (!text) return;
    await handleSubmitText(text);
    setInput('');
    inputRef.current?.focus();
  };

  // Traite la soumission d'un texte (réutilisé par submit ET reconnaissance vocale)
  // opts.forceAgenda : pour la saisie VOCALE, tout ajout va automatiquement
  // dans l'agenda ET les rappels (liés), quelle que soit la classification.
  const handleSubmitText = async (text, opts = {}) => {
    unlockAudio();

    // Compréhension d'intention (Gemini → OpenAI → repli local par règles).
    let intent = null;
    try {
      intent = await classifyIntent(text, active);
    } catch {
      intent = null; // couche IA indisponible : on ajoute par défaut
    }

    const validTarget = (t) => FEATURES.some((f) => f.id === t);
    const action = intent?.action || 'add';
    let target = intent?.target && validTarget(intent.target) ? intent.target : active;

    // Saisie vocale : un simple ajout est routé vers l'agenda (→ agenda + rappel).
    // On respecte quand même les commandes vocales « arrête le focus », « supprime… ».
    if (opts.forceAgenda && action === 'add' && target !== 'pomodoro') {
      target = 'agenda';
    }

    const tLabel = FEATURES.find((f) => f.id === target)?.label.toLowerCase() ?? target;

    if (target === 'pomodoro') {
      if (action === 'delete' || action === 'complete') {
        stopPomodoro();
        setFeedback({ kind: 'del', msg: '⏹ Session focus arrêtée' });
      } else {
        const label = startPomodoro(intent?.content || text);
        setFeedback({ kind: 'add', msg: `🍅 Focus lancé : ${label}` });
      }
    } else if (action === 'delete' || action === 'complete') {
      const removed = deleteFromTarget(target, intent?.query || text);
      setFeedback(removed
        ? { kind: 'del', msg: `🗑 « ${removed} » supprimé de ${tLabel}` }
        : { kind: 'warn', msg: `Aucun élément trouvé à supprimer dans ${tLabel}` });
    } else if (action === 'list') {
      setActive(target);
      setFeedback({ kind: 'info', msg: `Voici ${tLabel}` });
    } else {
      const added = addToTarget(target, intent?.content || text);
      // Message dédié pour la voix : on précise agenda + rappel.
      setFeedback(opts.forceAgenda && target === 'agenda'
        ? { kind: 'add', msg: `✓ « ${added} » ajouté à l'agenda et aux rappels` }
        : { kind: 'add', msg: `✓ « ${added} » ajouté à ${tLabel}` });
    }

    onSend?.(text);
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

  // ----- Mode Focus : valeurs d'affichage -----
  const POMO_C = 2 * Math.PI * 45; // circonférence de l'anneau SVG
  const pomoRemaining = pomo ? Math.max(0, pomo.paused ? pomo.remainingMs : pomo.endsAt - now) : 0;
  const pomoElapsedFrac = pomo && pomo.totalMs ? 1 - pomoRemaining / pomo.totalMs : 0;
  const fmtClock = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  // Statistiques des sessions focus
  const pomoSessions = items.pomodoro || [];
  const pomoStats = {
    total: pomoSessions.length + (pomo ? 1 : 0),
    active: pomo ? 1 : 0,
    done: pomoSessions.filter((s) => s.status === 'done').length,
    tracked: pomoSessions.reduce((sum, s) => sum + (s.trackedMin || 0), 0),
  };

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
              <div className="flex flex-col gap-3">
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
                    const isSelected = selectedDay && sameDay(date, selectedDay);
                    return (
                      <div
                        key={i}
                        onClick={() => setSelectedDay(isSelected ? null : date)}
                        className={`min-h-[76px] cursor-pointer rounded-lg p-1.5 ring-1 transition-all ${
                          isSelected     ? 'bg-indigo-500/20 ring-indigo-400/60 shadow-lg' :
                          isToday        ? 'bg-brand/10 ring-brand/40' :
                          isSunday       ? 'bg-surface-900/20 ring-white/5' :
                          'bg-surface-900/40 ring-white/5 hover:bg-white/5'
                        }`}
                      >
                        <div className={`mb-1 text-xs font-semibold ${isSelected ? 'text-indigo-300' : isToday ? 'text-brand' : isSunday ? 'text-gray-600' : 'text-gray-500'}`}>
                          {date.getDate()}
                        </div>
                        <div className="flex flex-col gap-1">
                          {evs.slice(0, 2).map((e) => (
                            <div key={e.id}
                                 title={`${fmtTime(e.at)} — ${e.label}${e.recLabel ? ` (🔁 ${e.recLabel})` : ''}`}
                                 className="truncate rounded bg-brand/20 px-1.5 py-0.5 text-[10px] text-white">
                              {e.recId ? '🔁 ' : ''}{fmtTime(e.at)} {e.label}
                            </div>
                          ))}
                          {evs.length > 2 && (
                            <div className="px-1 text-[10px] text-gray-500">+{evs.length - 2} autres</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ---- PANNEAU DÉTAIL DU JOUR SÉLECTIONNÉ ---- */}
                <AnimatePresence>
                  {selectedDay && (() => {
                    const dayEvs  = eventsForDay(selectedDay);
                    // Uniquement les tâches créées CE jour précis (pas toutes les tâches)
                    const dayTasks = items.tasks.filter(
                      (t) => t.createdAt && sameDay(new Date(t.createdAt), selectedDay)
                    );
                    const dayLabel = selectedDay.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                    return (
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 12 }}
                        className="rounded-xl bg-surface-800 ring-1 ring-white/10 p-4"
                      >
                        {/* En-tête */}
                        <div className="mb-3 flex items-center justify-between">
                          <h4 className="text-sm font-semibold capitalize text-white">📅 {dayLabel}</h4>
                          <button onClick={() => setSelectedDay(null)} className="text-gray-500 hover:text-white">✕</button>
                        </div>

                        {/* Événements du jour */}
                        {dayEvs.length > 0 ? (
                          <div className="mb-3">
                            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">Agenda</p>
                            <div className="flex flex-col gap-1.5">
                              {dayEvs.map((e) => (
                                <div key={e.id} className="flex items-center justify-between rounded-lg bg-brand/10 px-3 py-2 ring-1 ring-brand/20">
                                  <div>
                                    <span className="text-sm text-white">{e.recId ? '🔁 ' : ''}{e.label}</span>
                                    <span className="ml-2 text-xs text-gray-400">{fmtTime(e.at)}</span>
                                    {e.recLabel && <span className="ml-1 text-xs text-indigo-400">({e.recLabel})</span>}
                                  </div>
                                  <button onClick={(ev) => { ev.stopPropagation(); removeEvent(e.id); }}
                                          className="ml-2 rounded px-2 py-1 text-gray-500 hover:bg-red-500/10 hover:text-red-400" title="Supprimer">✕</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="mb-3 text-sm text-gray-600">Aucun événement ce jour.</p>
                        )}

                        {/* Tâches en cours */}
                        {dayTasks.length > 0 && (
                          <div>
                            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">Tâches</p>
                            <div className="flex flex-col gap-1">
                              {dayTasks.map((t) => (
                                <div key={t.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5">
                                  <span className="text-xs text-purple-400">✅</span>
                                  <span className="text-sm text-gray-300">{t.text}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    );
                  })()}
                </AnimatePresence>

                <p className="text-xs text-gray-600">Clique sur un jour pour voir ses événements et tâches. Clique sur ✕ dans le détail pour supprimer un événement.</p>
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
            /* ---- VUE FOCUS MODE (Pomodoro) ---- */
            ) : active === 'pomodoro' ? (
              <div className="flex h-full flex-col gap-5">
                {/* Bandeau de stats */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-gray-300 ring-1 ring-white/10">Total : {pomoStats.total}</span>
                  <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300 ring-1 ring-sky-400/30">Actif : {pomoStats.active}</span>
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-400/30">Terminé : {pomoStats.done}</span>
                  <span className="ml-auto rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300 ring-1 ring-amber-400/30">{pomoStats.tracked} min cumulées</span>
                </div>

                {/* Zone centrale : anneau + timer */}
                <div className="flex flex-1 flex-col items-center justify-center gap-8">
                  {pomo ? (
                    <>
                      <div className="relative flex h-64 w-64 items-center justify-center">
                        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
                          <defs>
                            <linearGradient id="pomoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#22d3ee" />
                              <stop offset="100%" stopColor="#6366f1" />
                            </linearGradient>
                          </defs>
                          <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                          <circle
                            cx="50" cy="50" r="45" fill="none" stroke="url(#pomoGrad)" strokeWidth="6" strokeLinecap="round"
                            strokeDasharray={POMO_C}
                            strokeDashoffset={pomoElapsedFrac * POMO_C}
                            style={ { transition: 'stroke-dashoffset 1s linear', filter: 'drop-shadow(0 0 6px rgba(99,102,241,0.5))' } }
                          />
                        </svg>
                        <div className="text-center">
                          <div className="text-6xl font-bold tabular-nums tracking-tight text-white">{fmtClock(pomoRemaining)}</div>
                          <div className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
                            {pomo.paused ? '⏸ En pause' : '● En cours'} — {pomo.minutes}M
                          </div>
                          {pomo.label && pomo.label !== 'Focus' && (
                            <div className="mt-1 max-w-[200px] truncate text-sm text-gray-500">{pomo.label}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={togglePomo} className="rounded-xl px-6 py-2.5 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/5">
                          {pomo.paused ? '▶ Reprendre' : '⏸ Pause'}
                        </button>
                        <button onClick={finishPomodoro} className="rounded-xl bg-emerald-500/15 px-6 py-2.5 text-sm font-medium text-emerald-300 ring-1 ring-emerald-400/30 transition hover:bg-emerald-500/25">
                          ✓ Terminer
                        </button>
                        <button onClick={stopPomodoro} className="rounded-xl bg-red-500/15 px-6 py-2.5 text-sm font-medium text-red-300 ring-1 ring-red-400/30 transition hover:bg-red-500/25">
                          ⏹ Arrêter
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center">
                      <div className="text-6xl">🍅</div>
                      <p className="mx-auto mt-4 max-w-xs text-sm text-gray-400">
                        Tape « démarrer un focus de 50 min » ci-dessous, ou choisis une durée :
                      </p>
                      <div className="mt-5 flex justify-center gap-2">
                        {[15, 25, 50].map((m) => (
                          <button key={m} onClick={() => { setFeedback({ kind: 'add', msg: `🍅 Focus lancé : ${startPomodoro(`focus ${m} min`)}` }); }}
                            className="rounded-xl bg-gradient-to-br from-cyan-500/15 to-indigo-500/15 px-5 py-2.5 text-sm font-medium text-white ring-1 ring-white/15 transition hover:from-cyan-500/25 hover:to-indigo-500/25">
                            {m} min
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Historique des sessions */}
                {pomoSessions.length > 0 && (
                  <div className="shrink-0">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Sessions récentes</p>
                      <button onClick={() => setItems((prev) => ({ ...prev, pomodoro: [] }))} className="text-xs text-gray-600 hover:text-red-400">Tout effacer</button>
                    </div>
                    <div className="flex max-h-32 flex-col gap-1 overflow-auto">
                      {[...pomoSessions].reverse().slice(0, 20).map((s) => (
                        <div key={s.id} className="flex items-center gap-3 rounded-lg bg-surface-900/40 px-3 py-1.5 text-xs ring-1 ring-white/5">
                          <span className={s.status === 'done' ? 'text-emerald-400' : 'text-gray-500'}>{s.status === 'done' ? '✓' : '⏹'}</span>
                          <span className="flex-1 truncate text-gray-300">{s.label}</span>
                          <span className="text-gray-500">{s.trackedMin}/{s.minutes} min</span>
                          <span className="text-gray-600">{fmtDay(s.endedAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            /* ---- VUE GÉNÉRIQUE (tâches, projets) ---- */
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
          <div className="shrink-0 border-t border-white/5">
            {/* Bandeau d'erreur vocale (ex : micro refusé, réseau, non supporté) */}
            <AnimatePresence>
              {voiceError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mx-4 mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/30"
                >
                  ⚠️ {voiceError}
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={submit} className="flex gap-3 p-4">
              {/* Indicateur d'état vocal : écoute ou transcription en cours */}
              {(isListening || isProcessing) && (
                <motion.div
                  className={`shrink-0 self-center text-sm flex items-center gap-1 ${isListening ? 'text-red-400' : 'text-brand'}`}
                  animate={{ opacity: [0.4, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                >
                  {isListening ? '🎙️ Écoute…' : '⏳ Transcription…'}
                </motion.div>
              )}

              {/* Champ input (désactivé pendant l'écoute / la transcription) */}
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isListening ? 'Parlez maintenant…' : (isProcessing ? 'Transcription en cours…' : feature.placeholder)}
                className="flex-1 rounded-xl bg-surface-900 px-4 py-3 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-brand disabled:opacity-60"
                style={ { caretColor: '#6366f1' } }
                disabled={isListening || isProcessing}
              />

              {/* Bouton micro avec halo + pulsation */}
              {voiceSupported ? (
                <div className="relative shrink-0 self-center">
                  {/* Halo animé visible uniquement en écoute */}
                  {isListening && (
                    <motion.span
                      className="absolute inset-0 rounded-xl bg-red-500"
                      initial={{ opacity: 0.5, scale: 1 }}
                      animate={{ opacity: 0, scale: 1.8 }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
                    />
                  )}
                  <motion.button
                    type="button"
                    onClick={(e) => { e.preventDefault(); toggleVoice(); }}
                    aria-label="Saisie vocale"
                    aria-pressed={isListening}
                    disabled={isProcessing}
                    title={isListening ? 'Arrêter l’écoute' : 'Parler'}
                    className={`relative z-10 rounded-xl px-5 py-3 text-base outline-none ring-1 transition focus:ring-2 focus:ring-brand disabled:opacity-50 ${
                      isListening
                        ? 'bg-red-600 ring-red-400/60 shadow-lg shadow-red-500/30'
                        : 'bg-surface-800 ring-white/10 hover:bg-surface-700'
                    }`}
                    animate={isListening ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                    transition={isListening ? { duration: 0.8, repeat: Infinity } : { duration: 0.2 }}
                  >
                    {isProcessing ? '⏳' : '🎤'}
                  </motion.button>
                </div>
              ) : null}

              <button type="submit" className="shrink-0 rounded-xl bg-brand px-5 py-3 text-sm font-medium text-white transition hover:bg-brand-dark">Envoyer</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
