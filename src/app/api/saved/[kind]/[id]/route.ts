import { json, noStoreHeaders, readJson } from "@/lib/http";
import { authorize, guarded, inWorkspace } from "@/lib/saved/guard";
import { resolveSession } from "@/lib/session/connection";
import { toProfile } from "@/lib/session/seal";
import { listDoneSchema, SAVED_KINDS, type SavedKind } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ kind: string; id: string }> };

function parseKind(kind: string): SavedKind | null {
  return (SAVED_KINDS as readonly string[]).includes(kind) ? (kind as SavedKind) : null;
}

const notFound = (headers: Headers) => json({ error: "That item no longer exists." }, headers, 404);

/** A saved list with its rows, or the per-recipient log of one send run. */
export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  const headers = noStoreHeaders();
  const { kind: rawKind, id } = await params;
  const kind = parseKind(rawKind);
  if (kind !== "lists" && kind !== "runs") return json({ error: "Unknown kind of saved data." }, headers, 404);
  const access = await authorize(request, headers);
  if (!access.ok) return access.response;
  const { store, owner } = access;
  const inside = await inWorkspace(access, request, headers);
  if (!inside.ok) return inside.response;
  const { workspaceId } = inside;

  if (kind === "lists") {
    const found = await guarded(headers, () => store.getList(owner, workspaceId, id));
    if (!found.ok) return found.response;
    return found.value ? json({ item: found.value }, headers) : notFound(headers);
  }
  const found = await guarded(headers, () => store.getRunMessages(owner, workspaceId, id));
  if (!found.ok) return found.response;
  return json({ items: found.value }, headers);
}

/** Switch the connected session to a saved sender. Needs no password: the mailbox is already proven. */
export async function PUT(request: Request, { params }: Ctx): Promise<Response> {
  const headers = noStoreHeaders();
  const { kind, id } = await params;
  if (kind !== "senders") return json({ error: "Only senders can be selected." }, headers, 405);
  const access = await authorize(request, headers);
  if (!access.ok) return access.response;
  const { store, owner, account } = access;

  const found = await guarded(headers, () => store.getSender(owner, id));
  if (!found.ok) return found.response;
  if (!found.value) return notFound(headers);
  const session = await resolveSession(request, headers, account, store);
  if (!session) return json({ error: "Not connected. Connect your mailbox first.", code: "no-session" }, headers, 401);

  session.fromName = found.value.fromName;
  session.fromAddress = found.value.fromAddress;
  session.replyTo = found.value.replyTo;
  await session.save();
  // Keep the saved connection in step, so the choice survives the cookie.
  const connection = await guarded(headers, () => store.getConnection(owner));
  if (connection.ok && connection.value) {
    await guarded(headers, () =>
      store.saveConnection(owner, {
        user: connection.value!.user,
        secret: connection.value!.secret,
        preset: connection.value!.preset,
        fromName: session.fromName,
        fromAddress: session.fromAddress,
        replyTo: session.replyTo,
      }),
    );
  }
  await guarded(headers, () => store.touchSender(owner, id));
  return json({ profile: toProfile(session) }, headers);
}

/** Mark a saved list as already done or sent, or move it back to the to-do lists. */
export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  const headers = noStoreHeaders();
  const { kind, id } = await params;
  if (kind !== "lists") return json({ error: "Only lists can be marked as done." }, headers, 405);
  const access = await authorize(request, headers);
  if (!access.ok) return access.response;
  const { store, owner } = access;
  const inside = await inWorkspace(access, request, headers);
  if (!inside.ok) return inside.response;
  const body = await readJson(request, listDoneSchema, headers);
  if (!body.ok) return body.response;
  const updated = await guarded(headers, () => store.setListDone(owner, inside.workspaceId, id, body.data.done));
  if (!updated.ok) return updated.response;
  return updated.value ? json({ item: updated.value }, headers) : notFound(headers);
}

export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  const headers = noStoreHeaders();
  const { kind: rawKind, id } = await params;
  const kind = parseKind(rawKind);
  if (kind !== "templates" && kind !== "lists" && kind !== "senders") {
    return json({ error: "That cannot be deleted here." }, headers, 405);
  }
  const access = await authorize(request, headers);
  if (!access.ok) return access.response;
  const { store, owner } = access;
  const inside = kind === "senders" ? null : await inWorkspace(access, request, headers);
  if (inside && !inside.ok) return inside.response;
  const workspaceId = inside?.workspaceId ?? "";

  const removed = await guarded(headers, () => {
    switch (kind) {
      case "templates":
        return store.deleteTemplate(owner, workspaceId, id);
      case "lists":
        return store.deleteList(owner, workspaceId, id);
      case "senders":
        return store.deleteSender(owner, id);
      default: {
        const unreachable: never = kind;
        return unreachable;
      }
    }
  });
  if (!removed.ok) return removed.response;
  return removed.value ? json({ deleted: true }, headers) : notFound(headers);
}
