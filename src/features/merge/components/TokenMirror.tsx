import type { Ref } from "react";
import { findTokens } from "@/lib/merge";

// A shadow, not padding, grows the pill, so no glyph moves.
const OK = "rounded bg-postal-wash shadow-[0_0_0_2px_var(--color-postal-wash)]";
const BAD =
  "rounded bg-failed-wash shadow-[0_0_0_2px_var(--color-failed-wash)] underline decoration-wavy decoration-failed underline-offset-[3px]";

/**
 * Paints the highlight behind a text input's own text. An input cannot colour part of what it
 * holds, so this draws the same text, invisibly, with a tinted pill behind each `@token`: blue when
 * it names a column, red and wavy when it does not. It adds no padding or font change, so every
 * glyph lines up with the input on top of it.
 */
export function TokenMirror({ text, known, innerRef }: { text: string; known: Set<string>; innerRef: Ref<HTMLSpanElement> }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const token of findTokens(text)) {
    if (token.start > at) parts.push(text.slice(at, token.start));
    parts.push(
      <span key={token.start} data-token-state={known.has(token.key) ? "ok" : "bad"} className={known.has(token.key) ? OK : BAD}>
        {text.slice(token.start, token.end)}
      </span>,
    );
    at = token.end;
  }
  if (at < text.length) parts.push(text.slice(at));

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center overflow-hidden rounded-stamp border border-transparent px-3 text-sm max-sm:text-base"
    >
      <span ref={innerRef} className="whitespace-pre text-transparent">
        {parts}
      </span>
    </div>
  );
}
