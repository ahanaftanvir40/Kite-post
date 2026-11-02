"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { SquigglyText } from "@/components/ui/squiggly-text";
import { useHeroMotion } from "../motion";
import { Envelope } from "./Envelope";
import { HeroBlooms } from "./HeroBlooms";

/** Two big facets from the kite, cropped by the stage, so the field reads as the mark blown up. */
function Facets() {
  return (
    <>
      <div
        aria-hidden
        className="hero-facet absolute -left-[12%] top-[8%] h-[120%] w-[48%] bg-kite-cobalt-deep"
        style={{ clipPath: "polygon(0 0, 100% 100%, 0 100%)" }}
      />
      <div
        aria-hidden
        className="hero-facet absolute -right-[10%] top-[22%] h-[110%] w-[44%] bg-[#3A4EF0]"
        style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
      />
    </>
  );
}

export function Hero() {
  const root = useRef<HTMLElement>(null);
  useHeroMotion(root);
  return (
    <section ref={root} aria-labelledby="hero-title" className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <HeroBlooms />
      <div className="hero-copy relative z-10 mx-auto flex max-w-[70rem] flex-col items-center px-5 pt-8 text-center sm:px-8 sm:pt-[clamp(6.5rem,12vh,9rem)] laptop:pt-5">
        <h1
          id="hero-title"
          className="font-display text-balance text-[clamp(2.6rem,6.4vw,5rem)] laptop:text-[clamp(2.4rem,4.7vw,3.6rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-kite-ink"
        >
          <span className="hero-lead">Find leads. Mail merge from</span>{" "}
          <span className="hero-swash relative inline-block whitespace-nowrap">
            <SquigglyText scale={4} className="relative">
              any domain
              <svg viewBox="0 0 300 18" aria-hidden className="absolute -bottom-[0.1em] left-0 w-full overflow-visible">
                <path
                  className="hero-swash-path"
                  d="M3 11 C 48 4, 96 14, 150 8 S 252 3, 297 9"
                  fill="none"
                  stroke="var(--color-kite-coral)"
                  strokeWidth="7"
                  strokeLinecap="round"
                />
              </svg>
            </SquigglyText>
          </span>
          .
        </h1>
        <p className="hero-fade mt-5 laptop:mt-4 max-w-xl text-balance text-lg leading-relaxed text-ink-2 sm:text-xl laptop:text-lg">
          Find customers, or professors to write to. Then send them all a personal email at once, from any email address you own.
        </p>
        <p className="hero-fade mt-8 laptop:mt-6 inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-full border border-line bg-white/70 px-4 py-1.5 text-sm text-ink-3">
          <span>Gmail&rsquo;s mail merge can&rsquo;t send as an alias.</span>
          <span className="font-medium text-kite-ink">Kitepost can.</span>
        </p>
        <div className="hero-fade mt-6 laptop:mt-6 flex flex-col items-center gap-3">
          <Link
            href="/app"
            className="group inline-flex h-14 laptop:h-11 items-center gap-3 laptop:gap-2 rounded-full bg-kite-ink pl-8 laptop:pl-6 pr-6 laptop:pr-4 text-base laptop:text-sm font-medium text-white transition-colors duration-200 hover:bg-kite-cobalt"
          >
            Open Kitepost
            <ArrowRight aria-hidden className="size-5 laptop:size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
          <p className="text-sm text-ink-3">Free to use. Lead finder is in beta.</p>
        </div>
      </div>

      <div className="hero-stage relative min-h-0 flex-1 [container-type:size]">
        <div
          aria-hidden
          className="hero-arch absolute inset-x-0 bottom-0 top-[42%] overflow-hidden bg-kite-cobalt"
          style={{ borderTopLeftRadius: "50% 7rem", borderTopRightRadius: "50% 7rem" }}
        >
          <Facets />
        </div>
        {/* Sized so its visible 80% (flap tip down past the kite seal) exactly fits the stage minus a
            1.5rem gap. That way the flap can never reach the copy above, at any screen height. */}
        <div className="absolute bottom-0 left-1/2 w-[min(52rem,96cqw,calc((100cqh_-_1.5rem)*1.54))] -translate-x-1/2 translate-y-[20%]">
          <div className="hero-envelope">
            <Envelope className="drop-shadow-[0_18px_28px_rgb(18_20_43/0.28)]" />
          </div>
        </div>
      </div>
    </section>
  );
}
