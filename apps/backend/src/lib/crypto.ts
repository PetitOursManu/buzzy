import crypto from 'crypto';
import { env } from './env';

/**
 * Chiffrement symétrique AES-256-GCM des secrets stockés en base
 * (clé API du fournisseur IA, en-têtes d'authentification MCP).
 *
 * La clé est dérivée de la variable d'environnement ENCRYPTION_KEY.
 * Formats acceptés pour ENCRYPTION_KEY :
 *   - hex de 64 caractères (32 octets)
 *   - base64 correspondant à 32 octets
 *   - toute autre chaîne : dérivée en 32 octets via SHA-256
 *
 * Format de sortie : "iv:authTag:ciphertext" (chaque partie en base64).
 */

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // recommandé pour GCM

function deriveKey(raw: string): Buffer {
  // Clé hex de 64 caractères → 32 octets
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  // Base64 correspondant exactement à 32 octets
  try {
    const b = Buffer.from(raw, 'base64');
    if (b.length === 32) return b;
  } catch {
    /* ignore */
  }
  // Chaîne brute de 32 octets exactement
  const utf8 = Buffer.from(raw, 'utf8');
  if (utf8.length === 32) return utf8;
  // Sinon : dérivation déterministe via SHA-256
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

const KEY = deriveKey(env.ENCRYPTION_KEY);

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decrypt(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Format de secret chiffré invalide');
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

/** Renvoie les 4 derniers caractères d'un secret, pour affichage masqué. */
export function lastFour(plaintext: string): string {
  if (!plaintext) return '';
  return plaintext.slice(-4);
}
