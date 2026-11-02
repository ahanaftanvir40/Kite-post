import type { CSSProperties, ReactNode } from "react";
import { KiteFacets, KiteGlyph } from "@/components/brand/KiteMark";

/**
 * The hero object: an open envelope, a letter rising out of it, and a kite
 * seal where the pocket folds meet.
 *
 * One 640 x 520 grid (y runs -170..350; the pocket spans y 0..350, the open
 * flap sits above it). Layers, back to front: flap, inside, letter, pocket.
 * Colours are literal hex on purpose: SVG fills must not depend on CSS
 * variables resolving.
 *
 * The letter is real HTML, so it stays selectable and readable by assistive
 * tech. `data-token` spans are what the motion layer swaps for recipient data.
 */
const PAPER = "#F3EDDC";
const PAPER_SHADE = "#E6DEC8";
const PAPER_LIGHT = "#FBF8EE";
const INSIDE = "#D3C7A8";
const FOLD = "#CFC3A3";
const CORAL = "#F2542D";
const CORAL_DEEP = "#DB4421";

// Square top corners so the flap's base sits flush; only the bottom corners are rounded.
const BODY_PATH = "M0 0 H640 V336 Q640 350 626 350 H14 Q0 350 0 336 Z";

const STAMP_STYLE = { "--d": "8px", "--r": "2.4px" } as CSSProperties;
const TOKEN =
  "inline-block rounded-[0.7cqw] bg-[#E6EAFE] px-[1.3cqw] py-[0.15cqw] text-kite-cobalt";

/** `letter` replaces the default mail-merge demo text; it is laid out inside the same sheet of paper. */
export function Envelope({ className = "", letter }: { className?: string; letter?: ReactNode }) {
  return (
    <div className={`envelope relative aspect-[640/520] w-full [container-type:inline-size] ${className}`}>
      {/* The open flap. It swings up from behind the pocket on entrance. */}
      <div className="envelope-flap absolute inset-x-0 top-0 h-[33.27%] will-change-transform">
        <svg viewBox="0 -170 640 173" className="size-full drop-shadow-[0_-6px_12px_rgb(18_20_43/0.12)]" aria-hidden>
          <path d="M0 3 L0 0 L300 -150 Q320 -170 340 -150 L640 0 L640 3 Z" fill={CORAL} />
          <path d="M44 0 L304 -132 Q320 -144 336 -132 L596 0 Z" fill={CORAL_DEEP} />
        </svg>
      </div>

      {/* The inside of the envelope. */}
      <svg viewBox="0 -170 640 520" className="absolute inset-0 size-full" aria-hidden>
        <path d={BODY_PATH} fill={INSIDE} />
      </svg>

      {/* The letter. The wrapper hides it while it is tucked inside. */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="envelope-letter absolute left-[8.75%] right-[8.75%] top-[4.5%] h-[78.2%] rounded-[1.3cqw] bg-white pl-[5.5cqw] pr-[17cqw] pt-[5cqw] text-kite-ink will-change-transform">
          <div
            aria-hidden
            style={STAMP_STYLE}
            className="stamp-edge absolute right-[4.6cqw] top-[4.4cqw] aspect-[4/5] w-[9.2cqw] bg-[#FCE3DA] p-[1.5cqw]"
          >
            <KiteGlyph className="size-full" />
          </div>
          {letter ?? (
            <>
              <p className="font-display text-[4.6cqw] font-semibold leading-tight tracking-[-0.02em]">
                Hi{" "}
                <span data-token="firstname" className={TOKEN}>
                  @firstname
                </span>
                ,
              </p>
              <p className="mt-[2.2cqw] text-[3.1cqw] leading-[1.5] text-[#444b5d]">
                I saw what you are building at{" "}
                <span data-token="company" className={`${TOKEN} font-medium`}>
                  @company
                </span>{" "}
                and wanted to say hello properly.
              </p>
            </>
          )}
        </div>
      </div>

      {/* The pocket: three folded panels meeting at the seal. */}
      <svg
        viewBox="0 -170 640 520"
        className="pointer-events-none absolute inset-0 size-full drop-shadow-[0_16px_24px_rgb(18_20_43/0.22)]"
        aria-hidden
      >
        <defs>
          <clipPath id="envelope-pocket">
            <path d={BODY_PATH} />
          </clipPath>
        </defs>
        <g clipPath="url(#envelope-pocket)">
          <polygon points="0,0 320,200 0,350" fill={PAPER} />
          <polygon points="640,0 320,200 640,350" fill={PAPER_SHADE} />
          <polygon points="0,350 320,200 640,350" fill={PAPER_LIGHT} />
          <path d="M0 0 L320 200 L640 0 M0 350 L320 200 L640 350" stroke={FOLD} strokeWidth="1.5" fill="none" />
        </g>
        <svg x="288" y="163" width="64" height="74" viewBox="0 0 48 56">
          <KiteFacets />
        </svg>
      </svg>
    </div>
  );
}
