/**
 * Pragmatic address check: one `@`, no whitespace, a dotted domain, sane lengths.
 * Gmail does the final verification when the message is sent.
 */
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

export function isValidEmail(value: string): boolean {
  const v = value.trim();
  if (v.length < 6 || v.length > 254) return false;
  const [local] = v.split("@");
  if (local.length > 64) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  return EMAIL_RE.test(v);
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
