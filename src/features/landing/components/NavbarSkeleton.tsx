import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { Skeleton } from "@/components/ui/Skeleton";

/** The navbar's frame without the session lookup, for loading screens. Same height and widths as `Navbar`. */
export function NavbarSkeleton() {
  return (
    <header className="relative z-20">
      <nav aria-label="Main" className="mx-auto flex h-20 laptop:h-16 max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
        <Link href="/" aria-label="Kitepost home" className="shrink-0 rounded-md max-sm:py-2.5">
          <Wordmark size="lg" />
        </Link>
        <Skeleton className="h-11 w-28 rounded-full max-sm:w-24" />
      </nav>
    </header>
  );
}
