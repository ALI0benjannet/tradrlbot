import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Dashboard from './components/Dashboard.jsx';
import History from './components/History.jsx';
import Settings from './components/Settings.jsx';
import { connectRealtime, sendCommand } from './lib/api.js';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'history', label: 'Historique', icon: '🕑' },
  { id: 'settings', label: 'Réglages', icon: '⚙️' },
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [status, setStatus] = useState('offline');
  const [assistantState, setAssistantState] = useState('idle');
  const [messages, setMessages] = useState([]);
  const rtRef = useRef(null);

  useEffect(() => {
    rtRef.current = connectRealtime({
      onStatus: setStatus,
      onMessage: (msg) => {
        if (msg.type === 'state') setAssistantState(msg.state);
        if (msg.type === 'message') {
          setMessages((m) => [...m, { role: 'assistant', text: msg.text }]);
        }
      },
    });
    return () => rtRef.current?.close();
  }, []);

  const handleSend = async (text) => {
    setMessages((m) => [...m, { role: 'user', text }]);
    setAssistantState('thinking');
    try {
      const res = await sendCommand(text);
      setMessages((m) => [...m, { role: 'assistant', text: res.response }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: `⚠️ Orchestrateur indisponible (${e.message}).` },
      ]);
    } finally {
      setAssistantState('idle');
    }
  };

  return (
    <div className="flex h-full">
      {/* Barre latérale */}
      <aside className="flex w-60 flex-col border-r border-white/5 bg-surface-900/70 p-4">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand to-cyan-400 shadow-glow" />
          <div>
            <p className="text-sm font-semibold">Tradrly Bot</p>
            <p className="text-xs text-gray-500">Assistant local</p>
          </div>
        </div>

        <nav className="space-y-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                tab === t.id
                  ? 'bg-brand/15 text-white ring-1 ring-brand/40'
                  : 'text-gray-400 hover:bg-white/5'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto px-2 text-xs text-gray-600">
          <span
            className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
              status === 'online' ? 'bg-emerald-400' : 'bg-red-400'
            }`}
          />
          {status === 'online' ? 'Connecté' : 'Hors ligne'}
        </div>
      </aside>

      {/* Contenu principal */}
      <main className="flex-1 overflow-hidden p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {tab === 'dashboard' && (
              <Dashboard
                status={status}
                assistantState={assistantState}
                onSend={handleSend}
                messages={messages}
              />
            )}
            {tab === 'history' && <History />}
            {tab === 'settings' && <Settings />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
