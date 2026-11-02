import { ObjectId, type Db } from "mongodb";
import {
  keyOf,
  LEGACY_WORKSPACE_NAME,
  LIMITS,
  mergeStudySearch,
  STARTER_WORKSPACE_NAME,
  StoreConflictError,
  StoreLastWorkspaceError,
  StoreLimitError,
  StoreNotFoundError,
  type ConnectionRecord,
  type MessageLogRecord,
  type RecipientListRecord,
  type RecipientListSummary,
  type Row,
  type RunSummary,
  type SenderRecord,
  type Store,
  type StudyCrawl,
  type StudySearchParams,
  type StudySearchRecord,
  type TemplateRecord,
  type WorkspaceSummary,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

interface UserDoc {
  _id: ObjectId;
  email: string;
  name: string;
  image?: string;
  createdAt: Date;
  lastSeenAt: Date;
}
interface ConnectionDoc {
  _id: ObjectId;
  owner: string;
  user: string;
  /** The app password, already encrypted. */
  secret: string;
  preset: ConnectionRecord["preset"];
  fromName: string;
  fromAddress: string;
  replyTo: string;
  updatedAt: Date;
}
interface WorkspaceDoc {
  _id: ObjectId;
  owner: string;
  key: string;
  name: string;
  createdAt: Date;
}
interface TemplateDoc {
  _id: ObjectId;
  owner: string;
  /** Hex id of the workspace this lives in. */
  workspaceId: string;
  key: string;
  name: string;
  subject: string;
  body: string;
  fallbacks: Record<string, string>;
  updatedAt: Date;
}
interface ListDoc {
  _id: ObjectId;
  owner: string;
  workspaceId: string;
  key: string;
  name: string;
  fileName: string;
  headers: string[];
  emailColumn: string;
  /** Values aligned to `headers`, so header text never becomes a field name. */
  rows: string[][];
  rowCount: number;
  doneAt?: Date;
  updatedAt: Date;
}
interface SenderDoc {
  _id: ObjectId;
  owner: string;
  key: string;
  fromName: string;
  fromAddress: string;
  replyTo: string;
  lastUsedAt: Date;
}
interface RunDoc {
  _id: ObjectId;
  owner: string;
  workspaceId: string;
  runId: string;
  subject: string;
  fromAddress: string;
  fileName?: string;
  startedAt: Date;
  finishedAt: Date;
  sent: number;
  failed: number;
}
interface LeadUsageDoc {
  _id: ObjectId;
  owner: string;
  /** Lead searches this account has started. */
  runs: number;
  updatedAt: Date;
}
interface StudySearchDoc {
  _id: ObjectId;
  owner: string;
  key: string;
  params: StudySearchParams;
  contacts: string[];
  /** Missing on searches saved before progress was remembered. */
  crawl?: StudyCrawl;
  downloads: number;
  lastDownloadedAt: Date;
}
interface MessageDoc {
  _id: ObjectId;
  owner: string;
  workspaceId: string;
  runId: string;
  rowId: string;
  to: string;
  subject: string;
  status: "sent" | "failed";
  error?: string;
  at: Date;
}

function toObjectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) && /^[0-9a-f]{24}$/i.test(id) ? new ObjectId(id) : null;
}

const rowsToArrays = (headers: string[], rows: Row[]) => rows.map((r) => headers.map((h) => r[h] ?? ""));
const arraysToRows = (headers: string[], rows: string[][]): Row[] =>
  rows.map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""])));

