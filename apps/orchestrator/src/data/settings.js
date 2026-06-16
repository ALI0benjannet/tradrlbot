import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Persistance simple des réglages utilisateur (JSON local).
const SETTINGS_PATH = resolve('./data/settings.json');

const DEFAULTS = {
  voice: 'alloy',
  language: 'fr',
  llmModel: 'gpt-4o',
  wakeWord: 'tradrly',
  ttsEnabled: true,
};

export function getSettings() {
  if (!existsSync(SETTINGS_PATH)) return DEFAULTS;
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8')) };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(partial) {
  const merged = { ...getSettings(), ...partial };
  mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2));
  return merged;
}
