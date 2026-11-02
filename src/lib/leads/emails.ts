const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const MAILTO_RE = /mailto:([^\s"'<>)?]+)/gi;

/** Addresses that appear on pages but are never a business inbox. */
const JUNK_DOMAINS = /(^|\.)(example\.com|sentry\.io|sentry-next\.wixpress\.com|wixpress\.com|godaddy\.com|domain\.com|email\.com|yourdomain\.com|schema\.org)$/;
const JUNK_LOCALS = /^(you|your|name|email|user|username|test|john\.?doe|noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster)$/;
const FILE_TAIL = /\.(png|jpe?g|gif|webp|svg|avif|css|js|woff2?|ico)$/i;
const PREFERRED = /^(info|contact|hello|hi|office|sales|support|enquiries|inquiries|admin|team|appointments?|reception|bookings?)$/;

export function hostOf(url: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function clean(raw: string): string | null {
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // keep the raw text
  }
  const email = value.trim().replace(/^[.,;:]+|[.,;:]+$/g, "").toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(email)) return null;
  if (FILE_TAIL.test(email)) return null;
  const [local, domain] = email.split("@");
  if (JUNK_DOMAINS.test(domain) || JUNK_LOCALS.test(local)) return null;
  return email;
}

export { clean as cleanEmail };

/** Every plausible business email on a page, best first: same site, then info@/contact@-style inboxes. */
export function extractEmails(pageText: string, website: string | null): string[] {
  const found = new Set<string>();
  for (const m of pageText.matchAll(MAILTO_RE)) {
    const email = clean(m[1]);
    if (email) found.add(email);
  }
  for (const m of pageText.matchAll(EMAIL_RE)) {
    const email = clean(m[0]);
    if (email) found.add(email);
  }
  const host = website ? hostOf(website) : null;
  const score = (email: string) => {
    const [local, domain] = email.split("@");
    const sameSite = host !== null && (domain === host || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`));
    return (sameSite ? 2 : 0) + (PREFERRED.test(local) ? 1 : 0);
  };
  return [...found].sort((a, b) => score(b) - score(a));
}

/** A same-site link whose address mentions "contact", from markdown or plain text. Null when there is none. */
export function findContactUrl(markdown: string, website: string): string | null {
  const host = hostOf(website);
  if (!host) return null;
  for (const m of markdown.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) {
    if (hostOf(m[1]) === host && /contact/i.test(m[1])) return m[1];
  }
  return null;
}
