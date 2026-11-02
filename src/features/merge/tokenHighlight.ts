import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { findTokens } from "@/lib/merge";

export const tokenKeysPluginKey = new PluginKey<DecorationSet>("postieTokens");

/** Matches the `@partial` the caret is sitting at the end of. */
const TRIGGER = /(?<![\w.])@(\w*)$/;

export function triggerQuery(textBeforeCaret: string): string | null {
  const match = TRIGGER.exec(textBeforeCaret);
  return match ? match[1] : null;
}

export interface FieldOption {
  key: string;
  label: string;
}

/** Filter fields for the `@` menu: prefix matches first, then substring. */
export function filterFields(fields: FieldOption[], query: string): FieldOption[] {
  const q = query.toLowerCase();
  if (!q) return fields;
  const starts = fields.filter((f) => f.key.startsWith(q));
  const contains = fields.filter((f) => !f.key.startsWith(q) && f.key.includes(q));
  return [...starts, ...contains];
}

function decorate(doc: Parameters<typeof DecorationSet.create>[0], known: Set<string>): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    for (const token of findTokens(node.text)) {
      decorations.push(
        Decoration.inline(pos + token.start, pos + token.end, {
          class: known.has(token.key) ? "tok tok-ok" : "tok tok-bad",
        }),
      );
    }
  });
  return DecorationSet.create(doc, decorations);
}

/**
 * Highlights `@token` text: blue when it matches a column, red and wavy when it
 * does not. Known keys are read through `getKeys` so the plugin never goes stale.
 */
export function createTokenHighlight(getKeys: () => string[]) {
  return Extension.create({
    name: "tokenHighlight",
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key: tokenKeysPluginKey,
          state: {
            init: (_, state) => decorate(state.doc, new Set(getKeys())),
            apply: (tr, old, _oldState, newState) =>
              tr.docChanged || tr.getMeta(tokenKeysPluginKey)
                ? decorate(newState.doc, new Set(getKeys()))
                : old,
          },
          props: {
            decorations: (state) => tokenKeysPluginKey.getState(state),
          },
        }),
      ];
    },
  });
}
