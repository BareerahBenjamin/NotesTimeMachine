import { timingSafeEqual } from 'node:crypto';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { PasswordDerivation } from './worker';

const VERSION = 'pbkdf2-sha256-v1';
const ITERATIONS = 600_000;
const encoder = new TextEncoder();
type DerivationBinding = DurableObjectNamespace<PasswordDerivation>;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value.match(/../g) ?? [], pair => Number.parseInt(pair, 16));
}

export function derivePasswordDigest(password: Uint8Array, salt: Uint8Array): Uint8Array {
  return pbkdf2(sha256, password, salt, { c: ITERATIONS, dkLen: 32 });
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, binding?: DerivationBinding): Promise<Uint8Array> {
  const bytes = encoder.encode(password);
  // Hosted Workers impose both an iteration limit and a short request CPU budget.
  if (binding) return binding.getByName(toHex(salt)).derive(bytes, salt);
  const key = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, binding?: DerivationBinding): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, binding);
  return `${VERSION}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword(password: string, stored: unknown, binding?: DerivationBinding): Promise<boolean> {
  if (typeof stored !== 'string') return false;
  const [version, salt, hash, ...extra] = stored.split('$');
  if (version !== VERSION || extra.length || !/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{64}$/.test(hash)) {
    // A matching legacy hash does not prove which colliding password was used.
    return false;
  }
  return timingSafeEqual(await derive(password, fromHex(salt), binding), fromHex(hash));
}
