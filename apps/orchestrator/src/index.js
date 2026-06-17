import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';

dotenv.config();

import { routeCommand } from './router/commandRouter.js';
import { analyzeText } from './services/aiClient.js';
import { getHistory } from './data/db.js';
import { getSettings, saveSettings } from './data/settings.js';
import { getService, listServices } from '../../../services/index.js';
import { runDesktopAction, listDesktopActions } from './desktop/index.js';

const PORT = Number(process.env.ORCHESTRATOR_PORT) || 4000;

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Diffuse un événement à tous les clients UI connectés.
function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'state', state: 'idle' }));
  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'command') {
        const result = await routeCommand(msg.text, { broadcast });
        ws.send(JSON.stringify({ type: 'message', text: result.response }));
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', error: String(err) }));
    }
  });
});

// ---------- REST ----------
app.get('/health', (_req, res) => res.json({ ok: true, layer: 'orchestrator' }));

app.post('/api/command', async (req, res) => {
  const { text } = req.body ?? {};
  if (!text) return res.status(400).json({ error: 'text requis' });
  try {
    const result = await routeCommand(text, { broadcast });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Analyse NLP en temps réel (badge d'intention de l'UI) — relais vers FastAPI.
app.post('/api/analyze', async (req, res) => {
  const { text } = req.body ?? {};
  if (!text) return res.status(400).json({ error: 'text requis' });
  try {
    const analysis = await analyzeText(text);
    res.json(analysis);
  } catch (err) {
    res.status(503).json({ error: 'Couche IA indisponible', detail: String(err) });
  }
});

app.get('/api/history', (_req, res) => {
  res.json(getHistory());
});

app.get('/api/settings', (_req, res) => res.json(getSettings()));

app.put('/api/settings', (req, res) => {
  res.json(saveSettings(req.body ?? {}));
});

// ---- Contrôle du bureau (desktop) ----
app.get('/api/desktop/actions', (_req, res) => res.json(listDesktopActions()));

app.post('/api/desktop', async (req, res) => {
  const { action, params } = req.body ?? {};
  if (!action) return res.status(400).json({ error: 'action requise' });
  const result = await runDesktopAction(action, params ?? {});
  res.status(result.ok ? 200 : 400).json(result);
});

// ---- Intégrations services ----
app.get('/api/services', (_req, res) => res.json(listServices()));

app.post('/api/services/:name', async (req, res) => {
  const service = getService(req.params.name);
  if (!service) return res.status(404).json({ error: 'service inconnu' });
  const { action, params } = req.body ?? {};
  const result = await service.execute(action, params ?? {});
  res.json(result);
});

server.listen(PORT, () => {
  console.log(`[orchestrator] en écoute sur http://localhost:${PORT}`);
});

// Message clair si le port est déjà occupé par une instance précédente.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[orchestrator] Le port ${PORT} est déjà utilisé par une autre instance.\n` +
        `→ Ferme les anciens process Node :  Get-Process node | Stop-Process -Force\n` +
        `   ou change ORCHESTRATOR_PORT dans le .env.`
    );
  } else {
    console.error('[orchestrator] erreur serveur:', err);
  }
  process.exit(1);
});

// Empêche le crash complet de l'orchestrateur sur une erreur ponctuelle
// (la couche IA hors-ligne, une commande mal formée, etc.).
process.on('unhandledRejection', (reason) => {
  console.error('[orchestrator] promesse rejetée non gérée:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[orchestrator] exception non gérée:', err);
});
