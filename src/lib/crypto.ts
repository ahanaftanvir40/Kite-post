import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const VERSION = "v1";

function keyFrom(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "kitepost", "connection-secret", 32));
}

/**
 * Encrypt a secret for storage (AES-256-GCM). `context` is authenticated but not stored, so a
 * sealed value only opens for the account it was written for.
 */
export function sealSecret(plain: string, secret: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

/** The original text, or null when the value is malformed, tampered with, or sealed with another key or context. */
export function openSecret(sealed: string, secret: string, context: string): string | null {
  try {
    const [version, iv, tag, body] = sealed.split(".");
    if (version !== VERSION || !iv || !tag || !body) return null;
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
