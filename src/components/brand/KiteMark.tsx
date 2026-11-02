import type { SVGProps } from "react";

/**
 * The Kitepost mark.
 *
 * One drawing, two readings: a kite, and an envelope with its flap thrown
 * open. The top triangle is the flap; the dark triangle under it is the
 * inside of the envelope; the two lower facets are its front. Geometry is on
 * a 48 x 56 grid so the kite stays crisp down to favicon size.
 */
export const KITE = {
  width: 48,
  height: 56,
  top: [24, 0],
  left: [0, 22],
  right: [48, 22],
  belly: [24, 33],
  bottom: [24, 56],
} as const;

export const KITE_COLORS = {
  flap: "#F2542D",
  inside: "#12142B",
  front: "#2B3FE6",
  frontShade: "#1E2DB0",
} as const;

export interface KiteFacets {
  flap: string;
  inside: string;
  front: string;
  frontShade: string;
}

const { top, left, right, belly, bottom } = KITE;
const pt = (p: readonly [number, number]) => `${p[0]},${p[1]}`;

/** The four facets, drawn on the 48 x 56 grid. Used inside any <svg>. */
export function KiteFacets({ colors = KITE_COLORS }: { colors?: KiteFacets }) {
  return (
    <>
      <polygon points={`${pt(left)} ${pt(belly)} ${pt(bottom)}`} fill={colors.front} />
      <polygon points={`${pt(right)} ${pt(belly)} ${pt(bottom)}`} fill={colors.frontShade} />
      <polygon points={`${pt(left)} ${pt(right)} ${pt(belly)}`} fill={colors.inside} />
      <polygon points={`${pt(top)} ${pt(left)} ${pt(right)}`} fill={colors.flap} />
    </>
  );
}

/** The standalone mark, with its tail. */
export function KiteMark({ title, ...props }: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg viewBox="-4 -2 56 80" fill="none" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title ? <title>{title}</title> : null}
      <path d="M24 56 C 24 64, 33 63, 33 70 S 28 77, 31 80" stroke="#12142B" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M30.2 63.6 l-4.2 -2.2 l0 5.4 z M30.2 63.6 l4.2 -2.2 l0 5.4 z" fill="#F2542D" transform="translate(2 2)" />
      <KiteFacets />
    </svg>
  );
}

/** The mark alone, no tail: seals, favicons, anywhere small. */
export function KiteGlyph({ colors, ...props }: SVGProps<SVGSVGElement> & { colors?: KiteFacets }) {
  return (
    <svg viewBox="0 0 48 56" fill="none" aria-hidden {...props}>
      <KiteFacets colors={colors} />
    </svg>
  );
}
