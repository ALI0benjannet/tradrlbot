import { BaseService } from './base.js';

// Intégration Gmail (API Google). Nécessite un flux OAuth2.
// Les jetons d'accès sont gérés en amont et fournis via params.accessToken.
export class GmailService extends BaseService {
  constructor() {
    super('gmail');
    this.clientId = process.env.GMAIL_CLIENT_ID || null;
    this.clientSecret = process.env.GMAIL_CLIENT_SECRET || null;
  }

  isConfigured() {
    return Boolean(this.clientId && this.clientSecret);
  }

  async execute(action, params = {}) {
    if (!params.accessToken) {
      return { ok: false, message: 'Gmail : jeton OAuth2 (accessToken) requis.' };
    }
    if (action === 'send') {
      const raw = Buffer.from(
        `To: ${params.to}\r\nSubject: ${params.subject}\r\n\r\n${params.body}`
      )
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      const res = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${params.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw }),
        }
      );
      return { ok: res.ok, message: res.ok ? 'Email envoyé.' : 'Échec Gmail.' };
    }
    return super.execute(action, params);
  }
}
