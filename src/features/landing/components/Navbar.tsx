import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { auth } from "@/auth";
import { Wordmark } from "@/components/brand/Wordmark";
import { AccountMenu } from "./AccountMenu";
import { NAV_PILL } from "./navStyles";
import { SignInButton } from "./SignInButton";

/** Reads the session at request time, so it streams in behind a Suspense boundary. */
async function Account({ inApp }: { inApp: boolean }) {
  // auth() draws random values before it reads the request. Prerendering (e.g. /_not-found) stops here instead.
  await connection();
  const session = await auth();
  if (!session?.user) return <SignInButton />;
  return <AccountMenu name={session.user.name ?? session.user.email ?? "You"} inApp={inApp} />;
}

/** The bar's height, set on its two ends so a row of context below can wrap without changing it. */
const ROW = "flex h-20 laptop:h-16 items-center";

interface NavbarProps {
  inApp?: boolean;
  /**
   * Something that belongs to the whole app, such as the workspace picker. It sits beside the logo
   * on wide screens and on a slim row under the bar on narrow ones. It may render nothing.
   */
  context?: ReactNode;
}

export function Navbar({ inApp = false, context }: NavbarProps) {
  return (
    <header className="relative z-20">
      <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 px-5 sm:px-8">
        <Link href="/" aria-label="Kitepost home" className={`${ROW} shrink-0 rounded-md max-sm:py-2.5`}>
          <Wordmark size="lg" />
        </Link>
        {context ? (
          // One element, placed by CSS: after the logo on wide screens, on its own row below on narrow ones.
          <div className="order-last flex min-w-0 basis-full items-center pb-3 empty:hidden lg:order-none lg:basis-auto lg:border-l lg:border-line lg:pb-0 lg:pl-5">
            {context}
          </div>
        ) : null}
        <div className={`${ROW} ml-auto`}>
          <Suspense
            fallback={
              <span aria-hidden className={`${NAV_PILL} opacity-60`}>
                {inApp ? "Sign out" : "Sign in"}
              </span>
            }
          >
            <Account inApp={inApp} />
          </Suspense>
        </div>
      </nav>
    </header>
  );
}
