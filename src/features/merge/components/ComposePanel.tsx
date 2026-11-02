"use client";

import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Code, Eye, Italic, List } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/TextField";
import { EASE_OUT, gsap, useMotion } from "@/lib/motion";
import { analyze, fieldsFor } from "../compose";
import { activeSheet, sendableRecipients, useMergeStore } from "../store";
import { PreviewModal } from "./PreviewModal";
import { SavedTemplates } from "./SavedTemplates";
import {
  createTokenHighlight,
  filterFields,
  tokenKeysPluginKey,
  triggerQuery,
  type FieldOption,
} from "../tokenHighlight";

interface Menu {
  query: string;
  left: number;
  top: number;
}

export function ComposePanel() {
  const store = useMergeStore();
  const { subject, body, fallbacks } = store;
  const sheet = activeSheet(store);
  const fields = useMemo(() => fieldsFor(sheet?.headers ?? []), [sheet]);
  const analysis = useMemo(() => analyze(subject, body, fields), [subject, body, fields]);
  const sample = sendableRecipients(store)[0]?.values ?? store.recipients[0]?.values ?? {};

  const keysRef = useRef<string[]>([]);
  const fieldsRef = useRef<FieldOption[]>([]);

  const [source, setSource] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [active, setActive] = useState(0);
  const menuRef = useRef<Menu | null>(null);
  const activeRef = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const options = menu ? filterFields(fields, menu.query) : [];
  const optionsRef = useRef<FieldOption[]>([]);

  // TipTap's handlers outlive a render, so they read the latest values from
  // refs that are refreshed after every commit (never during render).
  useEffect(() => {
    keysRef.current = fields.map((f) => f.key);
    fieldsRef.current = fields;
    menuRef.current = menu;
    activeRef.current = active;
    optionsRef.current = options;
  });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, horizontalRule: false, strike: false }),
      Placeholder.configure({ placeholder: "Write your message. Type @ to insert a column." }),
      // The getter runs inside ProseMirror transactions, not during render.
      // eslint-disable-next-line react-hooks/refs
      createTokenHighlight(() => keysRef.current),
    ],
    content: body,
    editorProps: {
      attributes: { "aria-label": "Message body", role: "textbox", "aria-multiline": "true" },
      handleKeyDown: (_view, event) => {
        if (!menuRef.current || optionsRef.current.length === 0) return false;
        const list = optionsRef.current;
        if (event.key === "ArrowDown") {
          setActive((activeRef.current + 1) % list.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          setActive((activeRef.current - 1 + list.length) % list.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          accept(list[Math.min(activeRef.current, list.length - 1)]);
          return true;
        }
        if (event.key === "Escape") {
          setMenu(null);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      store.setBody(e.isEmpty ? "" : e.getHTML());
      refreshMenu();
    },
    onSelectionUpdate: () => refreshMenu(),
    onBlur: () => setMenu(null),
  });

  function refreshMenu() {
    if (!editor || !frame.current) return;
    const { $from, empty } = editor.state.selection;
    if (!empty) return setMenu(null);
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
    const query = triggerQuery(before);
    if (query === null || filterFields(fieldsRef.current, query).length === 0) return setMenu(null);
    const coords = editor.view.coordsAtPos($from.pos);
    const box = frame.current.getBoundingClientRect();
    setActive(0);
    setMenu({ query, left: Math.max(0, coords.left - box.left), top: coords.bottom - box.top + 4 });
  }

  function accept(option: FieldOption) {
    if (!editor || !menuRef.current) return;
    const { $from } = editor.state.selection;
    const from = $from.pos - menuRef.current.query.length - 1;
    editor.chain().focus().insertContentAt({ from, to: $from.pos }, `@${option.key} `).run();
    setMenu(null);
  }

  // Keep the editor in step with store changes it did not originate (sample data, reset).
  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (current !== body) editor.commands.setContent(body, { emitUpdate: false });
  }, [editor, body]);

  // Re-colour tokens when the available columns change.
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta(tokenKeysPluginKey, true));
  }, [editor, fields]);

  useMotion(
    ({ reduce }) => {
      if (reduce) return;
      gsap.from(".compose-col", { autoAlpha: 0, y: 12, duration: 0.5, ease: EASE_OUT, stagger: 0.08, clearProps: "all" });
    },
    { scope: root },
  );

  const usedFields = fields.filter((f) => analysis.used.includes(f.key));

  function insertToken(key: string) {
    if (source) {
      store.setBody(`${body}@${key} `);
      return;
    }
    editor?.chain().focus().insertContent(`@${key} `).run();
  }

  const tool = (label: string, icon: React.ReactNode, on: boolean, run: () => void) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={`grid size-8 max-sm:size-11 cursor-pointer place-items-center rounded-stamp ${on ? "bg-postal-wash text-postal-deep" : "text-ink-2 hover:bg-sunk"}`}
    >
      {icon}
    </button>
  );

  if (fields.length === 0) {
    return (
      <div className="max-w-xl">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.025em]">Write your message</h2>
        <p className="mt-2 text-sm text-ink-2">Add a recipients file first so the template knows which columns exist.</p>
        <Button className="mt-4" variant="primary" onClick={() => store.setStep("recipients")}>
          Go to recipients
        </Button>
      </div>
    );
  }

  return (
    <div ref={root} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <section className="compose-col min-w-0" aria-labelledby="compose-title">
        <h2 id="compose-title" className="font-display text-2xl font-semibold tracking-[-0.025em]">
          Write your message
        </h2>

        <label className="mt-4 block text-sm font-medium" htmlFor="subject">
          Subject
        </label>
        <input
          id="subject"
          className={`${inputClass} mt-1`}
          value={subject}
          onChange={(e) => store.setSubject(e.target.value)}
          placeholder="A quick hello, @firstname"
          spellCheck
        />

        <div className="mt-4 flex items-center justify-between">
          <span id="body-label" className="text-sm font-medium">
            Message
          </span>
          <div className="flex items-center gap-0.5">
            {!source && editor ? (
              <>
                {tool("Bold", <Bold className="size-4" aria-hidden />, editor.isActive("bold"), () => editor.chain().focus().toggleBold().run())}
                {tool("Italic", <Italic className="size-4" aria-hidden />, editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run())}
                {tool("Bulleted list", <List className="size-4" aria-hidden />, editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run())}
              </>
            ) : null}
            {tool("Edit HTML source", <Code className="size-4" aria-hidden />, source, () => setSource((v) => !v))}
          </div>
        </div>

        <div ref={frame} className="relative mt-1 rounded-stamp border border-line-strong bg-sheet px-3.5 py-3 focus-within:border-postal">
          {source ? (
            <textarea
              aria-labelledby="body-label"
              className="block min-h-60 w-full resize-y bg-transparent font-mono text-[13px] max-sm:text-base leading-relaxed outline-none"
              value={body}
              onChange={(e) => store.setBody(e.target.value)}
              spellCheck={false}
            />
          ) : (
            <EditorContent editor={editor} />
          )}

          {menu && options.length > 0 ? (
            <ul
              role="listbox"
              aria-label="Columns"
              style={{ left: menu.left, top: menu.top }}
              className="absolute z-20 w-60 max-sm:left-0! max-sm:right-0 max-sm:w-auto overflow-hidden rounded-stamp border border-line-strong bg-sheet py-1 shadow-lift"
            >
              {options.slice(0, 8).map((o, i) => (
                <li
                  key={o.key}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    accept(o);
                  }}
                  className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 text-sm ${i === active ? "bg-postal-wash" : ""}`}
                >
                  <span className="font-mono text-[13px] text-postal-deep">@{o.key}</span>
                  <span className="truncate text-xs text-ink-3">{o.label}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {analysis.unknown.length > 0 ? (
          <ul role="alert" className="mt-3 space-y-1 text-sm text-failed">
            {analysis.unknown.map((u) => (
              <li key={u.key}>
                <span className="font-mono">@{u.raw}</span> matches no column.
                {u.suggestion ? (
                  <>
                    {" "}
                    Did you mean <span className="font-mono">@{u.suggestion}</span>?
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={store.recipients.length === 0}
            onClick={() => setPreviewing(true)}
            icon={<Eye className="size-4" aria-hidden />}
          >
            Preview
          </Button>
          <Button
            variant="primary"
            disabled={!subject.trim() || analysis.unknown.length > 0}
            onClick={() => store.setStep("send")}
          >
            Continue to review
          </Button>
        </div>
        {previewing ? <PreviewModal onClose={() => setPreviewing(false)} /> : null}
      </section>

      <aside className="compose-col space-y-6" aria-label="Columns and fallbacks">
        <section>
          <h3 className="text-sm font-semibold">Columns</h3>
          <p className="mt-0.5 text-xs text-ink-3">Click to insert at the cursor.</p>
          <ul className="mt-2 divide-y divide-line rounded-stamp border border-line bg-sheet">
            {fields.map((f) => (
              <li key={f.key}>
                <button
                  type="button"
                  onClick={() => insertToken(f.key)}
                  className="flex w-full cursor-pointer flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-postal-wash"
                  aria-label={`Insert @${f.key}`}
                >
                  <span className="font-mono text-[13px] text-postal-deep">@{f.key}</span>
                  <span className="max-w-full truncate text-xs text-ink-3">{sample[f.key] || "no sample value"}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {usedFields.length > 0 ? (
          <section>
            <h3 className="text-sm font-semibold">If a cell is empty</h3>
            <p className="mt-0.5 text-xs text-ink-3">Used instead of a blank, e.g. “there” for a missing first name.</p>
            <div className="mt-2 space-y-2">
              {usedFields.map((f) => (
                <label key={f.key} className="block text-sm">
                  <span className="font-mono text-[13px]">@{f.key}</span>
                  <input
                    className={`${inputClass} mt-1 h-9`}
                    value={fallbacks[f.key] ?? ""}
                    onChange={(e) => store.setFallback(f.key, e.target.value)}
                    placeholder="Leave blank for none"
                  />
                </label>
              ))}
            </div>
          </section>
        ) : null}

        <SavedTemplates />
      </aside>
    </div>
  );
}
