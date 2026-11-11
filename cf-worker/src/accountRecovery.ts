import { timingSafeEqual } from 'node:crypto';

export const RECOVERY_CODE = /^[0-9a-f]{64}$/;
const RECOVERY_RECORD = /^recovery-v1\$([1-9][0-9]{9})\$([0-9a-f]{64})$/;

export async function recoveryCodeExpiry(code: string, record: string): Promise<number | null> {
  const match = RECOVERY_RECORD.exec(record);
  if (!match) return null;
  const expiresAt = Number(match[1]);
  if (expiresAt <= Math.floor(Date.now() / 1000)) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return timingSafeEqual(new Uint8Array(digest), Buffer.from(match[2], 'hex')) ? expiresAt : null;
}
