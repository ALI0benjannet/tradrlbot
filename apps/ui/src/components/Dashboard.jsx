import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Avatar from './Avatar.jsx';

export default function Dashboard({ status, assistantState, onSend, messages }) {
  const [input, setInput] = useState('');
  const inputRef = useRef(null);
  const endRef = useRef(null);

  // Garde le focus sur le champ de saisie (au montage et après chaque message).
  useEffect(() => {
    inputRef.current?.focus();
  }, [messages, assistantState]);

  // Défile automatiquement vers le dernier message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const submit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput('');
    inputRef.current?.focus();
  };

  return (
    <div className="grid h-full grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
      {/* Colonne avatar + statut */}
      <div className="flex flex-col items-center justify-center rounded-2xl bg-surface-800/60 p-8 ring-1 ring-white/5">
        <Avatar state={assistantState} />
        <div className="mt-8 w-full space-y-2 text-sm text-gray-400">
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

        <form onSubmit={submit} className="flex shrink-0 gap-3 border-t border-white/5 p-4">
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
            type="submit"
            className="rounded-xl bg-brand px-5 py-3 text-sm font-medium text-white transition hover:bg-brand-dark"
          >
            Envoyer
          </button>
        </form>
      </div>
    </div>
  );
}
