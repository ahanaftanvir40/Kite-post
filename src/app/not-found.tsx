import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/features/landing/components/Navbar";
import { NAV_PILL } from "@/features/landing/components/navStyles";
import { NotFoundScene } from "@/features/landing/components/NotFoundScene";

export const metadata: Metadata = {
  title: "Page not found | Kitepost",
};

/** Shown for any address the app does not have, and whenever a route calls `notFound()`. */
export default function NotFound() {
  return (
    <main className="flex h-dvh min-h-[44rem] flex-col overflow-hidden bg-white max-sm:h-auto max-sm:min-h-dvh">
      <Navbar />
      <NotFoundScene>
        <p className="nf-fade font-display text-[clamp(4rem,11vw,7rem)] laptop:text-[clamp(3.5rem,8vw,5rem)] font-semibold leading-[0.85] tracking-[-0.04em] text-kite-coral tnum">
          404
        </p>
        <h1 className="nf-fade mt-4 font-display text-balance text-[clamp(1.9rem,4.4vw,3rem)] laptop:text-[clamp(1.7rem,3.4vw,2.4rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-kite-ink">
          This page isn&rsquo;t here.
        </h1>
        <p className="nf-fade mt-3 max-w-md text-balance text-lg max-sm:text-base leading-relaxed text-ink-2">
          The link may be old, or the address has a typo. Your lists, templates and history are safe.
        </p>
        <div className="nf-fade mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className={`${NAV_PILL} h-12 px-7 text-base`}>
            Back to home
          </Link>
          <Link
            href="/app"
            className="group inline-flex h-12 items-center gap-2 rounded-full border border-line-strong bg-white px-6 text-base font-medium text-kite-ink transition-colors duration-200 hover:border-kite-ink"
          >
            Open Kitepost
            <ArrowRight aria-hidden className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
      </NotFoundScene>
    </main>
  );
}
