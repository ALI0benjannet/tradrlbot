import crypto from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// Coffre de secrets chiffré (AES-256-GCM).
// Stocke les clés API hors du dépôt, déchiffrées en mémoire à la demande.

const ALGO = 'aes-256-gcm';
const VAULT_FILE = './data/secrets.vault';

function deriveKey() {
  const master = process.env.VAULT_MASTER_KEY;
  if (!master || master.length < 16) {
    throw new Error('VAULT_MASTER_KEY manquante ou trop courte (>= 16 caractères).');
  }
  return crypto.createHash('sha256').update(master).digest(); // 32 octets
}

export function encryptSecrets(obj) {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf-8');
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, enc]).toString('base64');
  writeFileSync(VAULT_FILE, payload);
  return true;
}

export function decryptSecrets() {
  if (!existsSync(VAULT_FILE)) return {};
  const key = deriveKey();
  const raw = Buffer.from(readFileSync(VAULT_FILE, 'utf-8'), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString('utf-8'));
}

export function getSecret(name) {
  // Priorité : variable d'environnement, sinon coffre chiffré.
  if (process.env[name]) return process.env[name];
  try {
    return decryptSecrets()[name] ?? null;
  } catch {
    return null;
  }
}
