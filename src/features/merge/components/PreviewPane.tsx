"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useRef } from "react";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { EASE_OUT, gsap, stepIndex, useMotion } from "@/lib/motion";
import type { MergedRow } from "../compose";
import { useMergeStore } from "../store";

interface Props {
  rows: MergedRow[];
  from: string;
  replyTo: string;
  /** Leave out the "Preview" heading when a dialog already has one. */
  hideTitle?: boolean;
  /** Height class for the message body. */
  frameClass?: string;
}

const FRAME_STYLE =
  "<style>body{margin:0;padding:16px;font:14px/1.55 Arial,Helvetica,sans-serif;color:#202124;word-wrap:break-word}p{margin:0 0 1em}a{color:#1a0dab}</style>";

export function PreviewPane({ rows, from, replyTo, hideTitle = false, frameClass = "h-72" }: Props) {
  const previewId = useMergeStore((s) => s.previewId);
  const setPreviewId = useMergeStore((s) => s.setPreviewId);
  const card = useRef<HTMLDivElement>(null);

  const index = Math.max(0, rows.findIndex((r) => r.recipient.id === previewId));
  const current = rows[index];

  const srcDoc = useMemo(() => (current ? `${FRAME_STYLE}${current.message.html}` : ""), [current]);

  useMotion(
    ({ reduce }) => {
      if (reduce || !current) return;
      gsap.fromTo(card.current, { autoAlpha: 0.4, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: EASE_OUT });
    },
    { scope: card, dependencies: [current?.recipient.id] },
  );

  if (!current) return <p className="text-sm text-ink-3">No recipients to preview.</p>;

  const step = (delta: number) => setPreviewId(rows[stepIndex(index, delta, rows.length)].recipient.id);

  return (
    <section aria-labelledby="preview-title" className="max-sm:min-w-0">
      <div className={`flex flex-wrap items-center gap-3 ${hideTitle ? "justify-end" : "justify-between"}`}>
        <h3 id="preview-title" className={hideTitle ? "sr-only" : "font-display text-lg font-semibold tracking-[-0.02em]"}>
          Preview
        </h3>
        <div className="flex items-center gap-1 max-sm:w-full">
          <button
            type="button"
            aria-label="Previous recipient"
            onClick={() => step(-1)}
            className="grid size-8 max-sm:size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-line-strong bg-sheet transition-colors hover:border-kite-ink"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <Select
            aria-label="Recipient"
            variant="pill"
            compact
            className="w-56 max-w-56 max-sm:min-w-0 max-sm:max-w-none max-sm:flex-1"
            value={current.recipient.id}
            onChange={setPreviewId}
            options={rows.map((r) => ({ value: r.recipient.id, label: r.recipient.email }))}
          />
          <span aria-live="polite" className="w-14 text-center text-xs text-ink-3 tnum">
            {index + 1} / {rows.length}
          </span>
          <button
            type="button"
            aria-label="Next recipient"
            onClick={() => step(1)}
            className="grid size-8 max-sm:size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-line-strong bg-sheet transition-colors hover:border-kite-ink"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div ref={card} className="mt-3 overflow-hidden rounded-2xl border border-line bg-white shadow-lift">
        <dl className="divide-y divide-line text-sm">
          {[
            ["From", from],
            ["Reply-To", replyTo],
            ["To", current.recipient.email],
          ].map(([term, detail]) => (
            <div key={term} className="grid grid-cols-[4.5rem_1fr] gap-2 px-4 py-1.5">
              <dt className="text-ink-3">{term}</dt>
              <dd className="min-w-0 break-words">{detail}</dd>
            </div>
          ))}
          <div className="grid grid-cols-[4.5rem_1fr] gap-2 px-4 py-2">
            <dt className="text-ink-3">Subject</dt>
            <dd className="min-w-0 break-words font-medium">{current.message.subject || <span className="text-failed">Empty</span>}</dd>
          </div>
        </dl>
        <iframe
          title={`Message preview for ${current.recipient.email}`}
          sandbox=""
          srcDoc={srcDoc}
          className={`block w-full border-t border-line bg-white ${frameClass}`}
        />
      </div>

      {current.empty.length > 0 ? (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-warn">
          <Badge tone="warn">Gap</Badge> This message has no value for
          {current.empty.map((k) => (
            <span key={k} className="font-mono text-[13px]">
              @{k}
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}
