import { SlackService } from './slack.js';
import { TeamsService } from './teams.js';
import { DiscordService } from './discord.js';
import { NotionService } from './notion.js';
import { GmailService } from './gmail.js';
import { GitService } from './git.js';
import { CalendarService } from './calendar.js';

// Registre central des intégrations. L'orchestrateur résout un service
// par son nom puis appelle service.execute(action, params).
const registry = {
  slack: new SlackService(),
  teams: new TeamsService(),
  discord: new DiscordService(),
  notion: new NotionService(),
  gmail: new GmailService(),
  git: new GitService(),
  calendar: new CalendarService(),
};

export function getService(name) {
  return registry[name] ?? null;
}

export function listServices() {
  return Object.values(registry).map((s) => ({
    name: s.name,
    configured: s.isConfigured(),
  }));
}

export default registry;
