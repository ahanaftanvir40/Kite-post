"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import type { RefObject } from "react";

gsap.registerPlugin(useGSAP, ScrollToPlugin);

export { gsap };

export const EASE_OUT = "expo.out";

export interface MotionContext {
  /** True when the visitor asked for reduced motion: set end states, do not travel. */
  reduce: boolean;
}

interface UseMotionOptions {
  scope: RefObject<HTMLElement | null>;
  dependencies?: unknown[];
}

/**
 * `useGSAP` plus `gsap.matchMedia()`: the callback always runs, and learns
 * whether motion should be skipped. Everything created inside is reverted on
 * unmount or when the dependencies change.
 */
export function useMotion(callback: (motion: MotionContext) => void, { scope, dependencies = [] }: UseMotionOptions) {
  useGSAP(
    () => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        callback({ reduce: true });
        return;
      }
      const mm = gsap.matchMedia();
      mm.add(
        { ok: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" },
        (context) => {
          callback({ reduce: Boolean(context.conditions?.reduce) });
        },
      );
      return () => mm.revert();
    },
    { scope, dependencies, revertOnUpdate: true },
  );
}

/** Map done/total onto a 0..1 bar fill. */
export function progressFraction(done: number, total: number): number {
  if (total <= 0) return 0;
  return gsap.utils.clamp(0, 1, done / total);
}

/** Cycle through `length` items, wrapping at both ends. */
export function stepIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return gsap.utils.wrap(0, length, current + delta);
}
