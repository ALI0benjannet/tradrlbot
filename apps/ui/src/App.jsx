import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Dashboard from './components/Dashboard.jsx';
import History from './components/History.jsx';
import Settings from './components/Settings.jsx';
import Productivity from './components/Productivity.jsx';
import { classifyIntent, connectRealtime, fetchProductivity, saveProductivity, sendCommand } from './lib/api.js';
import { applyIntentToProductivity, classifyIntentLocal, isFocusCommand } from './lib/productivitySync.js';

// Catégories de la barre latérale (regroupées par section).
const CATEGORIES = {
  dashboard: {
    title: 'Contrôle du bureau',
    subtitle: 'Contrôle complet de votre ordinateur.',
    icon: '🖥️',
    color: '#3b82f6',
    examples: [
      { label: 'Monter le volume', command: 'monte le volume' },
      { label: 'Régler le volume', command: 'regle le volume a 30%' },
      { label: 'Régler la luminosité', command: 'regle la luminosite a 60%' },
      { label: 'Ouvrir une application', command: 'ouvre la calculatrice' },
      { label: 'Verrouiller la session', command: 'verrouille la session' },
      { label: 'Lister les fenêtres', command: 'liste les applications ouvertes' },
    ],
  },
  developer: {
    title: 'Assistant développeur',
    subtitle: 'Votre pair-programmeur IA personnel.',
    icon: '</>',
    color: '#22c55e',
    examples: [
      { label: 'Ouvrir VS Code', command: 'ouvre vscode' },
      { label: 'Ouvrir un terminal', command: 'ouvre le terminal' },
      { label: 'Ouvrir l’explorateur', command: 'ouvre explorateur' },
      { label: 'Créer un dossier projet', command: 'crie un dossier sur le bureau avec le nom projet' },
      { label: 'Lister les applications ouvertes', command: 'liste les applications ouvertes' },
      { label: 'Expliquer du code', command: 'explique-moi ce code' },
      { label: 'Générer une fonction', command: 'ecris une fonction de tri en python' },
    ],
  },
  productivity: {
    title: 'Productivité',
    subtitle: 'Organisez, planifiez et restez focus.',
    icon: '📅',
    color: '#a855f7',
    examples: [
      { label: 'Créer un dossier', command: 'crie un dossier sur le bureau avec le nom projet' },
      { label: 'Renommer un dossier', command: 'renomme le dossier projet en archive sur le bureau' },
      { label: 'Déplacer un dossier', command: 'deplace projet vers documents' },
      { label: 'Écrire une note', command: 'ecris ma note dans le fichier note.txt sur le bureau' },
      { label: 'Lister le bureau', command: 'liste le contenu du bureau' },
      { label: 'Supprimer un dossier', command: 'supprime le dossier projet sur le bureau' },
      { label: 'Planifier un rappel', command: 'rappelle-moi la reunion a 15h' },
    ],
  },
  communication: {
    title: 'Communication',
    subtitle: 'Gérez vos communications.',
    icon: '💬',
    color: '#3b82f6',
    examples: [
      { label: 'Envoyer un message Slack', command: 'envoie un message sur slack' },
      { label: 'Lire mes emails', command: 'lis mes derniers emails' },
      { label: 'Message Discord', command: 'envoie un message sur discord' },
      { label: 'Ouvrir Teams', command: 'ouvre teams' },
      { label: 'Ouvrir Discord', command: 'ouvre discord' },
      { label: 'Ouvrir le navigateur', command: 'ouvre google' },
    ],
  },
  automation: {
    title: 'Automatisation',
    subtitle: 'Automatisez les actions répétitives.',
    icon: '⚙️',
    color: '#f59e0b',
    examples: [
      { label: 'Taper du texte', command: 'tape bonjour tout le monde' },
      { label: 'Déplacer un fichier', command: 'deplace projet vers documents' },
      { label: 'Monter le volume', command: 'monte le volume' },
      { label: 'Couper le son', command: 'coupe le son' },
      { label: 'Mettre en veille', command: 'mets en veille' },
      { label: 'Éteindre l’écran', command: 'eteins l’ecran' },
      { label: 'Verrouiller la session', command: 'verrouille la session' },
    ],
  },
  companion: {
    title: 'Compagnon personnel',
    subtitle: 'Plus qu’un outil, un vrai compagnon.',
    icon: '❤️',
    color: '#ec4899',
    examples: [
      { label: 'Dire bonjour', command: 'bonjour' },
      { label: 'Demander comment ça va', command: 'comment vas-tu ?' },
      { label: 'Raconter une blague', command: 'raconte-moi une blague' },
      { label: 'Discuter', command: 'parle-moi un peu' },
    ],
  },
};

