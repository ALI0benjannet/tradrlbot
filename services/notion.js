import { BaseService } from './base.js';

// Intégration Notion — création de pages / lecture de bases.
export class NotionService extends BaseService {
  constructor() {
    super('notion');
    this.token = process.env.NOTION_API_KEY || null;
    this.version = '2022-06-28';
  }

  isConfigured() {
    return Boolean(this.token);
  }

  async execute(action, params = {}) {
    if (!this.isConfigured()) {
      return { ok: false, message: 'Notion non configuré (NOTION_API_KEY manquant).' };
    }
    if (action === 'createPage') {
      const res = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Notion-Version': this.version,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parent: { database_id: params.databaseId },
          properties: params.properties ?? {},
        }),
      });
      const data = await res.json();
      return { ok: res.ok, message: res.ok ? 'Page Notion créée.' : 'Échec Notion.', data };
    }
    return super.execute(action, params);
  }
}
