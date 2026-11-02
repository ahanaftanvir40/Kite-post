import type { FieldDef, Values } from "./derive";
import { escapeHtml, stripLineBreaks } from "./escape";
import { createTokenRegex, findTokens, suggestKey } from "./tokens";

/** Fallback text per normalized field key, e.g. `{ firstname: "there" }`. */
export type Fallbacks = Record<string, string>;

export interface RenderOptions {
  /** HTML-escape substituted values (use for the body, not the subject). */
  escapeValues?: boolean;
  fallbacks?: Fallbacks;
}

export interface RenderResult {
  text: string;
  /** Keys that resolved to an empty value with no fallback. */
  empty: string[];
  /** Keys used in the template that are not fields. They are left untouched. */
  unknown: string[];
}

export function renderTemplate(
  template: string,
  values: Values,
  options: RenderOptions = {},
): RenderResult {
  const { escapeValues = false, fallbacks = {} } = options;
  const empty = new Set<string>();
  const unknown = new Set<string>();

  const text = template.replace(createTokenRegex(), (whole, raw: string) => {
    const key = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!(key in values)) {
      unknown.add(key);
      return whole;
    }
    let value = values[key];
    if (!value) {
      const fallback = fallbacks[key];
      if (fallback) {
        value = fallback;
      } else {
        empty.add(key);
        return "";
      }
    }
    return escapeValues ? escapeHtml(value) : value;
  });

  return { text, empty: [...empty], unknown: [...unknown] };
}

export interface RenderedMessage {
  subject: string;
  html: string;
  empty: string[];
  unknown: string[];
}

/**
 * TipTap saves list items as `<li><p>text</p></li>`. Mail clients give that inner
 * paragraph a margin, which spreads the bullets apart. Unwrap a lone paragraph so
 * the bullets sit as tightly as they do in the editor.
 */
export function compactListItems(html: string): string {
  return html.replace(
    /<li(\b[^>]*)>\s*<p\b[^>]*>([\s\S]*?)<\/p>\s*<\/li>/gi,
    (whole, attrs: string, inner: string) => (/<\/?p\b/i.test(inner) ? whole : `<li${attrs}>${inner}</li>`),
  );
}

export function renderMessage(
  subjectTemplate: string,
  bodyTemplate: string,
  values: Values,
  fallbacks: Fallbacks = {},
): RenderedMessage {
  const subject = renderTemplate(subjectTemplate, values, { fallbacks });
  const body = renderTemplate(bodyTemplate, values, { escapeValues: true, fallbacks });
  return {
    subject: stripLineBreaks(subject.text),
    html: compactListItems(body.text),
    empty: [...new Set([...subject.empty, ...body.empty])],
    unknown: [...new Set([...subject.unknown, ...body.unknown])],
  };
}

export interface UnknownToken {
  raw: string;
  key: string;
  suggestion: string | null;
}

export interface TemplateAnalysis {
  /** Field keys the template references. */
  used: string[];
  unknown: UnknownToken[];
}

/** Check subject + body against the available fields before sending. */
export function analyzeTemplate(templates: string[], fields: FieldDef[]): TemplateAnalysis {
  const known = fields.map((f) => f.key);
  const knownSet = new Set(known);
  const used = new Set<string>();
  const unknown = new Map<string, UnknownToken>();

  for (const template of templates) {
    for (const token of findTokens(template)) {
      if (knownSet.has(token.key)) {
        used.add(token.key);
      } else if (!unknown.has(token.key)) {
        unknown.set(token.key, {
          raw: token.raw,
          key: token.key,
          suggestion: suggestKey(token.key, known),
        });
      }
    }
  }
  return { used: [...used], unknown: [...unknown.values()] };
}
