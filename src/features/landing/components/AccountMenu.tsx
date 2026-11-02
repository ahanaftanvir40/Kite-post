import Link from "next/link";
import { signOut } from "@/auth";
import { NAV_PILL } from "./navStyles";

interface AccountMenuProps {
  name: string;
  /** Inside the workspace the "Open app" link is pointless, so the bar shows who is signed in instead. */
  inApp?: boolean;
}

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/" });
}

function Avatar({ initial }: { initial: string }) {
  return (
    <span aria-hidden className="grid size-9 place-items-center rounded-full bg-kite-cobalt text-sm font-semibold text-white">
      {initial}
    </span>
  );
}

/** Signed-in navbar state: a way into the workspace and a way out. */
export function AccountMenu({ name, inApp = false }: AccountMenuProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  if (inApp) {
    return (
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <span className="flex h-11 max-w-56 shrink-0 items-center gap-2.5 rounded-full border border-line-strong bg-sheet py-0 pl-1.5 pr-4 text-sm font-medium text-kite-ink max-sm:w-11 max-sm:justify-center max-sm:border-transparent max-sm:bg-transparent max-sm:p-0">
          <Avatar initial={initial} />
          <span className="sr-only">Signed in as </span>
          <span className="hidden truncate sm:inline">{name}</span>
        </span>
        <form action={signOutAction}>
          <button type="submit" className={NAV_PILL}>
            Sign out
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 max-sm:gap-1.5">
      <span className="max-[24rem]:hidden">
        <Avatar initial={initial} />
      </span>
      <span className="sr-only">Signed in as {name}</span>
      <form action={signOutAction}>
        <button type="submit" className="inline-flex h-11 cursor-pointer items-center whitespace-nowrap rounded-full px-3 text-sm font-medium text-ink-2 transition-colors hover:text-kite-ink">
          Sign out
        </button>
      </form>
      <Link href="/app" className={NAV_PILL}>
        Open app
      </Link>
    </div>
  );
}