const toTemplate = (d: TemplateDoc): TemplateRecord => ({
  id: d._id.toHexString(),
  name: d.name,
  subject: d.subject,
  body: d.body,
  fallbacks: d.fallbacks,
  updatedAt: d.updatedAt.toISOString(),
});
const toSummary = (d: Omit<ListDoc, "rows">): RecipientListSummary => ({
  id: d._id.toHexString(),
  name: d.name,
  fileName: d.fileName,
  headers: d.headers,
  emailColumn: d.emailColumn,
  rowCount: d.rowCount,
  updatedAt: d.updatedAt.toISOString(),
  ...(d.doneAt ? { doneAt: d.doneAt.toISOString() } : {}),
});
const toSender = (d: SenderDoc): SenderRecord => ({
  id: d._id.toHexString(),
  fromName: d.fromName,
  fromAddress: d.fromAddress,
  replyTo: d.replyTo,
  lastUsedAt: d.lastUsedAt.toISOString(),
});
const toStudySearch = (d: StudySearchDoc): StudySearchRecord => ({
  key: d.key,
  params: d.params,
  contacts: d.contacts,
  crawl: d.crawl ?? { pages: {}, urls: [] },
  downloads: d.downloads,
  lastDownloadedAt: d.lastDownloadedAt.toISOString(),
});
const toRun = (d: RunDoc): RunSummary => ({
  runId: d.runId,
  subject: d.subject,
  fromAddress: d.fromAddress,
  ...(d.fileName ? { fileName: d.fileName } : {}),
  startedAt: d.startedAt.toISOString(),
  finishedAt: d.finishedAt.toISOString(),
  sent: d.sent,
  failed: d.failed,
});

/** Indexes that existed before workspaces. Their uniqueness was per owner, which no longer holds. */
const OLD_INDEXES: [collection: string, name: string][] = [
  ["templates", "owner_1_key_1"],
  ["lists", "owner_1_key_1"],
  ["runs", "owner_1_runId_1"],
  ["messages", "owner_1_runId_1_at_1"],
];

async function dropIfPresent(db: Db, collection: string, name: string): Promise<void> {
  try {
    await db.collection(collection).dropIndex(name);
  } catch (error) {
    // 26 NamespaceNotFound, 27 IndexNotFound: nothing to drop.
    const code = (error as { code?: number }).code;
    if (code !== 26 && code !== 27) throw error;
  }
}

/** Create indexes once per process. Safe to call repeatedly. */
export async function ensureIndexes(db: Db): Promise<void> {
  const ttl = LIMITS.historyDays * DAY_MS;
  await Promise.all(OLD_INDEXES.map(([collection, name]) => dropIfPresent(db, collection, name)));
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("connections").createIndex({ owner: 1 }, { unique: true }),
    db.collection("workspaces").createIndex({ owner: 1, key: 1 }, { unique: true }),
    db.collection("templates").createIndex({ owner: 1, workspaceId: 1, key: 1 }, { unique: true }),
    db.collection("lists").createIndex({ owner: 1, workspaceId: 1, key: 1 }, { unique: true }),
    db.collection("senders").createIndex({ owner: 1, key: 1 }, { unique: true }),
    db.collection("runs").createIndex({ owner: 1, workspaceId: 1, runId: 1 }, { unique: true }),
    db.collection("runs").createIndex({ finishedAt: 1 }, { expireAfterSeconds: ttl / 1000 }),
    db.collection("messages").createIndex({ owner: 1, workspaceId: 1, runId: 1, at: 1 }),
    db.collection("messages").createIndex({ at: 1 }, { expireAfterSeconds: ttl / 1000 }),
    db.collection("leadUsage").createIndex({ owner: 1 }, { unique: true }),
    db.collection("studySearches").createIndex({ owner: 1, key: 1 }, { unique: true }),
    db.collection("studySearches").createIndex({ owner: 1, lastDownloadedAt: -1 }),
  ]);
}

