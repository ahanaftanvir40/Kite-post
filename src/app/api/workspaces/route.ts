import { json, noStoreHeaders, readJson } from "@/lib/http";
import { authorize, guarded } from "@/lib/saved/guard";
import { workspaceSaveSchema } from "@/lib/validation/schemas";

/** The workspaces of the connected mailbox, oldest first, with what each holds. */
export async function GET(request: Request): Promise<Response> {
  const headers = noStoreHeaders();
  const access = await authorize(request, headers);
  if (!access.ok) return access.response;
  const { store, owner } = access;
  const result = await guarded(headers, () => store.listWorkspaces(owner));
  return result.ok ? json({ items: result.value }, headers) : result.response;
}

export async function POST(request: Request): Promise<Response> {
  const headers = noStoreHeaders();
  const access = await authorize(request, headers);
  if (!access.ok) return access.response;
  const { store, owner } = access;
  const body = await readJson(request, workspaceSaveSchema, headers);
  if (!body.ok) return body.response;
  const created = await guarded(headers, () => store.createWorkspace(owner, body.data.name));
  return created.ok ? json({ item: created.value }, headers, 201) : created.response;
}
