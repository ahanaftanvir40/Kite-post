import { json, noStoreHeaders, readJson } from "@/lib/http";
import { authorize, guarded } from "@/lib/saved/guard";
import { workspaceSaveSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

const notFound = (headers: Headers) => json({ error: "That workspace no longer exists.", code: "no-workspace" }, headers, 404);

export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  const headers = noStoreHeaders();
  const access = await authorize(request, headers);
  if (!access.ok) return access.response;
  const { store, owner } = access;
  const found = await guarded(headers, async () => store.getWorkspace(owner, (await params).id));
  if (!found.ok) return found.response;
  return found.value ? json({ item: found.value }, headers) : notFound(headers);
}

export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  const headers = noStoreHeaders();
  const access = await authorize(request, headers);
  if (!access.ok) return access.response;
  const { store, owner } = access;
  const body = await readJson(request, workspaceSaveSchema, headers);
  if (!body.ok) return body.response;
  const renamed = await guarded(headers, async () => store.renameWorkspace(owner, (await params).id, body.data.name));
  if (!renamed.ok) return renamed.response;
  return renamed.value ? json({ item: renamed.value }, headers) : notFound(headers);
}

/** Deletes the workspace and everything inside it. */
export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  const headers = noStoreHeaders();
  const access = await authorize(request, headers);
  if (!access.ok) return access.response;
  const { store, owner } = access;
  const removed = await guarded(headers, async () => store.deleteWorkspace(owner, (await params).id));
  if (!removed.ok) return removed.response;
  return removed.value ? json({ deleted: true }, headers) : notFound(headers);
}
