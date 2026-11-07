import { Skeleton } from "@/components/ui/Skeleton";
import { NavbarSkeleton } from "@/features/landing/components/NavbarSkeleton";

/** The landing while it loads: the navbar frame, the headline's shape, and the cobalt arch the hero sits on. */
export default function Loading() {
  return (
    <main
      role="status"
      aria-busy="true"
      className="flex h-dvh min-h-[44rem] flex-col overflow-hidden bg-white max-sm:h-auto max-sm:min-h-dvh"
    >
      <span className="sr-only">Loading Kitepost</span>
      <NavbarSkeleton />
      <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="relative z-10 mx-auto flex w-full max-w-[70rem] flex-col items-center px-5 pt-8 sm:px-8 sm:pt-[clamp(6.5rem,12vh,9rem)] laptop:pt-[clamp(1.75rem,5vh,3rem)]">
          <Skeleton className="h-[clamp(2.4rem,6vw,4.4rem)] w-full max-w-[44rem] rounded-xl" />
          <Skeleton className="mt-3 h-[clamp(2.4rem,6vw,4.4rem)] w-3/5 max-w-[26rem] rounded-xl" />
          <Skeleton className="mt-6 h-5 w-full max-w-md" />
          <Skeleton className="mt-8 h-14 laptop:h-11 w-52 rounded-full" />
        </div>
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 top-[58%] bg-kite-cobalt"
          style={{ borderTopLeftRadius: "50% 7rem", borderTopRightRadius: "50% 7rem" }}
        />
      </section>
    </main>
  );
}