// Structure de navigation (sections + onglets système).
const NAV_SECTIONS = [
  {
    title: 'Catégorie',
    items: [
      { id: 'dashboard', label: 'Contrôle du bureau', icon: '🖥️' },
      { id: 'developer', label: 'Assistant développeur', icon: '</>' },
      { id: 'productivity', label: 'Productivité', icon: '📅' },
      { id: 'communication', label: 'Communication', icon: '💬' },
      { id: 'automation', label: 'Automatisation', icon: '⚙️' },
      { id: 'companion', label: 'Compagnon personnel', icon: '❤️' },
    ],
  },
  {
    title: 'Système',
    items: [
      { id: 'history', label: 'Historique', icon: '🕑' },
      { id: 'settings', label: 'Réglages', icon: '⚙️' },
    ],
  },
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [status, setStatus] = useState('offline');
  const [assistantState, setAssistantState] = useState('idle');
  const [messages, setMessages] = useState([]);
  const rtRef = useRef(null);
  const [focusRequest, setFocusRequest] = useState(null); // commande focus venue du Dashboard
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

  const syncDashboardProductivity = async (text) => {
    let intent = null;
    try {
      intent = await classifyIntent(text, 'tasks');
    } catch {
      intent = null;
    }

    const fallback = classifyIntentLocal(text, 'tasks');

    if (!intent || !['add', 'delete', 'complete', 'update'].includes(intent.action)) {
      intent = fallback;
    } else if (intent.action === 'update' && (!intent.query || !intent.content)) {
      intent = {
        ...intent,
        query: intent.query || fallback.query,
        content: intent.content || fallback.content,
      };
    }

    if (!intent || !['add', 'delete', 'complete', 'update'].includes(intent.action)) return;

    const current = await fetchProductivity();
    const { changed, items } = applyIntentToProductivity(current, intent, text, 'tasks');
    if (changed) await saveProductivity(items);
  };

  const handleSend = async (text, opts = {}) => {
    const source = opts?.source || 'dashboard';

    // Commande de focus tapée dans le Dashboard : on bascule vers la
    // Productivité (Pomodoro) qui lance/arrête la session automatiquement.
    if (source === 'dashboard' && isFocusCommand(text)) {
      setMessages((m) => [...m, { role: 'user', text }]);
      setTab('productivity');
      setFocusRequest({ text, nonce: Date.now() });
      return;
    }

    setMessages((m) => [...m, { role: 'user', text }]);
    setAssistantState('thinking');

    const syncPromise = source === 'productivity'
      ? Promise.resolve()
      : syncDashboardProductivity(text).catch(() => {});

    try {
      const res = await sendCommand(text);
      await syncPromise;
      setMessages((m) => [...m, { role: 'assistant', text: res.response }]);
    } catch (e) {
      await syncPromise;
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
          <img
            src="/avatar.png"
            alt="Tradrly"
            className="h-9 w-9 rounded-xl object-cover shadow-glow ring-1 ring-brand/40"
            draggable={false}
            onError={(e) => {
              if (!e.currentTarget.src.endsWith('/avatar.svg')) {
                e.currentTarget.src = '/avatar.svg';
              }
            }}
          />
          <div>
            <p className="text-sm font-semibold">Tradrly Bot</p>
            <p className="text-xs text-gray-500">Assistant local</p>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-brand">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                      tab === t.id
                        ? 'bg-brand/15 text-white ring-1 ring-brand/40'
                        : 'text-gray-400 hover:bg-white/5'
                    }`}
                  >
                    <span className="w-5 text-center">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-6 px-2 text-xs text-gray-600">
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
            {tab === 'productivity' && <Productivity onSend={(text) => handleSend(text, { source: 'productivity' })} focusRequest={focusRequest} />}
            {(tab === 'dashboard' ||
              (CATEGORIES[tab] && tab !== 'productivity')) && (
              <Dashboard
                status={status}
                assistantState={assistantState}
                onSend={(text) => handleSend(text, { source: 'dashboard' })}
                messages={messages}
                category={CATEGORIES[tab]}
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
