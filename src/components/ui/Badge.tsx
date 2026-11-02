import type { ReactNode } from "react";

export type Tone = "neutral" | "sent" | "failed" | "warn" | "postal";

const TONE: Record<Tone, string> = {
  neutral: "bg-sunk text-ink-2",
  sent: "bg-sent-wash text-sent",
  failed: "bg-failed-wash text-failed",
  warn: "bg-warn-wash text-warn",
  postal: "bg-postal-wash text-postal-deep",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
}
