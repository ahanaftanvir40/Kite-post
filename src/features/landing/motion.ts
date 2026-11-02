"use client";

import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { SplitText } from "gsap/SplitText";
import type { RefObject } from "react";
import { EASE_OUT, gsap, useMotion } from "@/lib/motion";

gsap.registerPlugin(DrawSVGPlugin, SplitText);

/**
 * The merge, performed. Each pair is a recipient row; the letter's two tokens
 * resolve into it, one row after another. Names are invented demo data.
 */
export const DEMO_ROWS: readonly (readonly [string, string])[] = [
  ["Maya", "Northwind"],
  ["Tomas", "Lumen Labs"],
  ["Noor", "Fieldnote"],
  ["Ines", "Harbor & Co"],
];

const TOKENS: readonly [string, string] = ["@firstname", "@company"];

/** Roll a token's text over: old value slides up and out, new one slides up from below. */
function rollTo(el: HTMLElement, text: string): gsap.core.Timeline {
  return gsap
    .timeline()
    .to(el, { yPercent: -60, autoAlpha: 0, duration: 0.22, ease: "power2.in" })
    .call(() => {
      el.textContent = text;
    })
    // immediateRender off: otherwise building the loop hides every token until its first turn.
    .fromTo(
      el,
      { yPercent: 60, autoAlpha: 0 },
      { yPercent: 0, autoAlpha: 1, duration: 0.45, ease: EASE_OUT, immediateRender: false },
    );
}

/**
 * One authored entrance, then a quiet loop on the letter's tokens.
 * Reduced motion: nothing here runs, so the page stays in its finished state.
 */
export function useHeroMotion(scope: RefObject<HTMLElement | null>) {
  useMotion(
    ({ reduce }) => {
      if (reduce || !scope.current) return;
      const q = gsap.utils.selector(scope);
      const heading = scope.current.querySelector<HTMLElement>("h1");
      if (!heading) return;

      const split = SplitText.create(heading, { type: "words", ignore: ".hero-swash", aria: "none" });
      const tokens = q("[data-token]") as HTMLElement[];

      // Closed, the flap lies over the pocket; once it passes vertical it drops behind it.
      gsap.set(q(".envelope-flap"), { transformOrigin: "50% 100%", transformPerspective: 1400, zIndex: 5 });

      const intro = gsap.timeline({ defaults: { ease: EASE_OUT } });
      intro
        .from(q(".hero-arch"), { yPercent: 18, autoAlpha: 0, duration: 1.1 }, 0)
        .from(q(".hero-facet"), { yPercent: 30, duration: 1.2, stagger: 0.12 }, 0.1)
        .from(split.words, { yPercent: 55, autoAlpha: 0, filter: "blur(6px)", duration: 0.9, stagger: 0.055 }, 0.15)
        .from(q(".hero-swash"), { autoAlpha: 0, duration: 0.01 }, 0.15)
        .from(q(".hero-swash-path"), { drawSVG: "0%", duration: 0.8, ease: "power2.inOut" }, 0.85)
        .from(q(".hero-fade"), { yPercent: 40, autoAlpha: 0, duration: 0.8, stagger: 0.1 }, 0.55)
        .from(q(".hero-envelope"), { yPercent: 45, duration: 1.2 }, 0.35)
        .from(q(".envelope-flap"), { rotationX: 180, duration: 1, ease: "power3.inOut" }, 0.95)
        .set(q(".envelope-flap"), { zIndex: 0 }, 1.4)
        .from(q(".envelope-letter"), { yPercent: 95, duration: 1.1, ease: "back.out(1.1)" }, 1.25);

      // The flanks: blobs and flowers pop in around the copy, then drift and turn very slowly.
      const blooms = q(".hero-bloom");
      if (blooms.length) {
        intro.from(
          blooms,
          { scale: 0, autoAlpha: 0, transformOrigin: "50% 50%", duration: 0.9, ease: "back.out(1.6)", stagger: { each: 0.06, from: "edges" } },
          0.7,
        );
        q(".hero-bloom-float").forEach((el, i) => {
          gsap.to(el, {
            y: i % 2 ? 9 : -9,
            rotation: i % 2 ? -4 : 4,
            duration: 3.2 + (i % 4) * 0.5,
            ease: "sine.inOut",
            repeat: -1,
            yoyo: true,
            delay: (i % 5) * 0.3,
          });
        });
        q(".hero-spin").forEach((el, i) => {
          gsap.to(el, { rotation: i % 2 ? -360 : 360, duration: 40 + (i % 3) * 12, ease: "none", repeat: -1, transformOrigin: "50% 50%" });
        });
      }

      // The loop starts once the letter is up, and swaps both tokens for the next row.
      const loop = gsap.timeline({ repeat: -1, paused: true, repeatDelay: 0 });
      DEMO_ROWS.forEach((row, i) => {
        const at = 1.4 + i * 2.2;
        tokens.forEach((el, t) => loop.add(rollTo(el, row[t]), at + t * 0.12));
      });
      // Close the cycle by returning to the raw tokens before restarting.
      const end = 1.4 + DEMO_ROWS.length * 2.2;
      tokens.forEach((el, t) => loop.add(rollTo(el, TOKENS[t]), end + t * 0.12));
      loop.duration(end + 1.6);
      intro.call(() => loop.play(), [], 2.4);

      // A hair of parallax on the envelope, only where there is a fine pointer.
      const envelope = q(".hero-envelope")[0] as HTMLElement | undefined;
      if (envelope && window.matchMedia("(pointer: fine)").matches) {
        const x = gsap.quickTo(envelope, "x", { duration: 0.8, ease: "power3" });
        const y = gsap.quickTo(envelope, "y", { duration: 0.8, ease: "power3" });
        const onMove = (e: PointerEvent) => {
          x(gsap.utils.mapRange(0, window.innerWidth, -10, 10, e.clientX));
          y(gsap.utils.mapRange(0, window.innerHeight, -6, 6, e.clientY));
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        return () => window.removeEventListener("pointermove", onMove);
      }
    },
    { scope },
  );
}
