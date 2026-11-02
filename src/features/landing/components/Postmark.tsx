const INK = "#12142B";

/** Four wavy cancellation lines running off to the left of the ring, like a sorting machine's. */
const WAVES = [22, 34, 46, 58].map((y) => `M2 ${y} C 14 ${y - 7}, 26 ${y + 7}, 38 ${y} S 62 ${y - 7}, 76 ${y}`);

/**
 * A postmark for the corner of a letter: a double ring reading around its edge, an X where the
 * date would be, and cancellation lines. Pure geometry; sized by the width it is given.
 */
export function Postmark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 170 90" fill="none" aria-hidden className={className} style={{ opacity: 0.78 }}>
      <defs>
        <path id="postmark-ring" d="M125 45 m-33 0 a33 33 0 1 1 66 0 a33 33 0 1 1 -66 0" />
      </defs>
      {WAVES.map((d) => (
        <path key={d} d={d} stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
      ))}
      <circle cx="125" cy="45" r="40" stroke={INK} strokeWidth="2.6" />
      <circle cx="125" cy="45" r="25" stroke={INK} strokeWidth="1.4" />
      <text fill={INK} fontSize="8.6" fontWeight="700" letterSpacing="1.2" textLength="205" lengthAdjust="spacing">
        <textPath href="#postmark-ring">UNDELIVERABLE · NO SUCH ADDRESS ·</textPath>
      </text>
      <path d="M116 36 L134 54 M134 36 L116 54" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}
