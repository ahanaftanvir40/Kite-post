import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/auth";
import { Wordmark } from "@/components/brand/Wordmark";
import { AccountMenu } from "./AccountMenu";
import { NAV_PILL } from "./navStyles";
import { SignInButton } from "./SignInButton";

/** Reads the session at request time, so it streams in behind a Suspense boundary. */
async function Account({ inApp }: { inApp: boolean }) {
  const session = await auth();
  if (!session?.user) return <SignInButton />;
  return <AccountMenu name={session.user.name ?? session.user.email ?? "You"} inApp={inApp} />;
}

export function Navbar({ inApp = false }: { inApp?: boolean }) {
  return (
    <header className="relative z-20">
      <nav aria-label="Main" className="mx-auto flex h-20 laptop:h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="Kitepost home" className="rounded-md">
          <Wordmark size="lg" />
        </Link>
        <Suspense
          fallback={
            <span aria-hidden className={`${NAV_PILL} opacity-60`}>
              {inApp ? "Sign out" : "Sign in"}
            </span>
          }
        >
          <Account inApp={inApp} />
        </Suspense>
      </nav>
    </header>
  );
}
