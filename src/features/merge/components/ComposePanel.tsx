"use client";

import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, getMarkRange, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Code, ExternalLink, Eye, Italic, Link2, List, Pencil, Unlink } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/TextField";
import { EASE_OUT, gsap, useMotion } from "@/lib/motion";
import { analyze, fieldsFor } from "../compose";
import { normalizeLinkUrl } from "../linkUrl";
import { activeSheet, sendableRecipients, useMergeStore } from "../store";
import { PreviewModal } from "./PreviewModal";
import { SavedTemplates } from "./SavedTemplates";
import { TokenMirror } from "./TokenMirror";
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

/** The small card under a link: read it (and open it), or edit it. */
interface LinkCard {
  mode: "view" | "edit";
  href: string;
  /** The text range the link covers, or the selection a new link will cover. May be empty. */
  from: number;
  to: number;
  left: number;
  top: number;
}

const MENU_LIMIT = 8;

/** The `@` suggestions: the columns that match what has been typed so far. */
function ColumnMenu({
  id,
  options,
  active,
  onPick,
  style,
}: {
  id?: string;
  options: FieldOption[];
  active: number;
  onPick: (option: FieldOption) => void;
  style: React.CSSProperties;
}) {
  return (
    <ul
      id={id}
      role="listbox"
      aria-label="Columns"
      style={style}
      className="absolute z-20 w-60 max-sm:left-0! max-sm:right-0 max-sm:w-auto overflow-hidden rounded-stamp border border-line-strong bg-sheet py-1 shadow-lift"
    >
      {options.slice(0, MENU_LIMIT).map((o, i) => (
        <li
          key={o.key}
          role="option"
          aria-selected={i === active}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(o);
          }}
          className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 text-sm ${i === active ? "bg-postal-wash" : ""}`}
        >
          <span className="font-mono text-[13px] text-postal-deep">@{o.key}</span>
          <span className="truncate text-xs text-ink-3">{o.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** Where to hang a card under `pos`, relative to the editor frame. */
function anchorFor(editor: Editor, frame: HTMLElement, pos: number): { left: number; top: number } {
  try {
    const coords = editor.view.coordsAtPos(pos);
    const box = frame.getBoundingClientRect();
    return { left: Math.max(0, coords.left - box.left), top: coords.bottom - box.top + 6 };
  } catch {
    return { left: 0, top: 36 };
  }
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
  const subjectInput = useRef<HTMLInputElement>(null);
  const subjectMirror = useRef<HTMLSpanElement>(null);
  const [subjectMenu, setSubjectMenu] = useState<{ query: string } | null>(null);
  const [subjectActive, setSubjectActive] = useState(0);
  const subjectOptions = subjectMenu ? filterFields(fields, subjectMenu.query) : [];
  const [card, setCard] = useState<LinkCard | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftHref, setDraftHref] = useState("");
  const cardEl = useRef<HTMLDivElement>(null);
  const openLinkRef = useRef<() => void>(() => undefined);
  const viewLinkRef = useRef<(pos: number) => boolean>(() => false);
  const closeCardRef = useRef<() => void>(() => undefined);

  // TipTap's handlers outlive a render, so they read the latest values from
  // refs that are refreshed after every commit (never during render).
  useEffect(() => {
    keysRef.current = fields.map((f) => f.key);
    fieldsRef.current = fields;
    menuRef.current = menu;
    activeRef.current = active;
    optionsRef.current = options;
    openLinkRef.current = openLink;
    viewLinkRef.current = viewLinkAt;
    closeCardRef.current = () => setCard(null);
  });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // A click on a link opens its card (open / edit / remove) instead of navigating away mid-edit.
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: { openOnClick: false, defaultProtocol: "https" },
      }),
      Placeholder.configure({ placeholder: "Write your message. Type @ to insert a column." }),
      // The getter runs inside ProseMirror transactions, not during render.
      createTokenHighlight(() => keysRef.current),
    ],
    content: body,
    editorProps: {
      attributes: { "aria-label": "Message body", role: "textbox", "aria-multiline": "true" },
      handleDOMEvents: {
        click: (view, event) => {
          const anchor = (event.target as HTMLElement).closest("a");
          // Position comes from the clicked element, so it holds wherever the link wraps.
          const opened = anchor ? viewLinkRef.current(view.posAtDOM(anchor, 0) + 1) : false;
          if (!opened) closeCardRef.current();
          // Ctrl or Cmd plus click goes straight to the page, like in Gmail.
          const href = anchor?.getAttribute("href");
          if (opened && href && (event.metaKey || event.ctrlKey)) window.open(href, "_blank", "noopener,noreferrer");
          return false;
        },
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          openLinkRef.current();
          return true;
        }
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
      // Typing moves the text out from under a card that is only reading a link.
      setCard((c) => (c?.mode === "view" ? null : c));
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

  /** Where the link under `pos` starts and ends, and where it points. Null when `pos` is not in a link. */
  function linkAt(pos: number): { from: number; to: number; href: string } | null {
    if (!editor) return null;
    const type = editor.schema.marks.link;
    const range = type ? getMarkRange(editor.state.doc.resolve(pos), type) : undefined;
    if (!range) return null;
    const href = editor.state.doc.nodeAt(range.from)?.marks.find((m) => m.type === type)?.attrs.href as string | undefined;
    return { from: range.from, to: range.to, href: href ?? "" };
  }

  /** Show the read-only card for the link under `pos`. Returns false when there is none. */
  function viewLinkAt(pos: number): boolean {
    const link = linkAt(pos);
    if (!link || !editor || !frame.current) return false;
    setMenu(null);
    setCard({ mode: "view", ...link, ...anchorFor(editor, frame.current, link.from) });
    return true;
  }

  /** Open the editing card: for the link under the caret, or for the selection (or caret) a new link will use. */
  function openLink() {
    if (!editor || !frame.current) return;
    setMenu(null);
    const { from, to, empty, $from } = editor.state.selection;
    const link = empty ? linkAt($from.pos) : linkAt(from);
    const range = link ? { from: link.from, to: link.to } : { from, to };
    setDraftHref(link?.href ?? "");
    setDraftText(editor.state.doc.textBetween(range.from, range.to));
    setCard({ mode: "edit", href: link?.href ?? "", ...range, ...anchorFor(editor, frame.current, range.from) });
  }

  function startEditing() {
    if (!card) return;
    setDraftHref(card.href);
    setDraftText(editor?.state.doc.textBetween(card.from, card.to) ?? "");
    setCard({ ...card, mode: "edit" });
  }

  function applyLink() {
    if (!editor || !card) return;
    const href = normalizeLinkUrl(draftHref);
    if (!href) return;
    const original = editor.state.doc.textBetween(card.from, card.to);
    const text = draftText.trim() || original || draftHref.trim();
    const chain = editor.chain().focus();
    if (card.from === card.to || text !== original) {
      chain.insertContentAt({ from: card.from, to: card.to }, { type: "text", text, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      chain.setTextSelection({ from: card.from, to: card.to }).setLink({ href }).run();
    }
    setCard(null);
  }

  function removeLink() {
    if (!editor || !card) return;
    editor.chain().focus().setTextSelection({ from: card.from, to: card.to }).unsetLink().run();
    setCard(null);
  }

  function closeCard() {
    setCard(null);
    editor?.commands.focus();
  }

  // Clicking anywhere else dismisses the card. Clicks in the editor decide for themselves (handleClick).
  useEffect(() => {
    if (!card) return;
    const away = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (cardEl.current?.contains(target) || target.closest("[data-link-ui]") || target.closest(".ProseMirror")) return;
      setCard(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [card]);

  function accept(option: FieldOption) {
    if (!editor || !menuRef.current) return;
    const { $from } = editor.state.selection;
    const from = $from.pos - menuRef.current.query.length - 1;
    editor.chain().focus().insertContentAt({ from, to: $from.pos }, `@${option.key} `).run();
    setMenu(null);
  }

  /** A long subject scrolls inside its input; the highlight layer behind it has to scroll with it. */
  function followSubjectScroll(input: HTMLInputElement) {
    if (subjectMirror.current) subjectMirror.current.style.transform = `translateX(${-input.scrollLeft}px)`;
  }

  /** Open, move or close the subject's `@` menu to match the text before its caret. */
  function refreshSubjectMenu(input: HTMLInputElement) {
    const query = triggerQuery(input.value.slice(0, input.selectionStart ?? input.value.length));
    if (query === null || filterFields(fields, query).length === 0) return setSubjectMenu(null);
    if (query !== subjectMenu?.query) setSubjectActive(0);
    setSubjectMenu({ query });
  }

  function acceptInSubject(option: FieldOption) {
    const input = subjectInput.current;
    if (!input || !subjectMenu) return;
    const caret = input.selectionStart ?? input.value.length;
    const from = caret - subjectMenu.query.length - 1;
    const next = `${input.value.slice(0, from)}@${option.key} ${input.value.slice(caret)}`;
    store.setSubject(next);
    setSubjectMenu(null);
    const end = from + option.key.length + 2;
    // The controlled value lands on the next render; put the caret after the inserted column once it has.
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(end, end);
    });
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
        <div className="relative mt-1 rounded-stamp bg-sheet">
          <TokenMirror text={subject} known={new Set(fields.map((f) => f.key))} innerRef={subjectMirror} />
          <input
            id="subject"
            ref={subjectInput}
            className={`${inputClass} relative bg-transparent!`}
            value={subject}
            onScroll={(e) => followSubjectScroll(e.currentTarget)}
            onChange={(e) => {
              store.setSubject(e.target.value);
              refreshSubjectMenu(e.currentTarget);
              followSubjectScroll(e.currentTarget);
            }}
            onClick={(e) => refreshSubjectMenu(e.currentTarget)}
            onKeyUp={(e) => {
              if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) refreshSubjectMenu(e.currentTarget);
            }}
            onKeyDown={(e) => {
              if (!subjectMenu || subjectOptions.length === 0) return;
              const count = Math.min(subjectOptions.length, MENU_LIMIT);
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setSubjectActive((i) => (i + (e.key === "ArrowDown" ? 1 : count - 1)) % count);
              } else if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                acceptInSubject(subjectOptions[Math.min(subjectActive, count - 1)]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setSubjectMenu(null);
              }
            }}
            onBlur={() => setSubjectMenu(null)}
            placeholder="A quick hello, @firstname"
            role="combobox"
            aria-expanded={subjectMenu !== null && subjectOptions.length > 0}
            aria-controls="subject-columns"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            spellCheck
          />
          {subjectMenu && subjectOptions.length > 0 ? (
            <ColumnMenu id="subject-columns" options={subjectOptions} active={subjectActive} onPick={acceptInSubject} style={{ left: 0, top: "100%", marginTop: 4 }} />
          ) : null}
        </div>

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
                <span data-link-ui>
                  {tool("Link (Ctrl+K)", <Link2 className="size-4" aria-hidden />, card !== null || editor.isActive("link"), () => (card?.mode === "edit" ? closeCard() : openLink()))}
                </span>
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

          {!source && card ? (
            <div
              ref={cardEl}
              role="dialog"
              aria-label={card.mode === "view" ? "Link" : card.href ? "Edit link" : "Add link"}
              style={{ left: card.left, top: card.top }}
              className="absolute z-30 w-[min(22rem,100%)] max-sm:left-0! max-sm:right-0 max-sm:w-auto rounded-stamp border border-line-strong bg-sheet p-3 shadow-lift"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  closeCard();
                }
              }}
            >
              {card.mode === "view" ? (
                <div className="flex items-center gap-1">
                  <a
                    href={card.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={card.href}
                    className="min-w-0 flex-1 truncate text-sm text-postal hover:text-postal-deep max-sm:py-2.5"
                  >
                    {card.href}
                  </a>
                  <a
                    href={card.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open link in a new tab"
                    className="grid size-8 max-sm:size-11 shrink-0 place-items-center rounded-stamp text-ink-2 hover:bg-sunk hover:text-ink"
                  >
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                  <button
                    type="button"
                    aria-label="Edit link"
                    onClick={startEditing}
                    className="grid size-8 max-sm:size-11 shrink-0 cursor-pointer place-items-center rounded-stamp text-ink-2 hover:bg-sunk hover:text-ink"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Remove link"
                    onClick={removeLink}
                    className="grid size-8 max-sm:size-11 shrink-0 cursor-pointer place-items-center rounded-stamp text-ink-2 hover:bg-failed-wash hover:text-failed"
                  >
                    <Unlink className="size-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <form
                  className="space-y-2.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    applyLink();
                  }}
                >
                  <label className="block text-xs font-medium text-ink-2">
                    Text to show
                    <input
                      className={`${inputClass} mt-1 h-9`}
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      placeholder="Pick up where you left off"
                      spellCheck
                    />
                  </label>
                  <label className="block text-xs font-medium text-ink-2">
                    Link to
                    <input
                      autoFocus
                      className={`${inputClass} mt-1 h-9`}
                      value={draftHref}
                      onChange={(e) => setDraftHref(e.target.value)}
                      placeholder="example.com or https://example.com/offer"
                      inputMode="url"
                      autoCapitalize="off"
                      spellCheck={false}
                    />
                  </label>
                  <div className="flex items-center justify-between gap-2">
                    {card.href ? (
                      <Button variant="ghost" onClick={removeLink} icon={<Unlink className="size-4" aria-hidden />}>
                        Remove
                      </Button>
                    ) : (
                      <span />
                    )}
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={closeCard}>
                        Cancel
                      </Button>
                      <Button type="submit" variant="primary" disabled={!normalizeLinkUrl(draftHref)}>
                        {card.href ? "Update" : "Add"}
                      </Button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          ) : null}

          {menu && options.length > 0 ? (
            <ColumnMenu options={options} active={active} onPick={accept} style={{ left: menu.left, top: menu.top }} />
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
