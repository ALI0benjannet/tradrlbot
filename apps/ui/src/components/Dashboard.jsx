import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Avatar from './Avatar.jsx';
import { analyzeText, transcribeAudio } from '../lib/api.js';

// Capacités du bureau affichées sous l'avatar (cliquables → envoie la commande).
const CAPABILITIES = [
  // Applications
  { label: 'Ouvrir Google Chrome', command: 'ouvre google' },
  { label: 'Fermer Google Chrome', command: 'ferme google' },
  { label: 'Ouvrir la calculatrice', command: 'ouvre la calculatrice' },
  { label: 'Fermer la calculatrice', command: 'ferme la calculatrice' },
  { label: 'Ouvrir le bloc-notes', command: 'ouvre bloc-notes' },
  { label: 'Ouvrir l’explorateur', command: 'ouvre explorateur' },
  // Fenêtres
  { label: 'Lister les applications ouvertes', command: 'liste les applications ouvertes' },
  // Volume / luminosité
  { label: 'Monter le volume', command: 'monte le volume' },
  { label: 'Régler le volume à 30%', command: 'regle le volume a 30%' },
  { label: 'Couper le son', command: 'coupe le son' },
  { label: 'Régler la luminosité à 60%', command: 'regle la luminosite a 60%' },
  // Alimentation / session
  { label: 'Verrouiller la session', command: 'verrouille la session' },
  { label: 'Mettre en veille', command: 'mets en veille' },
  { label: 'Éteindre l’écran', command: 'eteins l’ecran' },
  // Fichiers / dossiers
  { label: 'Lister le contenu du bureau', command: 'liste le contenu du bureau' },
  { label: 'Créer un dossier', command: 'crie un dossier sur le bureau avec le nom demo1' },
  { label: 'Renommer un dossier', command: 'renomme le dossier demo1 en demo2 sur le bureau' },
  { label: 'Déplacer un dossier', command: 'deplace demo2 vers documents' },
  { label: 'Écrire dans un fichier', command: 'ecris bonjour tradrly dans le fichier note.txt sur le bureau' },
  { label: 'Supprimer un dossier', command: 'supprime le dossier demo2 sur le bureau' },
  { label: 'Supprimer un fichier', command: 'supprime le fichier note.txt sur le bureau' },
];

export default function Dashboard({ status, assistantState, onSend, messages, category }) {
  const [input, setInput] = useState('');
  const [intent, setIntent] = useState(null);
  const inputRef = useRef(null);
  const endRef = useRef(null);
  // --- Entrée vocale (micro → STT) ---
const [recording, setRecording] = useState(false);
const [transcribing, setTranscribing] = useState(false);
const recorderRef = useRef(null);
const chunksRef = useRef([]);

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const startRecording = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      setTranscribing(true);
      try {
        const dataUrl = await blobToDataUrl(blob);
        const { text } = await transcribeAudio(dataUrl, blob.type);
        if (text && !text.startsWith('[STT')) {
          onSend(text); // envoie directement la commande dictée
        }
      } catch (err) {
        console.error('Transcription échouée :', err);
      } finally {
        setTranscribing(false);
      }
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  } catch (err) {
    alert('Micro inaccessible : ' + err.message);
  }
};

const stopRecording = () => {
  recorderRef.current?.stop();
  setRecording(false);
};

