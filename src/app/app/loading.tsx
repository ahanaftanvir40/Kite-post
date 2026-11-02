import { Skeleton } from "@/components/ui/Skeleton";
import { NavbarSkeleton } from "@/features/landing/components/NavbarSkeleton";

const STEP_COUNT = 4;

/** The workspace while it loads: navbar, tool tabs, the four step pills, and a panel, in the real layout's positions. */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="flex min-h-dvh flex-col">
      <span className="sr-only">Loading your workspace</span>
      <div className="bg-sheet">
        <NavbarSkeleton />
      </div>

      <div className="flex flex-1 flex-col">
        <div className="border-b border-line bg-sheet">
          <div className="mx-auto flex max-w-6xl gap-1 px-4 pt-3 sm:px-6">
            <div className="flex h-10 max-sm:h-11 items-center px-4">
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex h-10 max-sm:h-11 items-center px-4">
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        </div>

        <div className="border-b border-line bg-sheet">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 pb-5 pt-10 max-sm:pt-6 sm:px-6 sm:pt-14">
            <div className="flex items-center gap-1.5 max-sm:w-full max-sm:justify-center max-sm:gap-1">
              {Array.from({ length: STEP_COUNT }, (_, i) => (
                <Skeleton key={i} className="h-10 max-sm:h-11 w-28 max-sm:w-[4.5rem] rounded-full max-sm:first:w-28" />
              ))}
            </div>
          </div>
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 max-sm:py-5 sm:px-6">
          <div className="rounded-stamp border border-line bg-sheet p-6 max-sm:p-4">
            <Skeleton className="h-7 w-48 max-w-full" />
            <Skeleton className="mt-3 h-4 w-full max-w-lg" />
            <Skeleton className="mt-2 h-4 w-2/3 max-w-sm" />
            <Skeleton className="mt-8 h-40 w-full rounded-stamp" />
            <div className="mt-6 flex gap-3">
              <Skeleton className="h-9 max-sm:h-11 w-32 rounded-full" />
              <Skeleton className="h-9 max-sm:h-11 w-24 rounded-full" />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
