/**
 * Garde-fou réseau contre le SSRF.
 *
 * Buzzy suit des URLs produites par un modèle de langage — donc, en pratique,
 * par un tiers non fiable. Or Buzzy tourne dans un réseau Docker où
 * « db:5432 », « searxng:8080 » ou l'API de métadonnées du cloud
 * (169.254.169.254) sont joignables depuis le conteneur applicatif.
 *
 * On n'autorise donc que les destinations résolvant vers des adresses IP
 * publiques, et on revalide à chaque saut de redirection.
 */

import dns from 'node:dns/promises';
import net from 'node:net';

/** Adresses IPv4 non routables sur l'Internet public. */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // illisible → traité comme interdit
  }
  const [a, b] = parts;
  return (
    a === 0 || // 0.0.0.0/8 — « ce réseau »
    a === 10 || // 10.0.0.0/8 — privé
    a === 127 || // 127.0.0.0/8 — loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 — CGNAT
    (a === 169 && b === 254) || // 169.254.0.0/16 — link-local (métadonnées cloud)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 — privé
    (a === 192 && b === 168) || // 192.168.0.0/16 — privé
    (a === 192 && b === 0) || // 192.0.0.0/24 — usage spécial
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 — bancs de test
    a >= 224 // multicast et réservé
  );
}

/** Adresses IPv6 non routables sur l'Internet public. */
function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0]; // retire l'identifiant de zone
  if (addr === '::' || addr === '::1') return true; // non spécifiée, loopback
  // ::ffff:a.b.c.d — IPv4 encapsulée
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return (
    addr.startsWith('fe80') || // link-local
    addr.startsWith('fc') || // unique local
    addr.startsWith('fd') || // unique local
    addr.startsWith('ff') // multicast
  );
}

export function isPrivateAddress(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // pas une IP → interdit
}

export type UrlRejection =
  | 'scheme' // ni http ni https
  | 'invalid' // URL illisible
  | 'dns' // nom d'hôte non résolu
  | 'private'; // résout vers une adresse interne

export interface UrlVerdict {
  allowed: boolean;
  reason?: UrlRejection;
}

/**
 * Autorise une URL uniquement si son schéma est http(s) et si TOUTES les
 * adresses résolues sont publiques — un nom qui résout à la fois vers une
 * adresse publique et vers 127.0.0.1 est refusé.
 */
export async function isPublicUrl(rawUrl: string): Promise<UrlVerdict> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: 'invalid' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { allowed: false, reason: 'scheme' };
  }

  // Hôte déjà littéral : pas de résolution nécessaire.
  const literal = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(literal)) {
    return isPrivateAddress(literal) ? { allowed: false, reason: 'private' } : { allowed: true };
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(url.hostname, { all: true });
  } catch {
    return { allowed: false, reason: 'dns' };
  }

  if (addresses.length === 0) return { allowed: false, reason: 'dns' };
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    return { allowed: false, reason: 'private' };
  }
  return { allowed: true };
}
