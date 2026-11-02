import { KiteGlyph } from "@/components/brand/KiteMark";

const SIZE = {
  md: { glyph: "h-7", name: "text-[1.45rem]", gap: "gap-2.5" },
  /** The navbar size, used on every page so the brand never changes scale between them. */
  lg: { glyph: "h-9", name: "text-[1.85rem]", gap: "gap-3" },
} as const;

/** Kite glyph plus the Kitepost name, set in the display face. */
export function Wordmark({ className = "", size = "md" }: { className?: string; size?: keyof typeof SIZE }) {
  const s = SIZE[size];
  return (
    <span className={`inline-flex items-center ${s.gap} ${className}`}>
      <KiteGlyph className={`${s.glyph} w-auto`} />
      <span className={`font-display ${s.name} font-semibold leading-none tracking-[-0.03em] text-kite-ink`}>Kitepost</span>
    </span>
  );
}
