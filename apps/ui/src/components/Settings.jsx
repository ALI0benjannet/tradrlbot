import React, { useEffect, useState } from 'react';
import { fetchSettings, saveSettings } from '../lib/api.js';

const DEFAULTS = {
  voice: 'alloy',
  language: 'fr',
  llmModel: 'gpt-4o',
  wakeWord: 'tradrly',
  ttsEnabled: true,
};

export default function Settings() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchSettings()
      .then((s) => setSettings({ ...DEFAULTS, ...s }))
      .catch(() => {});
  }, []);

  const update = (key, value) => {
    setSettings((s) => ({ ...s, [key]: value }));
    setSaved(false);
  };

  const persist = async () => {
    try {
      await saveSettings(settings);
      setSaved(true);
    } catch {
      setSaved(false);
    }
  };

  const Field = ({ label, children }) => (
    <label className="flex items-center justify-between gap-4 py-3">
      <span className="text-sm text-gray-300">{label}</span>
      {children}
    </label>
  );

  return (
    <div className="h-full overflow-y-auto rounded-2xl bg-surface-800/60 p-6 ring-1 ring-white/5">
      <h2 className="mb-2 text-lg font-semibold">Réglages</h2>
      <div className="divide-y divide-white/5">
        <Field label="Langue">
          <select
            value={settings.language}
            onChange={(e) => update('language', e.target.value)}
            className="rounded-lg bg-surface-900 px-3 py-2 text-sm ring-1 ring-white/10"
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </Field>

        <Field label="Modèle LLM">
          <select
            value={settings.llmModel}
            onChange={(e) => update('llmModel', e.target.value)}
            className="rounded-lg bg-surface-900 px-3 py-2 text-sm ring-1 ring-white/10"
          >
            <option value="gpt-4o">GPT-4o</option>
            <option value="gpt-4o-mini">GPT-4o mini</option>
          </select>
        </Field>

        <Field label="Voix (TTS)">
          <select
            value={settings.voice}
            onChange={(e) => update('voice', e.target.value)}
            className="rounded-lg bg-surface-900 px-3 py-2 text-sm ring-1 ring-white/10"
          >
            <option value="alloy">Alloy</option>
            <option value="verse">Verse</option>
            <option value="aria">Aria</option>
          </select>
        </Field>

        <Field label="Mot d'activation">
          <input
            value={settings.wakeWord}
            onChange={(e) => update('wakeWord', e.target.value)}
            className="w-40 rounded-lg bg-surface-900 px-3 py-2 text-sm ring-1 ring-white/10"
          />
        </Field>

        <Field label="Synthèse vocale activée">
          <input
            type="checkbox"
            checked={settings.ttsEnabled}
            onChange={(e) => update('ttsEnabled', e.target.checked)}
            className="h-5 w-5 accent-brand"
          />
        </Field>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={persist}
          className="rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-dark"
        >
          Enregistrer
        </button>
        {saved && <span className="text-sm text-emerald-400">✓ Enregistré</span>}
      </div>
    </div>
  );
}
