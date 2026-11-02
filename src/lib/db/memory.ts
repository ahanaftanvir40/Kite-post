import {
  keyOf,
  LIMITS,
  STARTER_WORKSPACE_NAME,
  StoreConflictError,
  StoreLastWorkspaceError,
  StoreLimitError,
  StoreNotFoundError,
  type ConnectionRecord,
  type MessageLogRecord,
  type RecipientListRecord,
  type RecipientListSummary,
  type RunSummary,
  type SenderRecord,
  type Store,
  type TemplateRecord,
  type UserRecord,
  type WorkspaceSummary,
} from "./types";

interface Stamped<T> {
  owner: string;
  key: string;
  value: T;
}
/** Something that lives inside a workspace. */
interface Inside<T> extends Stamped<T> {
  workspaceId: string;
}
type WorkspaceRow = Stamped<{ id: string; name: string; createdAt: string }>;

/** In-process Store with the same rules as the Mongo one. Used by tests and as a reference. */
export function createMemoryStore(now: () => Date = () => new Date()): Store {
  let counter = 0;
  const nextId = () => `m${++counter}`;
  const stamp = () => now().toISOString();

  const users = new Map<string, UserRecord>();
  const connections = new Map<string, ConnectionRecord>();
  const workspaces: WorkspaceRow[] = [];
  const templates: Inside<TemplateRecord>[] = [];
  const lists: Inside<RecipientListRecord>[] = [];
  const senders: Stamped<SenderRecord>[] = [];
  const runs: { owner: string; workspaceId: string; summary: RunSummary }[] = [];
  const messages: { owner: string; workspaceId: string; runId: string; record: MessageLogRecord }[] = [];

  const mine = <T>(items: Stamped<T>[], owner: string) => items.filter((i) => i.owner === owner);
  const inside = <T>(items: Inside<T>[], owner: string, workspaceId: string) =>
    items.filter((i) => i.owner === owner && i.workspaceId === workspaceId);
  const requireWorkspace = (owner: string, id: string) => {
    if (!workspaces.some((w) => w.owner === owner && w.value.id === id)) throw new StoreNotFoundError();
  };
  const summarize = (l: RecipientListRecord): RecipientListSummary => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { rows, ...summary } = l;
    return summary;
  };
  const describe = (w: WorkspaceRow): WorkspaceSummary => ({
    ...w.value,
    counts: {
      lists: inside(lists, w.owner, w.value.id).length,
      templates: inside(templates, w.owner, w.value.id).length,
      runs: runs.filter((r) => r.owner === w.owner && r.workspaceId === w.value.id).length,
    },
  });
  const taken = (name: string) => new StoreConflictError(`You already have a workspace called "${name.trim()}".`);

  const ensureStarter = (owner: string) => {
    if (mine(workspaces, owner).length === 0) {
      workspaces.push({ owner, key: keyOf(STARTER_WORKSPACE_NAME), value: { id: nextId(), name: STARTER_WORKSPACE_NAME, createdAt: stamp() } });
    }
  };

  return {
    async recordUser(owner, profile) {
      const at = stamp();
      const before = users.get(owner);
      users.set(owner, { email: owner, name: profile.name, ...(profile.image ? { image: profile.image } : {}), createdAt: before?.createdAt ?? at, lastSeenAt: at });
      ensureStarter(owner);
    },
    async getUser(owner) {
      return users.get(owner) ?? null;
    },

    async saveConnection(owner, input) {
      connections.set(owner, { ...input, updatedAt: stamp() });
    },
    async getConnection(owner) {
      return connections.get(owner) ?? null;
    },
    async deleteConnection(owner) {
      return connections.delete(owner);
    },

    async listWorkspaces(owner) {
      ensureStarter(owner);
      return mine(workspaces, owner)
        .map(describe)
        // Array.sort is stable, so workspaces made in the same millisecond keep the order they were created in.
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async getWorkspace(owner, id) {
      const hit = workspaces.find((w) => w.owner === owner && w.value.id === id);
      return hit ? describe(hit) : null;
    },
    async createWorkspace(owner, name) {
      const key = keyOf(name);
      if (workspaces.some((w) => w.owner === owner && w.key === key)) throw taken(name);
      if (mine(workspaces, owner).length >= LIMITS.workspaces) throw new StoreLimitError("workspaces");
      const row: WorkspaceRow = { owner, key, value: { id: nextId(), name: name.trim(), createdAt: stamp() } };
      workspaces.push(row);
      return describe(row);
    },
    async renameWorkspace(owner, id, name) {
      const hit = workspaces.find((w) => w.owner === owner && w.value.id === id);
      if (!hit) return null;
      const key = keyOf(name);
      if (workspaces.some((w) => w.owner === owner && w.key === key && w !== hit)) throw taken(name);
      hit.key = key;
      hit.value = { ...hit.value, name: name.trim() };
      return describe(hit);
    },
    async deleteWorkspace(owner, id) {
      const i = workspaces.findIndex((w) => w.owner === owner && w.value.id === id);
      if (i === -1) return false;
      if (mine(workspaces, owner).length <= 1) throw new StoreLastWorkspaceError();
      workspaces.splice(i, 1);
      const gone = <T extends { owner: string; workspaceId: string }>(items: T[]) => {
        for (let n = items.length - 1; n >= 0; n--) if (items[n].owner === owner && items[n].workspaceId === id) items.splice(n, 1);
      };
      gone(templates);
      gone(lists);
      gone(runs);
      gone(messages);
      return true;
    },

    async listTemplates(owner, workspaceId) {
      return inside(templates, owner, workspaceId)
        .map((t) => t.value)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async saveTemplate(owner, workspaceId, input) {
      requireWorkspace(owner, workspaceId);
      const key = keyOf(input.name);
      const existing = inside(templates, owner, workspaceId).find((t) => t.key === key);
      if (existing) {
        existing.value = { ...existing.value, ...input, updatedAt: stamp() };
        return existing.value;
      }
      if (inside(templates, owner, workspaceId).length >= LIMITS.templates) throw new StoreLimitError("templates");
      const value: TemplateRecord = { ...input, id: nextId(), updatedAt: stamp() };
      templates.push({ owner, workspaceId, key, value });
      return value;
    },
    async deleteTemplate(owner, workspaceId, id) {
      const i = templates.findIndex((t) => t.owner === owner && t.workspaceId === workspaceId && t.value.id === id);
      if (i === -1) return false;
      templates.splice(i, 1);
      return true;
    },

    async listLists(owner, workspaceId) {
      return inside(lists, owner, workspaceId)
        .map((l) => summarize(l.value))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async saveList(owner, workspaceId, input) {
      requireWorkspace(owner, workspaceId);
      const key = keyOf(input.name);
      const existing = inside(lists, owner, workspaceId).find((l) => l.key === key);
      if (existing) {
        existing.value = { ...existing.value, ...input, rowCount: input.rows.length, updatedAt: stamp() };
        return summarize(existing.value);
      }
      if (inside(lists, owner, workspaceId).length >= LIMITS.lists) throw new StoreLimitError("lists");
      const value: RecipientListRecord = { ...input, id: nextId(), rowCount: input.rows.length, updatedAt: stamp() };
      lists.push({ owner, workspaceId, key, value });
      return summarize(value);
    },
    async getList(owner, workspaceId, id) {
      return inside(lists, owner, workspaceId).find((l) => l.value.id === id)?.value ?? null;
    },
    async deleteList(owner, workspaceId, id) {
      const i = lists.findIndex((l) => l.owner === owner && l.workspaceId === workspaceId && l.value.id === id);
      if (i === -1) return false;
      lists.splice(i, 1);
      return true;
    },

    async setListDone(owner, workspaceId, id, done) {
      const found = inside(lists, owner, workspaceId).find((l) => l.value.id === id);
      if (!found) return null;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { doneAt, ...rest } = found.value;
      // Moving back counts as an edit, so the list is newer than any send made from it.
      found.value = done ? { ...rest, doneAt: stamp() } : { ...rest, updatedAt: stamp() };
      return summarize(found.value);
    },

    async listSenders(owner) {
      return mine(senders, owner)
        .map((s) => s.value)
        .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
    },
    async saveSender(owner, input) {
      const key = keyOf(input.fromAddress);
      const existing = senders.find((s) => s.owner === owner && s.key === key);
      if (existing) {
        existing.value = { ...existing.value, ...input, lastUsedAt: stamp() };
        return existing.value;
      }
      if (mine(senders, owner).length >= LIMITS.senders) throw new StoreLimitError("senders");
      const value: SenderRecord = { ...input, id: nextId(), lastUsedAt: stamp() };
      senders.push({ owner, key, value });
      return value;
    },
    async getSender(owner, id) {
      return senders.find((s) => s.owner === owner && s.value.id === id)?.value ?? null;
    },
    async touchSender(owner, id) {
      const hit = senders.find((s) => s.owner === owner && s.value.id === id);
      if (hit) hit.value = { ...hit.value, lastUsedAt: stamp() };
    },
    async deleteSender(owner, id) {
      const i = senders.findIndex((s) => s.owner === owner && s.value.id === id);
      if (i === -1) return false;
      senders.splice(i, 1);
      return true;
    },

    async logMessages(owner, workspaceId, run, batch) {
      if (batch.length === 0) return;
      requireWorkspace(owner, workspaceId);
      const at = stamp();
      let entry = runs.find((r) => r.owner === owner && r.workspaceId === workspaceId && r.summary.runId === run.runId);
      if (!entry) {
        entry = {
          owner,
          workspaceId,
          summary: {
            runId: run.runId,
            subject: run.subject,
            fromAddress: run.fromAddress,
            ...(run.fileName ? { fileName: run.fileName } : {}),
            startedAt: at,
            finishedAt: at,
            sent: 0,
            failed: 0,
          },
        };
        runs.push(entry);
      }
      for (const m of batch) {
        messages.push({ owner, workspaceId, runId: run.runId, record: { ...m, at } });
        if (m.status === "sent") entry.summary.sent++;
        else entry.summary.failed++;
      }
      entry.summary.finishedAt = at;
    },
    async listRuns(owner, workspaceId, limit = LIMITS.runs) {
      return runs
        .filter((r) => r.owner === owner && r.workspaceId === workspaceId)
        .map((r) => r.summary)
        .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
        .slice(0, limit);
    },
    async deleteRunsForFile(owner, workspaceId, fileName) {
      const key = keyOf(fileName);
      const ids = new Set<string>();
      for (let i = runs.length - 1; i >= 0; i--) {
        const r = runs[i];
        if (r.owner !== owner || r.workspaceId !== workspaceId || keyOf(r.summary.fileName ?? "") !== key) continue;
        ids.add(r.summary.runId);
        runs.splice(i, 1);
      }
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.owner === owner && m.workspaceId === workspaceId && ids.has(m.runId)) messages.splice(i, 1);
      }
      return ids.size;
    },
    async getRunMessages(owner, workspaceId, runId) {
      return messages
        .filter((m) => m.owner === owner && m.workspaceId === workspaceId && m.runId === runId)
        .map((m) => m.record);
    },
  };
}
