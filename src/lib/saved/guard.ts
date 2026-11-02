import { currentAccount, type Account } from "@/lib/account";
import { getStore, StoreConflictError, StoreLastWorkspaceError, StoreLimitError, StoreNotFoundError, type Store } from "@/lib/db";
import { json } from "@/lib/http";
import { savedLimiter } from "@/lib/limiters";
import { clientKey } from "@/lib/rateLimit";

export interface Access {
  account: Account;
  /** The signed-in Google account's email. Every saved record hangs off it. */
  owner: string;
  store: Store;
}

export type AccessResult = ({ ok: true } & Access) | { ok: false; response: Response };

/**
 * Every saved-data route starts here. The owner is the Google account in the Auth.js cookie,
 * never anything in the request body or URL, so one person cannot name another person's data.
 * A connected mailbox is not needed: workspaces, lists and templates belong to the account.
 */
export async function authorize(request: Request, headers: Headers): Promise<AccessResult> {
  const account = await currentAccount(request);
  if (!account) {
    return { ok: false, response: json({ error: "Sign in to use Kitepost.", code: "signed-out" }, headers, 401) };
  }
  if (!savedLimiter.check(clientKey(request))) {
    return { ok: false, response: json({ error: "Too many requests. Wait a moment." }, headers, 429) };
  }
  let store: Store | null;
  try {
    store = await getStore();
  } catch {
    return { ok: false, response: json({ error: "Could not reach the database. Try again shortly.", code: "storage" }, headers, 503) };
  }
  if (!store) {
    return { ok: false, response: json({ error: "Saving is not set up on this server.", code: "storage-off" }, headers, 503) };
  }
  return { ok: true, account, owner: account.email, store };
}

export type WorkspaceAccess = Access & { workspaceId: string };
export type WorkspaceAccessResult = ({ ok: true } & WorkspaceAccess) | { ok: false; response: Response };

/** Query-string key that names the workspace a saved-data request is about. */
export const WORKSPACE_PARAM = "workspace";

/**
 * Confirm the workspace named in the URL belongs to the signed-in mailbox. The
 * id is only trusted after the store says so, so a guessed id from someone
 * else's account gets a 404, never their data.
 */
export async function inWorkspace(access: Access, request: Request, headers: Headers): Promise<WorkspaceAccessResult> {
  const workspaceId = new URL(request.url).searchParams.get(WORKSPACE_PARAM)?.trim() ?? "";
  if (!workspaceId) {
    return { ok: false, response: json({ error: "Open a workspace first.", code: "no-workspace" }, headers, 400) };
  }
  const found = await guarded(headers, () => access.store.getWorkspace(access.owner, workspaceId));
  if (!found.ok) return found;
  if (!found.value) {
    return { ok: false, response: json({ error: "That workspace no longer exists.", code: "no-workspace" }, headers, 404) };
  }
  return { ok: true, ...access, workspaceId };
}

/** Run a store call and turn its failures into a clean response. */
export async function guarded<T>(headers: Headers, work: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    if (error instanceof StoreLimitError) {
      return { ok: false, response: json({ error: error.message, code: "limit" }, headers, 409) };
    }
    if (error instanceof StoreConflictError) {
      return { ok: false, response: json({ error: error.message, code: "conflict" }, headers, 409) };
    }
    if (error instanceof StoreLastWorkspaceError) {
      return { ok: false, response: json({ error: error.message, code: "last-workspace" }, headers, 409) };
    }
    if (error instanceof StoreNotFoundError) {
      return { ok: false, response: json({ error: error.message, code: "no-workspace" }, headers, 404) };
    }
    return { ok: false, response: json({ error: "Could not reach the database. Try again shortly.", code: "storage" }, headers, 503) };
  }
}
