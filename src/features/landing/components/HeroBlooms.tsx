import type { CSSProperties, ReactNode } from "react";

/**
 * Quiet decoration for the empty flanks beside the hero copy: soft blobs with
 * flowers, sprigs and sparkles on top, all drawn in the kite palette. Purely
 * ornamental (aria-hidden), and only shown from `lg` up, where the flanks are
 * wide enough to hold it without touching the copy.
 *
 * Wrapper classes are the motion hooks: `.hero-bloom` (entrance),
 * `.hero-bloom-float` (idle drift), `.hero-spin` (slow turn of a flower).
 * Colours are literal hex so SVG fills never depend on CSS variables.
 */
const COBALT = "#2B3FE6";
const COBALT_DEEP = "#1E2DB0";
const CORAL = "#F2542D";
const INK = "#12142B";
const PAPER = "#F6F1E4";
const WASH = "#E6EAFE";
const BUTTER = "#FFD9A8";

const BLOB_A = "M104 14 C152 10 196 52 186 102 C178 142 140 190 94 184 C46 178 8 140 16 92 C24 46 62 18 104 14Z";
const BLOB_B = "M96 20 C140 4 190 40 184 94 C180 132 160 176 112 186 C64 196 14 160 16 108 C18 66 48 32 96 20Z";
const SPARKLE = "M50 0 C52 30 70 48 100 50 C70 52 52 70 50 100 C48 70 30 52 0 50 C30 48 48 30 50 0Z";

function Blob({ d, fill }: { d: string; fill: string }) {
  return (
    <svg viewBox="0 0 200 200" className="block h-auto w-full">
      <path d={d} fill={fill} />
    </svg>
  );
}

/** Eight rounded petals around a round core. */
function Daisy({ petal, core, eye }: { petal: string; core: string; eye: string }) {
  return (
    <svg viewBox="0 0 100 100" className="hero-spin block h-auto w-full">
      {Array.from({ length: 8 }, (_, i) => (
        <ellipse key={i} cx="50" cy="23" rx="10.5" ry="21" fill={petal} transform={`rotate(${i * 45} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="14" fill={core} />
      <circle cx="50" cy="50" r="5" fill={eye} />
    </svg>
  );
}

/** Five round petals, like a child's drawing of a flower. */
function Pinwheel({ petal, core }: { petal: string; core: string }) {
  return (
    <svg viewBox="0 0 100 100" className="hero-spin block h-auto w-full">
      {Array.from({ length: 5 }, (_, i) => (
        <circle key={i} cx="50" cy="26" r="18" fill={petal} transform={`rotate(${i * 72} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="11" fill={core} />
    </svg>
  );
}

function Sparkle({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 100 100" className="hero-spin block h-auto w-full">
      <path d={SPARKLE} fill={fill} />
    </svg>
  );
}

function Dot({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 10 10" className="block h-auto w-full">
      <circle cx="5" cy="5" r="5" fill={fill} />
    </svg>
  );
}

/** A leaning stem with paired leaves. */
function Sprig({ stem, leaf }: { stem: string; leaf: string }) {
  return (
    <svg viewBox="0 0 60 120" className="block h-auto w-full">
      <path d="M30 118 C26 84 36 52 30 10" fill="none" stroke={stem} strokeWidth="3" strokeLinecap="round" />
      <path d="M29 92 C12 90 6 76 8 64 C22 66 30 78 29 92Z" fill={leaf} />
      <path d="M32 74 C48 72 54 58 52 46 C38 48 30 60 32 74Z" fill={leaf} />
      <path d="M30 50 C16 48 12 36 14 26 C26 28 32 38 30 50Z" fill={leaf} />
      <path d="M31 32 C42 30 46 20 44 12 C34 14 30 22 31 32Z" fill={leaf} />
    </svg>
  );
}

function Bloom({ style, float = true, children }: { style: CSSProperties; float?: boolean; children: ReactNode }) {
  return (
    <span className="hero-bloom absolute block" style={style}>
      <span className={`block ${float ? "hero-bloom-float" : ""}`}>{children}</span>
    </span>
  );
}

export function HeroBlooms() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden lg:block">
      {/* Left flank */}
      <Bloom style={{ left: "-3%", top: "34%", width: "18%" }} float={false}>
        <Blob d={BLOB_A} fill={PAPER} />
      </Bloom>
      <Bloom style={{ left: "5%", top: "39%", width: "8%" }}>
        <Daisy petal={CORAL} core={COBALT} eye={BUTTER} />
      </Bloom>
      <Bloom style={{ left: "14%", top: "53%", width: "5%" }}>
        <Pinwheel petal={COBALT} core={BUTTER} />
      </Bloom>
      <Bloom style={{ left: "10.5%", top: "56%", width: "3.4%" }}>
        <Sprig stem={COBALT_DEEP} leaf={COBALT_DEEP} />
      </Bloom>
      <Bloom style={{ left: "3.2%", top: "58%", width: "2.2%" }}>
        <Sparkle fill={INK} />
      </Bloom>
      <Bloom style={{ left: "18.5%", top: "43%", width: "0.9%" }}>
        <Dot fill={CORAL} />
      </Bloom>
      <Bloom style={{ left: "1.5%", top: "34%", width: "1.2%" }}>
        <Dot fill={COBALT} />
      </Bloom>

      {/* Right flank, varied so the two sides do not mirror */}
      <Bloom style={{ right: "-3%", top: "36%", width: "17%" }} float={false}>
        <Blob d={BLOB_B} fill={WASH} />
      </Bloom>
      <Bloom style={{ right: "6.5%", top: "40%", width: "7%" }}>
        <Daisy petal={COBALT} core={CORAL} eye={BUTTER} />
      </Bloom>
      <Bloom style={{ right: "14.5%", top: "55%", width: "5.2%" }}>
        <Pinwheel petal={CORAL} core={INK} />
      </Bloom>
      <Bloom style={{ right: "3.4%", top: "57%", width: "3.2%" }}>
        <Sprig stem={CORAL} leaf={CORAL} />
      </Bloom>
      <Bloom style={{ right: "19.5%", top: "41%", width: "2.4%" }}>
        <Sparkle fill={COBALT} />
      </Bloom>
      <Bloom style={{ right: "2%", top: "35%", width: "1%" }}>
        <Dot fill={INK} />
      </Bloom>
    </div>
  );
}
