import { timingSafeEqual } from 'node:crypto';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

const VERSION = 'pbkdf2-sha256-v1';
const ITERATIONS = 600_000;
const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value.match(/../g) ?? [], pair => Number.parseInt(pair, 16));
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const bytes = encoder.encode(password);
  const key = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveBits']);
  try {
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256,
    );
    return new Uint8Array(bits);
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'NotSupportedError') throw error;
    // Hosted Workers cap native PBKDF2. Derive the same digest without changing the work factor.
    return pbkdf2(sha256, bytes, salt, { c: ITERATIONS, dkLen: 32 });
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return `${VERSION}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword(password: string, stored: unknown): Promise<boolean> {
  if (typeof stored !== 'string') return false;
  const [version, salt, hash, ...extra] = stored.split('$');
  if (version !== VERSION || extra.length || !/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{64}$/.test(hash)) {
    // A matching legacy hash does not prove which colliding password was used.
    return false;
  }
  return timingSafeEqual(await derive(password, fromHex(salt)), fromHex(hash));
}