export function createMongoStore(db: Db): Store {
  const users = db.collection<UserDoc>("users");
  const connections = db.collection<ConnectionDoc>("connections");
  const workspaces = db.collection<WorkspaceDoc>("workspaces");
  const templates = db.collection<TemplateDoc>("templates");
  const lists = db.collection<ListDoc>("lists");
  const senders = db.collection<SenderDoc>("senders");
  const runs = db.collection<RunDoc>("runs");
  const messages = db.collection<MessageDoc>("messages");
  const leadUsage = db.collection<LeadUsageDoc>("leadUsage");
  const studySearches = db.collection<StudySearchDoc>("studySearches");

  /**
   * Cap per owner (and per workspace, for what lives inside one). Checked before
   * inserting a new key; two simultaneous first saves could overshoot by one,
   * which is harmless for a soft quota.
   */
  async function assertRoom(kind: "templates" | "lists", owner: string, workspaceId: string, key: string): Promise<void> {
    const col = { templates, lists }[kind] as typeof templates;
    if (await col.countDocuments({ owner, workspaceId, key }, { limit: 1 })) return;
    if ((await col.countDocuments({ owner, workspaceId }, { limit: LIMITS[kind] })) >= LIMITS[kind]) {
      throw new StoreLimitError(kind);
    }
  }
  async function assertSenderRoom(owner: string, key: string): Promise<void> {
    if (await senders.countDocuments({ owner, key }, { limit: 1 })) return;
    if ((await senders.countDocuments({ owner }, { limit: LIMITS.senders })) >= LIMITS.senders) {
      throw new StoreLimitError("senders");
    }
  }

  /** Writes only go into a workspace this owner really has. */
  async function requireWorkspace(owner: string, workspaceId: string): Promise<void> {
    const _id = toObjectId(workspaceId);
    if (!_id || !(await workspaces.countDocuments({ _id, owner }, { limit: 1 }))) throw new StoreNotFoundError();
  }

  /**
   * Anything saved before workspaces existed has no workspaceId. The first time
   * its owner lists workspaces, it is moved into one called "General" so
   * nothing is lost. Does nothing once everything has a home.
   */
  async function adoptLegacy(owner: string): Promise<void> {
    const orphan = { owner, workspaceId: { $exists: false } };
    const groups = [templates, lists, runs, messages] as unknown as { countDocuments: typeof lists.countDocuments; updateMany: typeof lists.updateMany }[];
    const found = await Promise.all(groups.map((c) => c.countDocuments(orphan, { limit: 1 })));
    if (!found.some(Boolean)) return;

    const home = await workspaces.findOneAndUpdate(
      { owner, key: keyOf(LEGACY_WORKSPACE_NAME) },
      { $setOnInsert: { owner, key: keyOf(LEGACY_WORKSPACE_NAME), name: LEGACY_WORKSPACE_NAME, createdAt: new Date() } },
      { upsert: true, returnDocument: "after" },
    );
    const workspaceId = (home as WorkspaceDoc)._id.toHexString();
    await Promise.all(groups.map((c) => c.updateMany(orphan, { $set: { workspaceId } })));
  }

  /**
   * An owner with no workspace gets a starter one. The unique (owner, key) index makes this
   * safe when two requests arrive together: one inserts, the other sees it and moves on.
   */
  async function ensureStarter(owner: string): Promise<void> {
    if (await workspaces.countDocuments({ owner }, { limit: 1 })) return;
    const key = keyOf(STARTER_WORKSPACE_NAME);
    try {
      await workspaces.updateOne(
        { owner, key },
        { $setOnInsert: { owner, key, name: STARTER_WORKSPACE_NAME, createdAt: new Date() } },
        { upsert: true },
      );
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }

  const count = (col: { aggregate: typeof lists.aggregate }, owner: string) =>
    col
      .aggregate<{ _id: string; n: number }>([{ $match: { owner } }, { $group: { _id: "$workspaceId", n: { $sum: 1 } } }])
      .toArray()
      .then((rows) => new Map(rows.map((r) => [r._id, r.n])));

  async function describe(owner: string, docs: WorkspaceDoc[]): Promise<WorkspaceSummary[]> {
    if (docs.length === 0) return [];
    const [l, t, r] = await Promise.all([count(lists, owner), count(templates, owner), count(runs, owner)]);
    return docs.map((d) => {
      const id = d._id.toHexString();
      return {
        id,
        name: d.name,
        createdAt: d.createdAt.toISOString(),
        counts: { lists: l.get(id) ?? 0, templates: t.get(id) ?? 0, runs: r.get(id) ?? 0 },
      };
    });
  }
  const isDuplicateKey = (error: unknown) => (error as { code?: number }).code === 11000;
  const taken = (name: string) => new StoreConflictError(`You already have a workspace called "${name.trim()}".`);

  return {
    async recordUser(owner, profile) {
      const now = new Date();
      await users.updateOne(
        { email: owner },
        {
          $set: { name: profile.name, ...(profile.image ? { image: profile.image } : {}), lastSeenAt: now },
          $setOnInsert: { email: owner, createdAt: now },
        },
        { upsert: true },
      );
      await ensureStarter(owner);
    },
    async getUser(owner) {
      const doc = await users.findOne({ email: owner });
      if (!doc) return null;
      return {
        email: doc.email,
        name: doc.name,
        ...(doc.image ? { image: doc.image } : {}),
        createdAt: doc.createdAt.toISOString(),
        lastSeenAt: doc.lastSeenAt.toISOString(),
      };
    },

    async saveConnection(owner, input) {
      await connections.updateOne({ owner }, { $set: { ...input, updatedAt: new Date() }, $setOnInsert: { owner } }, { upsert: true });
    },
    async getConnection(owner) {
      const doc = await connections.findOne({ owner });
      if (!doc) return null;
      return {
        user: doc.user,
        secret: doc.secret,
        preset: doc.preset,
        fromName: doc.fromName,
        fromAddress: doc.fromAddress,
        replyTo: doc.replyTo,
        updatedAt: doc.updatedAt.toISOString(),
      };
    },
    async deleteConnection(owner) {
      return (await connections.deleteOne({ owner })).deletedCount === 1;
    },

    async listWorkspaces(owner) {
      await adoptLegacy(owner);
      await ensureStarter(owner);
      const docs = await workspaces.find({ owner }).sort({ createdAt: 1, _id: 1 }).limit(LIMITS.workspaces).toArray();
      return describe(owner, docs);
    },
    async getWorkspace(owner, id) {
      const _id = toObjectId(id);
      if (!_id) return null;
      const doc = await workspaces.findOne({ _id, owner });
      return doc ? (await describe(owner, [doc]))[0] : null;
    },
    async createWorkspace(owner, name) {
      const key = keyOf(name);
      if (await workspaces.countDocuments({ owner, key }, { limit: 1 })) throw taken(name);
      if ((await workspaces.countDocuments({ owner }, { limit: LIMITS.workspaces })) >= LIMITS.workspaces) {
        throw new StoreLimitError("workspaces");
      }
      const doc: WorkspaceDoc = { _id: new ObjectId(), owner, key, name: name.trim(), createdAt: new Date() };
      try {
        await workspaces.insertOne(doc);
      } catch (error) {
        if (isDuplicateKey(error)) throw taken(name);
        throw error;
      }
      return (await describe(owner, [doc]))[0];
    },
    async renameWorkspace(owner, id, name) {
      const _id = toObjectId(id);
      if (!_id) return null;
      try {
        const doc = await workspaces.findOneAndUpdate(
          { _id, owner },
          { $set: { name: name.trim(), key: keyOf(name) } },
          { returnDocument: "after" },
        );
        return doc ? (await describe(owner, [doc]))[0] : null;
      } catch (error) {
        if (isDuplicateKey(error)) throw taken(name);
        throw error;
      }
    },
    async deleteWorkspace(owner, id) {
      const _id = toObjectId(id);
      if (!_id || !(await workspaces.countDocuments({ _id, owner }, { limit: 1 }))) return false;
      if ((await workspaces.countDocuments({ owner }, { limit: 2 })) <= 1) throw new StoreLastWorkspaceError();
      // Contents first, so a failure part-way leaves a workspace you can still retry deleting.
      const inWorkspace = { owner, workspaceId: id };
      await Promise.all([
        templates.deleteMany(inWorkspace),
        lists.deleteMany(inWorkspace),
        runs.deleteMany(inWorkspace),
        messages.deleteMany(inWorkspace),
      ]);
      return (await workspaces.deleteOne({ _id, owner })).deletedCount === 1;
    },

    async listTemplates(owner, workspaceId) {
      const docs = await templates.find({ owner, workspaceId }).sort({ updatedAt: -1 }).limit(LIMITS.templates).toArray();
      return docs.map(toTemplate);
    },
    async saveTemplate(owner, workspaceId, input) {
      await requireWorkspace(owner, workspaceId);
      const key = keyOf(input.name);
      await assertRoom("templates", owner, workspaceId, key);
      const doc = await templates.findOneAndUpdate(
        { owner, workspaceId, key },
        { $set: { ...input, updatedAt: new Date() } },
        { upsert: true, returnDocument: "after" },
      );
      return toTemplate(doc as TemplateDoc);
    },
    async deleteTemplate(owner, workspaceId, id) {
      const _id = toObjectId(id);
      if (!_id) return false;
      return (await templates.deleteOne({ _id, owner, workspaceId })).deletedCount === 1;
    },

    async listLists(owner, workspaceId) {
      const docs = await lists
        .find({ owner, workspaceId }, { projection: { rows: 0 } })
        .sort({ updatedAt: -1 })
        .limit(LIMITS.lists)
        .toArray();
      return docs.map(toSummary);
    },
    async saveList(owner, workspaceId, input) {
      await requireWorkspace(owner, workspaceId);
      const key = keyOf(input.name);
      await assertRoom("lists", owner, workspaceId, key);
      const doc = await lists.findOneAndUpdate(
        { owner, workspaceId, key },
        {
          $set: {
            name: input.name,
            fileName: input.fileName,
            headers: input.headers,
            emailColumn: input.emailColumn,
            rows: rowsToArrays(input.headers, input.rows),
            rowCount: input.rows.length,
            updatedAt: new Date(),
          },
        },
        { upsert: true, returnDocument: "after", projection: { rows: 0 } },
      );
      return toSummary(doc as Omit<ListDoc, "rows">);
    },
    async getList(owner, workspaceId, id): Promise<RecipientListRecord | null> {
      const _id = toObjectId(id);
      if (!_id) return null;
      const doc = await lists.findOne({ _id, owner, workspaceId });
      return doc ? { ...toSummary(doc), rows: arraysToRows(doc.headers, doc.rows) } : null;
    },
    async deleteList(owner, workspaceId, id) {
      const _id = toObjectId(id);
      if (!_id) return false;
      return (await lists.deleteOne({ _id, owner, workspaceId })).deletedCount === 1;
    },
    async setListDone(owner, workspaceId, id, done) {
      const _id = toObjectId(id);
      if (!_id) return null;
      const doc = await lists.findOneAndUpdate(
        { _id, owner, workspaceId },
        // Moving back counts as an edit, so the list is newer than any send made from it.
        done ? { $set: { doneAt: new Date() } } : { $set: { updatedAt: new Date() }, $unset: { doneAt: "" } },
        { returnDocument: "after", projection: { rows: 0 } },
      );
      return doc ? toSummary(doc as Omit<ListDoc, "rows">) : null;
    },

    async listSenders(owner) {
      const docs = await senders.find({ owner }).sort({ lastUsedAt: -1 }).limit(LIMITS.senders).toArray();
      return docs.map(toSender);
    },
    async saveSender(owner, input) {
      const key = keyOf(input.fromAddress);
      await assertSenderRoom(owner, key);
      const doc = await senders.findOneAndUpdate(
        { owner, key },
        { $set: { ...input, lastUsedAt: new Date() } },
        { upsert: true, returnDocument: "after" },
      );
      return toSender(doc as SenderDoc);
    },
    async getSender(owner, id) {
      const _id = toObjectId(id);
      if (!_id) return null;
      const doc = await senders.findOne({ _id, owner });
      return doc ? toSender(doc) : null;
    },
    async touchSender(owner, id) {
      const _id = toObjectId(id);
      if (_id) await senders.updateOne({ _id, owner }, { $set: { lastUsedAt: new Date() } });
    },
    async deleteSender(owner, id) {
      const _id = toObjectId(id);
      if (!_id) return false;
      return (await senders.deleteOne({ _id, owner })).deletedCount === 1;
    },

    async logMessages(owner, workspaceId, run, batch) {
      if (batch.length === 0) return;
      await requireWorkspace(owner, workspaceId);
      const at = new Date();
      const sent = batch.filter((m) => m.status === "sent").length;
      await messages.insertMany(
        batch.map((m) => ({ ...m, owner, workspaceId, runId: run.runId, at })) as MessageDoc[],
      );
      await runs.updateOne(
        { owner, workspaceId, runId: run.runId },
        {
          $inc: { sent, failed: batch.length - sent },
          $set: { finishedAt: at },
          $setOnInsert: { subject: run.subject, fromAddress: run.fromAddress, ...(run.fileName ? { fileName: run.fileName } : {}), startedAt: at },
        },
        { upsert: true },
      );
    },
    async listRuns(owner, workspaceId, limit = LIMITS.runs) {
      const docs = await runs.find({ owner, workspaceId }).sort({ finishedAt: -1 }).limit(Math.min(limit, LIMITS.runs)).toArray();
      return docs.map(toRun);
    },
    async deleteRunsForFile(owner, workspaceId, fileName) {
      const key = keyOf(fileName);
      const docs = await runs.find({ owner, workspaceId, fileName: { $exists: true } }, { projection: { runId: 1, fileName: 1 } }).toArray();
      const ids = docs.filter((d) => keyOf(d.fileName ?? "") === key).map((d) => d.runId);
      if (ids.length === 0) return 0;
      await Promise.all([
        messages.deleteMany({ owner, workspaceId, runId: { $in: ids } }),
        runs.deleteMany({ owner, workspaceId, runId: { $in: ids } }),
      ]);
      return ids.length;
    },
    async consumeLeadRun(owner, limit) {
      if (limit <= 0) return false;
      // The filter only matches while there is room. At the limit it matches nothing, so the upsert
      // tries to insert a second document for this owner and the unique index refuses (11000).
      // The same error also hits the loser of two simultaneous first searches, so try once more:
      // by then the winner's document exists and the filter can match it.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await leadUsage.updateOne({ owner, runs: { $lt: limit } }, { $inc: { runs: 1 }, $set: { updatedAt: new Date() } }, { upsert: true });
          return true;
        } catch (error) {
          if ((error as { code?: number }).code !== 11000) throw error;
        }
      }
      return false;
    },
    async getLeadRuns(owner) {
      return (await leadUsage.findOne({ owner }))?.runs ?? 0;
    },
    async saveStudySearch(owner, input) {
      const before = await studySearches.findOne({ owner, key: input.key });
      const merged = mergeStudySearch(before ? { contacts: before.contacts, crawl: before.crawl ?? { pages: {}, urls: [] }, downloads: before.downloads } : null, input);
      const doc = { owner, key: input.key, params: input.params, ...merged, lastDownloadedAt: new Date() };
      await studySearches.updateOne({ owner, key: input.key }, { $set: doc }, { upsert: true });
      // Over the cap: forget the searches downloaded longest ago.
      const stale = await studySearches.find({ owner }, { projection: { _id: 1 } }).sort({ lastDownloadedAt: -1 }).skip(LIMITS.studySearches).toArray();
      if (stale.length) await studySearches.deleteMany({ owner, _id: { $in: stale.map((d) => d._id) } });
      return toStudySearch({ _id: before?._id ?? new ObjectId(), ...doc });
    },
    async getStudySearch(owner, key): Promise<StudySearchRecord | null> {
      const d = await studySearches.findOne({ owner, key });
      return d ? toStudySearch(d) : null;
    },
    async listStudySearches(owner): Promise<StudySearchRecord[]> {
      const docs = await studySearches.find({ owner }).sort({ lastDownloadedAt: -1 }).limit(LIMITS.studySearches).toArray();
      return docs.map(toStudySearch);
    },
    async getRunMessages(owner, workspaceId, runId): Promise<MessageLogRecord[]> {
      const docs = await messages.find({ owner, workspaceId, runId }).sort({ at: 1, _id: 1 }).limit(5000).toArray();
      return docs.map((d) => ({
        rowId: d.rowId,
        to: d.to,
        subject: d.subject,
        status: d.status,
        ...(d.error ? { error: d.error } : {}),
        at: d.at.toISOString(),
      }));
    },
  };
}
