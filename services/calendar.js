import { BaseService } from './base.js';

// Intégration Google Calendar — lecture/création d'événements.
// Nécessite un jeton OAuth2 fourni via params.accessToken.
export class CalendarService extends BaseService {
  constructor() {
    super('calendar');
    this.credentials = process.env.GOOGLE_CALENDAR_CREDENTIALS || null;
  }

  isConfigured() {
    return Boolean(this.credentials);
  }

  async execute(action, params = {}) {
    if (!params.accessToken) {
      return { ok: false, message: 'Calendar : jeton OAuth2 (accessToken) requis.' };
    }
    const base = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
    const headers = {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    };

    if (action === 'list') {
      const url = `${base}?maxResults=10&orderBy=startTime&singleEvents=true&timeMin=${new Date().toISOString()}`;
      const res = await fetch(url, { headers });
      const data = await res.json();
      return { ok: res.ok, message: 'Événements récupérés.', data };
    }

    if (action === 'create') {
      const res = await fetch(base, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          summary: params.summary,
          start: { dateTime: params.start },
          end: { dateTime: params.end },
        }),
      });
      return { ok: res.ok, message: res.ok ? 'Événement créé.' : 'Échec Calendar.' };
    }

    return super.execute(action, params);
  }
}
