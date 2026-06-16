import { BaseService } from './base.js';

// Intégration Slack — envoi de messages, lecture de canaux.
// Configurer SLACK_BOT_TOKEN dans le coffre chiffré.
export class SlackService extends BaseService {
  constructor() {
    super('slack');
    this.token = process.env.SLACK_BOT_TOKEN || null;
  }

  isConfigured() {
    return Boolean(this.token);
  }

  async execute(action, params = {}) {
    if (!this.isConfigured()) {
      return { ok: false, message: 'Slack non configuré (SLACK_BOT_TOKEN manquant).' };
    }
    switch (action) {
      case 'send': {
        const res = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ channel: params.channel, text: params.text }),
        });
        const data = await res.json();
        return { ok: data.ok, message: data.ok ? 'Message Slack envoyé.' : data.error, data };
      }
      default:
        return super.execute(action, params);
    }
  }
}