const toggleRecording = () => (recording ? stopRecording() : startRecording());

  // Capacités affichées : celles de la catégorie, sinon le contrôle complet du bureau.
  const capabilities =
    category?.examples?.length > 0
      ? category.examples.map((e) => ({ label: e.label, command: e.command }))
      : CAPABILITIES;
  const header = {
    title: category?.title ?? 'Contrôle du bureau',
    subtitle: category?.subtitle ?? 'Contrôle complet de votre ordinateur.',
    icon: category?.icon ?? '🖥️',
    color: category?.color ?? '#3b82f6',
  };

  // Garde le focus sur le champ de saisie (au montage et après chaque message).
  useEffect(() => {
    inputRef.current?.focus();
  }, [messages, assistantState]);

  // Défile automatiquement vers le dernier message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Analyse NLP en temps réel (debounce) pendant la frappe → badge d'intention.
  useEffect(() => {
    const text = input.trim();
    if (text.length < 3) {
      setIntent(null);
      return;
    }
    const id = setTimeout(() => {
      analyzeText(text)
        .then(setIntent)
        .catch(() => setIntent(null));
    }, 350);
    return () => clearTimeout(id);
  }, [input]);

  const submit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput('');
    setIntent(null);
    inputRef.current?.focus();
  };

  return (
    <div className="grid h-full grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
      {/* Colonne avatar + statut */}
      <div className="flex flex-col items-center justify-center rounded-2xl bg-surface-800/60 p-8 ring-1 ring-white/5">
        {/* En-tête de la catégorie */}
        <div className="mb-6 flex w-full items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl ring-1 ring-white/10"
            style={{ background: `${header.color}22`, color: header.color }}
          >
            {header.icon}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-white">{header.title}</h1>
            <p className="truncate text-xs text-gray-400">{header.subtitle}</p>
          </div>
        </div>

        <Avatar state={assistantState} />

        {/* Capacités (cliquables) */}
        <div className="mt-8 w-full">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand">
            Ce que je peux faire
          </p>
          <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {capabilities.map((c) => (
              <li key={c.command}>
                <button
                  onClick={() => onSend?.(c.command)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-gray-300 transition hover:bg-white/5 hover:text-white"
                >
                  <span className="text-brand">•</span>
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 w-full space-y-2 text-sm text-gray-400">
          <div className="flex items-center justify-between">
            <span>Orchestrateur</span>
            <span className={status === 'online' ? 'text-emerald-400' : 'text-red-400'}>
              {status === 'online' ? 'connecté' : 'déconnecté'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Mode</span>
            <span className="text-gray-200">Local</span>
          </div>
        </div>
      </div>

      {/* Colonne conversation */}
      <div className="flex min-h-0 flex-col rounded-2xl bg-surface-800/60 ring-1 ring-white/5">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-6">
          {messages.length === 0 && (
            <p className="mt-10 text-center text-gray-500">
              Posez une question ou donnez une commande…
            </p>
          )}
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                m.role === 'user'
                  ? 'ml-auto bg-brand text-white'
                  : 'bg-surface-700 text-gray-100'
              }`}
            >
              {m.text}
            </motion.div>
          ))}
          <div ref={endRef} />
        </div>

        <form onSubmit={submit} className="flex shrink-0 flex-col gap-2 border-t border-white/5 p-4">
          {/* Badge d'intention détectée en temps réel */}
          {intent && (
            <div className="flex items-center gap-2 text-xs">
              <span
                className="rounded-full px-2 py-0.5 font-medium"
                style={{ background: `${intent.color}22`, color: intent.color }}
              >
                {intent.category}
              </span>
              <span className="text-gray-500">
                {intent.intent} · {Math.round((intent.confidence ?? 0) * 100)}%
              </span>
              {intent.priority >= 4 && (
                <span className="rounded-full bg-red-500/20 px-2 py-0.5 font-medium text-red-400">
                  priorité {intent.priority}
                </span>
              )}
              {intent.participants?.length > 0 && (
                <span className="text-gray-400">
                  👤 {intent.participants.join(', ')}
                </span>
              )}
            </div>
          )}
          <div className="flex gap-3">
            <input
              ref={inputRef}
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onBlur={() => inputRef.current?.focus()}
              placeholder="Écrire une commande…"
              className="flex-1 rounded-xl bg-surface-900 px-4 py-3 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-brand"
              style={{ caretColor: '#6366f1' }}
            />
              <button
                type="button"
                onClick={toggleRecording}
                disabled={transcribing}
                title={recording ? 'Arrêter l’enregistrement' : 'Parler'}
                className={`rounded-xl px-4 py-3 text-base ring-1 transition ${
                  recording
                    ? 'bg-red-500/20 text-red-300 ring-red-500/40 animate-pulse'
                    : 'bg-surface-900 text-gray-300 ring-white/10 hover:text-white'
                }`}
              >
                  {transcribing ? '⏳' : recording ? '⏹' : '🎤'}
              </button>
            <button
              type="submit"
              className="rounded-xl bg-brand px-5 py-3 text-sm font-medium text-white transition hover:bg-brand-dark"
            >
              Envoyer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
