const SAFE_SCHEME = /^(https?|mailto|tel):/i;
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Turn what someone typed into a link target, or null when it is empty or unsafe.
 * "example.com" becomes https://example.com, "a@b.com" becomes mailto:a@b.com, and any scheme
 * other than http, https, mailto or tel (javascript:, data:) is refused.
 */
export function normalizeLinkUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url || /\s/.test(url)) return null;
  if (url.startsWith("#") || url.startsWith("/")) return url;
  if (SAFE_SCHEME.test(url)) return url;
  if (ANY_SCHEME.test(url)) return null;
  if (EMAIL.test(url)) return `mailto:${url}`;
  return `https://${url}`;
}
