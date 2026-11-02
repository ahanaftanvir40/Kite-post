"use client";

import { usePathname } from "next/navigation";
import { useRef, type CSSProperties, type ReactNode } from "react";
import { EASE_OUT, gsap, useMotion } from "@/lib/motion";
import { Envelope } from "./Envelope";
import { Facets } from "./Hero";
import { Postmark } from "./Postmark";

/** Rubber stamps land slightly crooked. Set inline so GSAP reads it as the stamp's resting rotation. */
const RUBBER_STYLE: CSSProperties = { transform: "rotate(-7deg)" };

/** Keeps a long path on one line, so the letter's text never grows into the stamp below it. */
const shortened = (path: string) => (path.length > 22 ? `${path.slice(0, 21)}…` : path);

function Letter({ address }: { address: string }) {
  return (
    <>
      <p className="font-display text-[4.6cqw] font-semibold leading-tight tracking-[-0.02em]">No such address</p>
      <p className="mt-[2.2cqw] text-[3.1cqw] leading-[1.5] text-[#444b5d]">
        We tried{" "}
        <span className="inline-block max-w-full whitespace-nowrap rounded-[0.7cqw] bg-[#FCE3DA] px-[1.3cqw] py-[0.15cqw] align-bottom font-mono text-[2.8cqw] font-medium text-[#B83A18]">
          {shortened(address)}
        </span>
        , but nothing is delivered there.
      </p>
      <p
        style={RUBBER_STYLE}
        className="nf-rubber absolute left-[20cqw] top-[24.5cqw] rounded-[0.9cqw] border-[0.55cqw] border-[#D6401B]/85 px-[2.2cqw] py-[0.9cqw] font-display text-[3.3cqw] font-bold uppercase leading-none tracking-[0.1em] text-[#D6401B]/90 mix-blend-multiply"
      >
        Return to sender
      </p>
    </>
  );
}

/**
 * The 404's stage: the landing's arch and envelope, with the copy (passed as children) above it.
 * The letter rises, then "Return to sender" is stamped onto it, and the envelope settles into a float.
 * Reduced motion: nothing runs and the page sits finished.
 */
export function NotFoundScene({ children }: { children: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  const address = usePathname() || "/";

  useMotion(
    ({ reduce }) => {
      if (reduce || !root.current) return;
      const q = gsap.utils.selector(root);

      // Closed, the flap lies over the pocket; once it passes vertical it drops behind it.
      gsap.set(q(".envelope-flap"), { transformOrigin: "50% 100%", transformPerspective: 1400, zIndex: 5 });

      const intro = gsap.timeline({ defaults: { ease: EASE_OUT } });
      intro
        .from(q(".nf-arch"), { yPercent: 18, autoAlpha: 0, duration: 1.1 }, 0)
        .from(q(".hero-facet"), { yPercent: 30, duration: 1.2, stagger: 0.12 }, 0.1)
        .from(q(".nf-fade"), { yPercent: 40, autoAlpha: 0, duration: 0.8, stagger: 0.1 }, 0.2)
        .from(q(".nf-envelope"), { yPercent: 45, duration: 1.2 }, 0.35)
        .from(q(".envelope-flap"), { rotationX: 180, duration: 1, ease: "power3.inOut" }, 0.95)
        .set(q(".envelope-flap"), { zIndex: 0 }, 1.4)
        .from(q(".envelope-letter"), { yPercent: 95, duration: 1.1, ease: "back.out(1.1)" }, 1.25)
        // The postmark is struck first, then the rubber stamp comes down hard on the letter.
        .from(q(".nf-postmark"), { autoAlpha: 0, scale: 1.25, transformOrigin: "75% 50%", duration: 0.25, ease: "power2.in" }, 2.25)
        .from(q(".nf-rubber"), { autoAlpha: 0, scale: 2.1, rotation: -18, transformOrigin: "50% 50%", duration: 0.2, ease: "power4.in" }, 2.7)
        // The thud: the whole envelope dips under the blow and springs back.
        .to(q(".nf-thud"), { y: 7, duration: 0.07, ease: "power2.out" }, 2.9)
        .to(q(".nf-thud"), { y: 0, duration: 0.5, ease: "elastic.out(1, 0.45)" }, 2.97);

      // After the stamp lands, the envelope bobs, as if the post had just been set down.
      const bob = gsap.to(q(".nf-bob"), { y: -8, rotation: 0.6, duration: 2.6, ease: "sine.inOut", repeat: -1, yoyo: true, paused: true });
      intro.call(() => void bob.play(), [], 3.5);
    },
    { scope: root },
  );

  return (
    <section ref={root} className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center px-5 pt-8 text-center sm:px-8 sm:pt-[clamp(2.5rem,7vh,5rem)] laptop:pt-3">
        {children}
      </div>

      <div className="relative min-h-0 flex-1 [container-type:size] max-sm:h-[calc(62.4vw+1.5rem)] max-sm:flex-none">
        <div
          aria-hidden
          className="nf-arch absolute inset-x-0 bottom-0 top-[42%] overflow-hidden bg-kite-cobalt"
          style={{ borderTopLeftRadius: "50% 7rem", borderTopRightRadius: "50% 7rem" }}
        >
          <Facets />
        </div>
        {/* Sized like the hero's: its visible 80% fits the stage minus a 1.5rem gap, so it never climbs into the copy. */}
        <div className="absolute bottom-0 left-1/2 w-[min(46rem,92cqw,calc((100cqh_-_1.5rem)*1.54))] -translate-x-1/2 translate-y-[20%]">
          <div className="nf-envelope">
            <div className="nf-thud">
              <div className="nf-bob">
                <Envelope
                  letter={<Letter address={address} />}
                  stamp={<Postmark className="nf-postmark absolute right-[2.5cqw] top-[2cqw] w-[22cqw] mix-blend-multiply" />}
                  className="drop-shadow-[0_18px_28px_rgb(18_20_43/0.28)]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
