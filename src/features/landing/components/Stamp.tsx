const COBALT = "#2B3FE6";
const COBALT_SOFT = "#8795F5";
const CORAL = "#F2542D";
const PAPER = "#FFF4EC";
const SKY = "#FFE2D4";

/**
 * The letter's postage: a quiet landscape in flat shapes. A coral sun sets behind two cobalt hills inside
 * a hairline frame, on warm paper with a soft shadow and a slight tilt, as if pressed on by hand.
 * It echoes the hero's arch without repeating the kite. `.stamp-paper` is the motion hook.
 */
export function Stamp({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 100"
      fill="none"
      aria-hidden
      className={`rotate-[2deg] drop-shadow-[0_1px_2px_rgb(18_20_43/0.16)] ${className}`}
    >
      <g className="stamp-paper">
        <rect width="80" height="100" rx="2.5" fill={PAPER} />
        <defs>
          <clipPath id="stamp-window">
            <rect x="8" y="8" width="64" height="84" rx="1" />
          </clipPath>
        </defs>
        <g clipPath="url(#stamp-window)">
          <rect x="8" y="8" width="64" height="84" fill={SKY} />
          <circle cx="46" cy="50" r="14" fill={CORAL} />
          <path d="M8 66 C22 54 34 58 46 64 C58 70 66 64 72 60 V92 H8 Z" fill={COBALT_SOFT} />
          <path d="M8 78 C20 68 36 70 48 77 C58 82 66 80 72 76 V92 H8 Z" fill={COBALT} />
        </g>
        <rect x="8" y="8" width="64" height="84" rx="1" stroke={COBALT} strokeWidth="0.75" />
      </g>
    </svg>
  );
}
