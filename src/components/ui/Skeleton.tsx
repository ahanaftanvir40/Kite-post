import type { CSSProperties } from "react";

/** A quiet placeholder block. Decorative: pair it with a labelled `role="status"` wrapper. */
export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={`skeleton block ${className}`} style={style} />;
}

const ROW_WIDTHS = ["w-3/4", "w-1/2", "w-2/3"] as const;

/** Stand-in lines for a list or panel that is still loading. Announces `label` to screen readers. */
export function LoadingRows({ label, rows = 2, className = "" }: { label: string; rows?: number; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={`space-y-2.5 ${className}`}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={`h-4 ${ROW_WIDTHS[i % ROW_WIDTHS.length]}`} />
      ))}
    </div>
  );
}
