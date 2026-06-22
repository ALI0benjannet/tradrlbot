// Client de communication avec la couche Orchestration (Node.js).
// Utilise WebSocket pour le temps réel + REST pour les requêtes ponctuelles.

const ORCH_HTTP =
  (typeof window !== 'undefined' && window.tradrly?.orchestratorUrl) ||
  'http://localhost:4000';
const ORCH_WS =
  (typeof window !== 'undefined' && window.tradrly?.orchestratorWs) ||
  'ws://localhost:4000';

export async function sendCommand(text) {
  const res = await fetch(`${ORCH_HTTP}/api/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Orchestrateur: ${res.status}`);
  return res.json();
}

// Analyse NLP temps réel d'un texte en cours de frappe (badge d'intention).
export async function analyzeText(text) {
  const res = await fetch(`${ORCH_HTTP}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Orchestrateur: ${res.status}`);
  return res.json();
}

export async function fetchHistory() {
  const res = await fetch(`${ORCH_HTTP}/api/history`);
  if (!res.ok) throw new Error(`Orchestrateur: ${res.status}`);
  return res.json();
}

export async function fetchSettings() {
  const res = await fetch(`${ORCH_HTTP}/api/settings`);
  if (!res.ok) throw new Error(`Orchestrateur: ${res.status}`);
  return res.json();
}

export async function saveSettings(settings) {
  const res = await fetch(`${ORCH_HTTP}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`Orchestrateur: ${res.status}`);
  return res.json();
}

// Persistance de la productivité (tâches, rappels, agenda…).
export async function fetchProductivity() {
  const res = await fetch(`${ORCH_HTTP}/api/productivity`);
  if (!res.ok) throw new Error(`Orchestrateur: ${res.status}`);
  return res.json();
}

export async function saveProductivity(items) {
  const res = await fetch(`${ORCH_HTTP}/api/productivity`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(items),
  });
  if (!res.ok) throw new Error(`Orchestrateur: ${res.status}`);
  return res.json();
}

// Compréhension d'intention : ajouter / supprimer / terminer un élément.
// Renvoie { action, target, content, query, engine }.
export async function classifyIntent(text, active = null) {
  const res = await fetch(`${ORCH_HTTP}/api/productivity/intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, active }),
  });
  if (!res.ok) throw new Error(`Orchestrateur: ${res.status}`);
  return res.json();
}

// Transcription vocale : envoie l'audio (base64) à la couche IA, renvoie { text }.
export async function transcribeAudio(audioBase64, mime = 'audio/webm') {
  const res = await fetch(`${ORCH_HTTP}/api/stt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio: audioBase64, mime }),
  });
  if (!res.ok) throw new Error(`Orchestrateur: ${res.status}`);
  return res.json(); // { text }
}

// Connexion temps réel : statut de l'assistant, événements, transcriptions.
export function connectRealtime({ onMessage, onStatus } = {}) {
  let ws;
  let closed = false;

  function open() {
    ws = new WebSocket(ORCH_WS);
    ws.onopen = () => onStatus?.('online');
    ws.onclose = () => {
      onStatus?.('offline');
      if (!closed) setTimeout(open, 2000); // reconnexion auto
    };
    ws.onerror = () => onStatus?.('error');
    ws.onmessage = (evt) => {
      try {
        onMessage?.(JSON.parse(evt.data));
      } catch {
        /* ignore messages non-JSON */
      }
    };
  }

  open();

  return {
    send: (payload) => ws?.readyState === 1 && ws.send(JSON.stringify(payload)),
    close: () => {
      closed = true;
      ws?.close();
    },
  };
}
