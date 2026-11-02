import { json, noStoreHeaders, readJson } from "@/lib/http";
import { authorize, guarded, inWorkspace } from "@/lib/saved/guard";
import { listSaveSchema, SAVED_KINDS, senderSaveSchema, templateSaveSchema, type SavedKind } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ kind: string }> };

function parseKind(kind: string): SavedKind | null {
  return (SAVED_KINDS as readonly string[]).includes(kind) ? (kind as SavedKind) : null;
}

const unknownKind = (headers: Headers) => json({ error: "Unknown kind of saved data." }, headers, 404);

export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  const headers = noStoreHeaders();
  const kind = parseKind((await params).kind);
  if (!kind) return unknownKind(headers);
  const access = await authorize(request, headers);
  if (!access.ok) return access.response;
  const { store, owner } = access;

  // Senders belong to the mailbox. Everything else lives inside a workspace.
  const inside = kind === "senders" ? null : await inWorkspace(access, request, headers);
  if (inside && !inside.ok) return inside.response;
  const workspaceId = inside?.workspaceId ?? "";

  const result = await guarded<unknown[]>(headers, () => {
    switch (kind) {
      case "templates":
        return store.listTemplates(owner, workspaceId);
      case "lists":
        return store.listLists(owner, workspaceId);
      case "senders":
        return store.listSenders(owner);
      case "runs":
        return store.listRuns(owner, workspaceId);
      default: {
        const unreachable: never = kind;
        return unreachable;
      }
    }
  });
  if (!result.ok) return result.response;
  return json({ items: result.value }, headers);
}

/** Remove the send history of one spreadsheet, e.g. when it is deleted from "Already done or sent". */
export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  const headers = noStoreHeaders();
  const kind = parseKind((await params).kind);
  if (!kind) return unknownKind(headers);
  if (kind !== "runs") return json({ error: "That cannot be deleted here." }, headers, 405);
  const access = await authorize(request, headers);
  if (!access.ok) return access.response;
  const { store, owner } = access;
  const inside = await inWorkspace(access, request, headers);
  if (!inside.ok) return inside.response;
  const fileName = new URL(request.url).searchParams.get("file")?.trim() ?? "";
  if (!fileName) return json({ error: "Say which file's history to remove." }, headers, 400);
  const removed = await guarded(headers, () => store.deleteRunsForFile(owner, inside.workspaceId, fileName));
  if (!removed.ok) return removed.response;
  return removed.value > 0 ? json({ deleted: removed.value }, headers) : json({ error: "That item no longer exists." }, headers, 404);
}

export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  const headers = noStoreHeaders();
  const kind = parseKind((await params).kind);
  if (!kind) return unknownKind(headers);
  if (kind === "runs") return json({ error: "Send history is recorded when you send." }, headers, 405);
  const access = await authorize(request, headers);
  if (!access.ok) return access.response;
  const { store, owner } = access;

  const inside = kind === "senders" ? null : await inWorkspace(access, request, headers);
  if (inside && !inside.ok) return inside.response;
  const workspaceId = inside?.workspaceId ?? "";

  switch (kind) {
    case "templates": {
      const body = await readJson(request, templateSaveSchema, headers);
      if (!body.ok) return body.response;
      const saved = await guarded(headers, () => store.saveTemplate(owner, workspaceId, body.data));
      return saved.ok ? json({ item: saved.value }, headers) : saved.response;
    }
    case "lists": {
      const body = await readJson(request, listSaveSchema, headers);
      if (!body.ok) return body.response;
      const saved = await guarded(headers, () => store.saveList(owner, workspaceId, body.data));
      return saved.ok ? json({ item: saved.value }, headers) : saved.response;
    }
    case "senders": {
      const body = await readJson(request, senderSaveSchema, headers);
      if (!body.ok) return body.response;
      const saved = await guarded(headers, () => store.saveSender(owner, body.data));
      return saved.ok ? json({ item: saved.value }, headers) : saved.response;
    }
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}
