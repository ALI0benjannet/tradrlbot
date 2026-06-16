import { BaseService } from './base.js';

// Intégration Microsoft Teams via Incoming Webhook.
export class TeamsService extends BaseService {
  constructor() {
    super('teams');
    this.webhook = process.env.TEAMS_WEBHOOK_URL || null;
  }

  isConfigured() {
    return Boolean(this.webhook);
  }

  async execute(action, params = {}) {
    if (!this.isConfigured()) {
      return { ok: false, message: 'Teams non configuré (TEAMS_WEBHOOK_URL manquant).' };
    }
    if (action === 'send') {
      const res = await fetch(this.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: params.text }),
      });
      return { ok: res.ok, message: res.ok ? 'Message Teams envoyé.' : 'Échec Teams.' };
    }
    return super.execute(action, params);
  }
}
