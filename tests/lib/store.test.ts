import { MongoClient } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryStore } from "@/lib/db/memory";
import { createMongoStore, ensureIndexes } from "@/lib/db/mongo";
import {
  LIMITS,
  STARTER_WORKSPACE_NAME,
  StoreConflictError,
  StoreLastWorkspaceError,
  StoreLimitError,
  StoreNotFoundError,
  type Store,
} from "@/lib/db/types";

const ALICE = "alice@example.com";
const BOB = "bob@example.com";

const template = (name: string, subject = "Hi @firstname") => ({
  name,
  subject,
  body: "<p>Hello @firstname</p>",
  fallbacks: { firstname: "there" },
});

const list = (name: string) => ({
  name,
  fileName: "people.csv",
  // Header text that would be illegal as a Mongo field name must still round-trip.
  headers: ["Email", "First.Name", "$Company"],
  emailColumn: "Email",
  rows: [
    { Email: "a@x.com", "First.Name": "Ada", $Company: "Engines" },
    { Email: "b@x.com", "First.Name": "Bo", $Company: "" },
  ],
});

function contract(label: string, make: () => Promise<Store> | Store) {
  describe(`Store contract: ${label}`, () => {
    let store: Store;
    let aw: string; // Alice's workspace
    let bw: string; // Bob's workspace
    beforeAll(async () => {
      store = await make();
      aw = (await store.createWorkspace(ALICE, "Main")).id;
      bw = (await store.createWorkspace(BOB, "Main")).id;
    });

    it("upserts templates by name, case-insensitively", async () => {
      const first = await store.saveTemplate(ALICE, aw, template("Welcome"));
      const second = await store.saveTemplate(ALICE, aw, template("  welcome ", "Changed"));
      expect(second.id).toBe(first.id);
      expect(second.subject).toBe("Changed");
      const all = await store.listTemplates(ALICE, aw);
      expect(all.filter((t) => t.name.trim().toLowerCase() === "welcome")).toHaveLength(1);
    });

    it("keeps every owner's data separate", async () => {
      const mine = await store.saveTemplate(ALICE, aw, template("Private pitch"));
      expect((await store.listTemplates(BOB, bw)).some((t) => t.id === mine.id)).toBe(false);
      expect(await store.deleteTemplate(BOB, bw, mine.id)).toBe(false);
      // Even naming Alice's workspace does not let Bob in.
      expect(await store.listTemplates(BOB, aw)).toEqual([]);
      expect(await store.deleteTemplate(BOB, aw, mine.id)).toBe(false);
      expect((await store.listTemplates(ALICE, aw)).some((t) => t.id === mine.id)).toBe(true);
      expect(await store.deleteTemplate(ALICE, aw, mine.id)).toBe(true);
    });

    it("never lets another owner read or delete a list", async () => {
      const saved = await store.saveList(ALICE, aw, list("Leads"));
      expect(await store.getList(BOB, bw, saved.id)).toBeNull();
      expect(await store.getList(BOB, aw, saved.id)).toBeNull();
      expect(await store.deleteList(BOB, bw, saved.id)).toBe(false);
      expect(await store.deleteList(BOB, aw, saved.id)).toBe(false);
      expect(await store.getList(ALICE, aw, saved.id)).not.toBeNull();
    });

    it("round-trips lists whose headers contain dots and dollar signs", async () => {
      const saved = await store.saveList(ALICE, aw, list("Odd headers"));
      expect(saved).toMatchObject({ rowCount: 2, emailColumn: "Email" });
      expect(saved).not.toHaveProperty("rows");
      const got = await store.getList(ALICE, aw, saved.id);
      expect(got?.rows).toEqual(list("x").rows);
      expect(got?.headers).toEqual(["Email", "First.Name", "$Company"]);
      expect((await store.listLists(ALICE, aw)).every((l) => !("rows" in l))).toBe(true);
    });

    it("treats ids that are not valid as missing, not as errors", async () => {
      expect(await store.getList(ALICE, aw, "not-an-id")).toBeNull();
      expect(await store.deleteList(ALICE, aw, "not-an-id")).toBe(false);
      expect(await store.deleteTemplate(ALICE, aw, "{\"$ne\":null}")).toBe(false);
      expect(await store.getSender(ALICE, "zzz")).toBeNull();
      expect(await store.listLists(ALICE, "{\"$ne\":null}")).toEqual([]);
      expect(await store.getWorkspace(ALICE, "not-an-id")).toBeNull();
    });

    it("stores senders without any password field and upserts by address", async () => {
      const a = await store.saveSender(ALICE, { fromName: "Team", fromAddress: "team@resumestart.ai", replyTo: "team@resumestart.ai" });
      const b = await store.saveSender(ALICE, { fromName: "Team 2", fromAddress: "TEAM@resumestart.ai", replyTo: "r@x.com" });
      expect(b.id).toBe(a.id);
      expect(b).toMatchObject({ fromName: "Team 2", replyTo: "r@x.com" });
      expect(Object.keys(b).sort()).toEqual(["fromAddress", "fromName", "id", "lastUsedAt", "replyTo"]);
      expect(await store.getSender(BOB, a.id)).toBeNull();
      await store.touchSender(ALICE, a.id);
      expect(await store.deleteSender(ALICE, a.id)).toBe(true);
    });

    it("accumulates history for a run across chunks, per owner", async () => {
      const run = { runId: "run-aaaaaaaa", subject: "Hi @firstname", fromAddress: "team@resumestart.ai" };
      await store.logMessages(ALICE, aw, run, [
        { rowId: "r0", to: "a@x.com", subject: "Hi Ada", status: "sent" },
        { rowId: "r1", to: "b@x.com", subject: "Hi Bo", status: "failed", error: "Mailbox full" },
      ]);
      await store.logMessages(ALICE, aw, run, [{ rowId: "r2", to: "c@x.com", subject: "Hi Cy", status: "sent" }]);
      await store.logMessages(BOB, bw, { ...run, subject: "Bob's run" }, [{ rowId: "r0", to: "z@x.com", subject: "Z", status: "sent" }]);

      const runs = await store.listRuns(ALICE, aw);
      const mine = runs.find((r) => r.runId === run.runId);
      expect(mine).toMatchObject({ sent: 2, failed: 1, subject: "Hi @firstname", fromAddress: "team@resumestart.ai" });
      expect(runs.some((r) => r.subject === "Bob's run")).toBe(false);

      const messages = await store.getRunMessages(ALICE, aw, run.runId);
      expect(messages.map((m) => m.to)).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
      expect(messages[1]).toMatchObject({ status: "failed", error: "Mailbox full" });
      expect(messages[0]).not.toHaveProperty("error");
      expect(await store.getRunMessages(BOB, bw, run.runId)).toHaveLength(1);
      expect(await store.getRunMessages(BOB, aw, run.runId)).toHaveLength(0);
    });

    it("keeps the spreadsheet a run was sent from, set by its first chunk", async () => {
      const run = { runId: "run-withfile01", subject: "Hi", fromAddress: "team@resumestart.ai", fileName: "leads.xlsx" };
      await store.logMessages(ALICE, aw, run, [{ rowId: "r0", to: "a@x.com", subject: "Hi", status: "sent" }]);
      await store.logMessages(ALICE, aw, { ...run, fileName: "other.xlsx" }, [{ rowId: "r1", to: "b@x.com", subject: "Hi", status: "sent" }]);
      const plain = { runId: "run-nofile0001", subject: "Hi", fromAddress: "team@resumestart.ai" };
      await store.logMessages(ALICE, aw, plain, [{ rowId: "r0", to: "a@x.com", subject: "Hi", status: "sent" }]);

      const runs = await store.listRuns(ALICE, aw);
      expect(runs.find((r) => r.runId === run.runId)).toMatchObject({ fileName: "leads.xlsx", sent: 2 });
      expect(runs.find((r) => r.runId === plain.runId)).not.toHaveProperty("fileName");
    });

    it("deletes the runs and logs of one file, matching its name loosely, and nothing else", async () => {
      const mk = (runId: string, fileName?: string) => ({ runId, subject: "Hi", fromAddress: "a@x.com", ...(fileName ? { fileName } : {}) });
      const msg = [{ rowId: "r0", to: "a@x.com", subject: "Hi", status: "sent" as const }];
      await store.logMessages(ALICE, aw, mk("run-gone00001", "Purge.xlsx"), msg);
      await store.logMessages(ALICE, aw, mk("run-gone00002", "purge.xlsx "), msg);
      await store.logMessages(ALICE, aw, mk("run-keep00001", "other.xlsx"), msg);
      await store.logMessages(BOB, bw, mk("run-bobs00001", "purge.xlsx"), msg);

      expect(await store.deleteRunsForFile(ALICE, aw, "purge.xlsx")).toBe(2);
      const left = (await store.listRuns(ALICE, aw)).map((r) => r.runId);
      expect(left).not.toContain("run-gone00001");
      expect(left).not.toContain("run-gone00002");
      expect(left).toContain("run-keep00001");
      expect(await store.getRunMessages(ALICE, aw, "run-gone00001")).toHaveLength(0);
      expect(await store.getRunMessages(ALICE, aw, "run-keep00001")).toHaveLength(1);
      // Someone else's history under the same file name is untouched.
      expect((await store.listRuns(BOB, bw)).map((r) => r.runId)).toContain("run-bobs00001");
      expect(await store.deleteRunsForFile(ALICE, aw, "purge.xlsx")).toBe(0);
    });

    it("counts moving a list back as an edit", async () => {
      const saved = await store.saveList(ALICE, aw, { name: "Moveback", fileName: "m.csv", headers: ["Email"], emailColumn: "Email", rows: [{ Email: "a@x.com" }] });
      const done = await store.setListDone(ALICE, aw, saved.id, true);
      expect(done?.doneAt).toBeTruthy();
      await new Promise((r) => setTimeout(r, 5));
      const back = await store.setListDone(ALICE, aw, saved.id, false);
      expect(back?.doneAt).toBeUndefined();
      expect(back!.updatedAt > saved.updatedAt).toBe(true);
    });

    it("ignores an empty history batch", async () => {
      await store.logMessages(ALICE, aw, { runId: "run-empty000", subject: "s", fromAddress: "a@x.com" }, []);
      expect((await store.listRuns(ALICE, aw)).some((r) => r.runId === "run-empty000")).toBe(false);
    });

    it("caps saved templates per workspace but still allows updating an existing one", async () => {
      const owner = `capped-${label}@example.com`;
      const w = (await store.createWorkspace(owner, "Capped")).id;
      // Seeded in parallel: the cap is only enforced on the call after this one.
      await Promise.all(Array.from({ length: LIMITS.templates }, (_, i) => store.saveTemplate(owner, w, template(`T${i}`))));
      await expect(store.saveTemplate(owner, w, template("One too many"))).rejects.toBeInstanceOf(StoreLimitError);
      await expect(store.saveTemplate(owner, w, template("t0", "Edited"))).resolves.toMatchObject({ subject: "Edited" });
      // Another workspace has its own room.
      const other = (await store.createWorkspace(owner, "Roomy")).id;
      await expect(store.saveTemplate(owner, other, template("Fresh"))).resolves.toMatchObject({ name: "Fresh" });
    }, 60_000);

    describe("workspaces", () => {
      const owner = `ws-${label}@example.com`;

      it("creates, lists in order and counts what each one holds", async () => {
        const one = await store.createWorkspace(owner, "  Spring campaign ");
        expect(one).toMatchObject({ name: "Spring campaign", counts: { lists: 0, templates: 0, runs: 0 } });
        const two = await store.createWorkspace(owner, "Clients");
        await store.saveList(owner, one.id, list("Leads"));
        await store.saveList(owner, one.id, list("Warm"));
        await store.saveTemplate(owner, two.id, template("Intro"));
        await store.logMessages(owner, one.id, { runId: "run-counting1", subject: "s", fromAddress: "a@x.com" }, [
          { rowId: "r0", to: "a@x.com", subject: "s", status: "sent" },
        ]);

        const all = await store.listWorkspaces(owner);
        expect(all.map((w) => w.name)).toEqual(["Spring campaign", "Clients"]);
        expect(all[0].counts).toEqual({ lists: 2, templates: 0, runs: 1 });
        expect(all[1].counts).toEqual({ lists: 0, templates: 1, runs: 0 });
        expect(await store.getWorkspace(owner, one.id)).toMatchObject({ name: "Spring campaign" });
      });

      it("gives each workspace its own saved lists, even under the same name", async () => {
        const a = await store.createWorkspace(owner, "Alpha");
        const b = await store.createWorkspace(owner, "Beta");
        const inA = await store.saveList(owner, a.id, list("Leads"));
        const inB = await store.saveList(owner, b.id, { ...list("Leads"), rows: [list("x").rows[0]] });

        expect(inA.id).not.toBe(inB.id);
        expect(inA.rowCount).toBe(2);
        expect(inB.rowCount).toBe(1);
        expect((await store.listLists(owner, a.id)).map((l) => l.name)).toEqual(["Leads"]);
        // A list is only reachable through the workspace that holds it.
        expect(await store.getList(owner, b.id, inA.id)).toBeNull();
        expect(await store.deleteList(owner, b.id, inA.id)).toBe(false);
        expect(await store.getList(owner, a.id, inA.id)).not.toBeNull();
        // Same name in the same workspace still updates in place.
        const again = await store.saveList(owner, a.id, list("leads"));
        expect(again.id).toBe(inA.id);
      });

      it("keeps templates and history separate between workspaces", async () => {
        const a = await store.createWorkspace(owner, "Tpl A");
        const b = await store.createWorkspace(owner, "Tpl B");
        await store.saveTemplate(owner, a.id, template("Shared name", "In A"));
        await store.saveTemplate(owner, b.id, template("Shared name", "In B"));
        expect((await store.listTemplates(owner, a.id)).map((t) => t.subject)).toEqual(["In A"]);
        expect((await store.listTemplates(owner, b.id)).map((t) => t.subject)).toEqual(["In B"]);

        const run = { runId: "run-shared001", subject: "s", fromAddress: "a@x.com" };
        await store.logMessages(owner, a.id, run, [{ rowId: "r0", to: "a@x.com", subject: "s", status: "sent" }]);
        expect(await store.listRuns(owner, b.id)).toEqual([]);
        expect(await store.getRunMessages(owner, b.id, run.runId)).toEqual([]);
      });

      it("shares sender aliases across workspaces", async () => {
        await store.saveSender(owner, { fromName: "Me", fromAddress: "me@x.com", replyTo: "me@x.com" });
        expect((await store.listSenders(owner)).map((s) => s.fromAddress)).toContain("me@x.com");
      });

      it("refuses duplicate names, ignoring case and spacing", async () => {
        await store.createWorkspace(owner, "Unique name");
        await expect(store.createWorkspace(owner, " unique NAME ")).rejects.toBeInstanceOf(StoreConflictError);
        // Another mailbox may use the same name.
        await expect(store.createWorkspace(`other-${owner}`, "Unique name")).resolves.toMatchObject({ name: "Unique name" });
      });

      it("renames, keeps contents, and refuses a taken name", async () => {
        const w = await store.createWorkspace(owner, "Before");
        const taken = await store.createWorkspace(owner, "Taken");
        await store.saveList(owner, w.id, list("Stays"));
        const renamed = await store.renameWorkspace(owner, w.id, "After");
        expect(renamed).toMatchObject({ id: w.id, name: "After", counts: { lists: 1 } });
        await expect(store.renameWorkspace(owner, w.id, "taken")).rejects.toBeInstanceOf(StoreConflictError);
        // Renaming to its own name with different case is fine.
        await expect(store.renameWorkspace(owner, w.id, "AFTER")).resolves.toMatchObject({ name: "AFTER" });
        expect(await store.renameWorkspace(owner, "not-an-id", "x")).toBeNull();
        expect(await store.renameWorkspace(BOB, taken.id, "Hijacked")).toBeNull();
        expect((await store.getWorkspace(owner, taken.id))?.name).toBe("Taken");
      });

      it("deletes a workspace together with everything inside it, and nothing else", async () => {
        const doomed = await store.createWorkspace(owner, "Doomed");
        const keeper = await store.createWorkspace(owner, "Keeper");
        const saved = await store.saveList(owner, doomed.id, list("Gone soon"));
        await store.saveTemplate(owner, doomed.id, template("Gone too"));
        const run = { runId: "run-doomed001", subject: "s", fromAddress: "a@x.com" };
        await store.logMessages(owner, doomed.id, run, [{ rowId: "r0", to: "a@x.com", subject: "s", status: "sent" }]);
        await store.saveList(owner, keeper.id, list("Safe"));

        expect(await store.deleteWorkspace(BOB, doomed.id)).toBe(false);
        expect(await store.getWorkspace(owner, doomed.id)).not.toBeNull();

        expect(await store.deleteWorkspace(owner, doomed.id)).toBe(true);
        expect(await store.getWorkspace(owner, doomed.id)).toBeNull();
        expect(await store.getList(owner, doomed.id, saved.id)).toBeNull();
        expect(await store.listTemplates(owner, doomed.id)).toEqual([]);
        expect(await store.listRuns(owner, doomed.id)).toEqual([]);
        expect(await store.getRunMessages(owner, doomed.id, run.runId)).toEqual([]);
        expect((await store.listLists(owner, keeper.id)).map((l) => l.name)).toEqual(["Safe"]);
        expect(await store.deleteWorkspace(owner, doomed.id)).toBe(false);
      });

      it("gives an owner with no workspace a starter one, exactly once", async () => {
        const fresh = `fresh-${label}@example.com`;
        const [first] = await store.listWorkspaces(fresh);
        expect(first).toMatchObject({ name: STARTER_WORKSPACE_NAME, counts: { lists: 0, templates: 0, runs: 0 } });
        expect((await store.listWorkspaces(fresh)).map((w) => w.id)).toEqual([first.id]);
        // Creating one's own workspace afterwards sits beside it.
        await store.createWorkspace(fresh, "Mine");
        expect((await store.listWorkspaces(fresh)).map((w) => w.name)).toEqual([STARTER_WORKSPACE_NAME, "Mine"]);
      });

      it("does not add a starter to an owner who already created a workspace", async () => {
        const own = `own-${label}@example.com`;
        await store.createWorkspace(own, "Clients");
        expect((await store.listWorkspaces(own)).map((w) => w.name)).toEqual(["Clients"]);
      });

      it("never deletes an owner's last workspace", async () => {
        const solo = `solo-${label}@example.com`;
        const [only] = await store.listWorkspaces(solo);
        await store.saveList(solo, only.id, list("Precious"));
        await expect(store.deleteWorkspace(solo, only.id)).rejects.toBeInstanceOf(StoreLastWorkspaceError);
        // Nothing was touched.
        expect(await store.getWorkspace(solo, only.id)).not.toBeNull();
        expect((await store.listLists(solo, only.id)).map((l) => l.name)).toEqual(["Precious"]);

        const second = await store.createWorkspace(solo, "Second");
        expect(await store.deleteWorkspace(solo, only.id)).toBe(true);
        await expect(store.deleteWorkspace(solo, second.id)).rejects.toBeInstanceOf(StoreLastWorkspaceError);
        expect((await store.listWorkspaces(solo)).map((w) => w.id)).toEqual([second.id]);
      });

      it("counts only the owner's own workspaces towards the minimum", async () => {
        const a = `min-a-${label}@example.com`;
        const b = `min-b-${label}@example.com`;
        const onlyA = await store.createWorkspace(a, "Just one");
        await store.createWorkspace(b, "B one");
        await store.createWorkspace(b, "B two");
        await expect(store.deleteWorkspace(a, onlyA.id)).rejects.toBeInstanceOf(StoreLastWorkspaceError);
        // A missing id is still just "not found", even for someone with one workspace.
        expect(await store.deleteWorkspace(a, "not-an-id")).toBe(false);
        expect(await store.deleteWorkspace(b, onlyA.id)).toBe(false);
      });

      it("will not write into a workspace that is missing or belongs to someone else", async () => {
        const mine = await store.createWorkspace(owner, "Only mine");
        await expect(store.saveList(BOB, mine.id, list("Sneaky"))).rejects.toBeInstanceOf(StoreNotFoundError);
        await expect(store.saveTemplate(BOB, mine.id, template("Sneaky"))).rejects.toBeInstanceOf(StoreNotFoundError);
        await expect(store.saveList(owner, "not-an-id", list("Nowhere"))).rejects.toBeInstanceOf(StoreNotFoundError);
        await expect(
          store.logMessages(BOB, mine.id, { runId: "run-sneaky001", subject: "s", fromAddress: "a@x.com" }, [
            { rowId: "r0", to: "a@x.com", subject: "s", status: "sent" },
          ]),
        ).rejects.toBeInstanceOf(StoreNotFoundError);
        expect(await store.listLists(owner, mine.id)).toEqual([]);
        expect(await store.listWorkspaces(BOB)).not.toContainEqual(expect.objectContaining({ id: mine.id }));
        expect(await store.getWorkspace(BOB, mine.id)).toBeNull();
      });

      it("caps workspaces per owner", async () => {
        const capped = `many-${label}@example.com`;
        for (let i = 0; i < LIMITS.workspaces; i++) await store.createWorkspace(capped, `W${i}`);
        await expect(store.createWorkspace(capped, "One too many")).rejects.toThrow(/limit of 20 workspaces/);
      });
    });
  });
}

contract("memory", () => createMemoryStore());

const uri = process.env.TEST_MONGODB_URI;
if (uri) {
  const dbName = `postie_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  contract("mongodb", async () => {
    await client.connect();
    const db = client.db(dbName);
    await ensureIndexes(db);
    return createMongoStore(db);
  });
  afterAll(async () => {
    try {
      await client.db(dbName).dropDatabase();
    } finally {
      await client.close();
    }
  }, 30_000);
} else {
  describe.skip("Store contract: mongodb (set TEST_MONGODB_URI to run)", () => it("is skipped", () => {}));
}
