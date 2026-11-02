"use client";

import { useRef, type ReactNode } from "react";
import { EASE_OUT, gsap, useMotion } from "@/lib/motion";
import { Envelope } from "./Envelope";
import { Facets } from "./Hero";

const LETTER = (
  <>
    <p className="font-display text-[4.6cqw] font-semibold leading-tight tracking-[-0.02em]">Returned to sender</p>
    <p className="mt-[2.2cqw] text-[3.1cqw] leading-[1.5] text-[#444b5d]">
      We looked everywhere for this address, and nothing is delivered there.
    </p>
  </>
);

/**
 * The 404's stage: the landing's arch and envelope, with the copy (passed as children) above it.
 * One entrance, then the envelope floats. Reduced motion: nothing runs and the page sits finished.
 */
export function NotFoundScene({ children }: { children: ReactNode }) {
  const root = useRef<HTMLElement>(null);

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
        .from(q(".envelope-letter"), { yPercent: 95, duration: 1.1, ease: "back.out(1.1)" }, 1.25);

      // Once the letter is up, the envelope bobs, as if the post had just landed.
      const bob = gsap.to(q(".nf-bob"), { y: -8, rotation: 0.6, duration: 2.6, ease: "sine.inOut", repeat: -1, yoyo: true, paused: true });
      intro.call(() => void bob.play(), [], 2.4);
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
            <div className="nf-bob">
              <Envelope letter={LETTER} className="drop-shadow-[0_18px_28px_rgb(18_20_43/0.28)]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
