const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape a cell value before it is substituted into an HTML body. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Collapse CR/LF (and other line separators) so a cell value can never inject
 * extra SMTP headers through the subject or display name.
 */
export function stripLineBreaks(value: string): string {
  return value.replace(/[\r\n\u2028\u2029]+/g, " ").replace(/\s{2,}/g, " ").trim();
}
