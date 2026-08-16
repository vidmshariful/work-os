import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// Stored credentials. The value is encrypted here, in the server action, and
// only the ciphertext ever reaches Postgres. The key is not in the database,
// so a dump of it, or the service role key on its own, reveals nothing.
//
// KEEP THE KEY. WORKOS_SECRET_KEY has to be set wherever this app runs, and
// it has to be the same key everywhere. Lose it and the stored secrets are
// unreadable: there is no recovery path, by design.

const PREFIX = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

// Read at call time, not at module load, so a server that starts without the
// key still serves every other page and only the secret fields complain.
function key(): Buffer | null {
  const raw = process.env.WORKOS_SECRET_KEY?.trim();
  if (!raw) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  return buf.length === 32 ? buf : null;
}

export function hasSecretKey(): boolean {
  return key() !== null;
}

// The shape a stored secret has. Anything else in a secret cell is a value
// that was typed before the field became a secret, and is treated as plain.
export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export function encryptSecret(plain: string): string {
  const k = key();
  if (!k) throw new Error("WORKOS_SECRET_KEY is not set.");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, k, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    body.toString("base64"),
  ].join(":");
}

// Returns null rather than throwing on anything malformed or tampered with,
// so one bad cell cannot take a page down. GCM verifies the tag, so a value
// edited directly in the database fails here instead of decrypting to junk.
export function decryptSecret(blob: string): string | null {
  const k = key();
  if (!k) return null;
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const body = Buffer.from(parts[3], "base64");
    if (iv.length !== IV_BYTES || tag.length !== 16) return null;
    const decipher = createDecipheriv(ALGO, k, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// What the grid is allowed to know about a secret without revealing it: that
// there is one, and roughly how long it is. The length is rounded so the dots
// do not leak the exact character count.
export function secretMask(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return "•".repeat(10);
}

// Used when a field is converted to a secret and its old plain values are
// encrypted in place. Confirms the round trip before anything is written.
export function verifyRoundTrip(plain: string): boolean {
  const back = decryptSecret(encryptSecret(plain));
  if (back === null) return false;
  const a = Buffer.from(back);
  const b = Buffer.from(plain);
  return a.length === b.length && timingSafeEqual(a, b);
}
