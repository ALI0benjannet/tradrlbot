import React, { useEffect, useState } from 'react';
import { fetchHistory } from '../lib/api.js';

export default function History() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchHistory()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="h-full overflow-y-auto rounded-2xl bg-surface-800/60 p-6 ring-1 ring-white/5">
      <h2 className="mb-4 text-lg font-semibold">Historique</h2>

      {loading && <p className="text-gray-500">Chargement…</p>}
      {error && <p className="text-red-400">Impossible de charger : {error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="text-gray-500">Aucune interaction enregistrée.</p>
      )}

      <ul className="space-y-3">
        {items.map((it) => (
          <li
            key={it.id}
            className="rounded-xl bg-surface-900 p-4 ring-1 ring-white/5"
          >
            <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
              <span>{new Date(it.createdAt).toLocaleString('fr-FR')}</span>
              {it.intent && (
                <span className="rounded bg-brand/20 px-2 py-0.5 text-brand">
                  {it.intent}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-200">{it.input}</p>
            <p className="mt-1 text-sm text-gray-400">↳ {it.response}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
