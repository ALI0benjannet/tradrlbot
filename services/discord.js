import { BaseService } from './base.js';

// Intégration Discord via webhook ou bot token.
export class DiscordService extends BaseService {
  constructor() {
    super('discord');
    this.webhook = process.env.DISCORD_WEBHOOK_URL || null;
    this.token = process.env.DISCORD_BOT_TOKEN || null;
  }

  isConfigured() {
    return Boolean(this.webhook || this.token);
  }

  async execute(action, params = {}) {
    if (action === 'send' && this.webhook) {
      const res = await fetch(this.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: params.text }),
      });
      return { ok: res.ok, message: res.ok ? 'Message Discord envoyé.' : 'Échec Discord.' };
    }
    return super.execute(action, params);
  }
}
