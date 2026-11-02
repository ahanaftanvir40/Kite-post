import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setStoreForTests } from "@/lib/db";
import { createMemoryStore } from "@/lib/db/memory";
import type { Store } from "@/lib/db/types";
import { connectLimiter, savedLimiter, sendLimiter } from "@/lib/limiters";
import { authCookie, cookieFrom, jsonRequest, joinCookies, makeFakeMailer, type FakeMailer } from "./helpers";

let currentMailer: FakeMailer;
vi.mock("@/lib/mail/transport", () => ({
  createMailer: vi.fn(() => currentMailer),
}));

const sessionRoute = () => import("@/app/api/session/route");
const sendRoute = () => import("@/app/api/send/route");
const kindRoute = () => import("@/app/api/saved/[kind]/route");
const itemRoute = () => import("@/app/api/saved/[kind]/[id]/route");

const ALICE = { user: "alice@example.com", password: "abcd efgh ijkl mnop", fromName: "Alice", fromAddress: "alice@brand.io", replyTo: "alice@brand.io" };
const BOB = { user: "bob@example.com", password: "wxyz wxyz wxyz wxyz", fromName: "Bob", fromAddress: "bob@brand.io", replyTo: "bob@brand.io" };

/** Sign in with Google as `creds.user`, then connect that mailbox. Returns the cookies a browser would send. */
async function login(creds: typeof ALICE): Promise<string> {
  const { POST } = await sessionRoute();
  const auth = await authCookie(creds.user);
  const res = await POST(jsonRequest("/api/session", "POST", creds, auth));
  expect(res.status).toBe(200);
  return joinCookies(auth, cookieFrom(res));
}

/** Signed in with Google but no mailbox connected yet. */
async function signedInOnly(email: string): Promise<string> {
  return authCookie(email);
}

const kindCtx = (kind: string) => ({ params: Promise.resolve({ kind }) });
const itemCtx = (kind: string, id: string) => ({ params: Promise.resolve({ kind, id }) });

const wsRoute = () => import("@/app/api/workspaces/route");
const wsItemRoute = () => import("@/app/api/workspaces/[id]/route");
const wsCtx = (id: string) => ({ params: Promise.resolve({ id }) });

/** Query string naming a workspace. Senders are the one kind that takes none. */
const inWs = (ws?: string) => (ws ? `?workspace=${encodeURIComponent(ws)}` : "");

async function createWs(name: string, cookie: string): Promise<string> {
  const { POST } = await wsRoute();
  const res = await POST(jsonRequest("/api/workspaces", "POST", { name }, cookie));
  expect(res.status).toBe(201);
  return (await res.json()).item.id;
}

const WS = new Map<string, string>();
/** The workspace a logged-in test user works in by default. Created on first use. */
async function wsOf(cookie: string): Promise<string> {
  let id = WS.get(cookie);
  if (!id) {
    id = await createWs("Main", cookie);
    WS.set(cookie, id);
  }
  return id;
}

async function save(kind: string, body: unknown, cookie?: string, ws?: string) {
  const { POST } = await kindRoute();
  const w = kind === "senders" ? undefined : (ws ?? (cookie ? await wsOf(cookie) : undefined));
  return POST(jsonRequest(`/api/saved/${kind}${inWs(w)}`, "POST", body, cookie), kindCtx(kind));
}
async function list(kind: string, cookie?: string, ws?: string) {
  const { GET } = await kindRoute();
  const w = kind === "senders" ? undefined : (ws ?? (cookie ? await wsOf(cookie) : undefined));
  return GET(jsonRequest(`/api/saved/${kind}${inWs(w)}`, "GET", undefined, cookie), kindCtx(kind));
}

const tpl = { name: "Welcome", subject: "Hi @firstname", body: "<p>Hello</p>", fallbacks: { firstname: "there" } };
const sheet = {
  name: "Leads",
  fileName: "leads.csv",
  headers: ["Email", "Name"],
  emailColumn: "Email",
  rows: [{ Email: "a@x.com", Name: "Ada" }],
};

let store: Store;

beforeEach(() => {
  WS.clear();
  connectLimiter.reset();
  sendLimiter.reset();
  savedLimiter.reset();
  currentMailer = makeFakeMailer();
  store = createMemoryStore();
  setStoreForTests(store);
  vi.unstubAllEnvs();
  vi.stubEnv("SEND_DELAY_MS", "0");
});

afterEach(() => setStoreForTests(undefined));

describe("access control", () => {
  it("refuses every saved-data route without a connected mailbox", async () => {
    expect((await list("templates")).status).toBe(401);
    expect((await save("templates", tpl)).status).toBe(401);
    const { GET, DELETE, PUT } = await itemRoute();
    expect((await GET(jsonRequest("/x", "GET"), itemCtx("lists", "abc"))).status).toBe(401);
    expect((await DELETE(jsonRequest("/x", "DELETE"), itemCtx("templates", "abc"))).status).toBe(401);
    expect((await PUT(jsonRequest("/x", "PUT"), itemCtx("senders", "abc"))).status).toBe(401);
  });

  it("scopes data to the mailbox that proved its password", async () => {
    const alice = await login(ALICE);
    const bob = await login(BOB);
    const saved = await (await save("templates", tpl, alice)).json();
    await save("lists", sheet, alice);

    expect((await (await list("templates", bob)).json()).items).toEqual([]);
    expect((await (await list("lists", bob)).json()).items).toEqual([]);
    expect((await (await list("templates", alice)).json()).items).toHaveLength(1);

    const { DELETE, GET } = await itemRoute();
    const stolen = await DELETE(jsonRequest(`/x${inWs(await wsOf(bob))}`, "DELETE", undefined, bob), itemCtx("templates", saved.item.id));
    expect(stolen.status).toBe(404);
    const aliceList = (await (await list("lists", alice)).json()).items[0];
    expect((await GET(jsonRequest(`/x${inWs(await wsOf(bob))}`, "GET", undefined, bob), itemCtx("lists", aliceList.id))).status).toBe(404);
    expect((await (await list("templates", alice)).json()).items).toHaveLength(1);
  });

  it("ignores any owner a client tries to smuggle into the body or query", async () => {
    const alice = await login(ALICE);
    const bob = await login(BOB);
    await save("templates", { ...tpl, owner: "bob@example.com" }, alice);
    expect((await (await list("templates", bob)).json()).items).toEqual([]);
    const { GET } = await kindRoute();
    const res = await GET(jsonRequest(`/api/saved/templates?owner=alice@example.com&workspace=${await wsOf(bob)}`, "GET", undefined, bob), kindCtx("templates"));
    expect((await res.json()).items).toEqual([]);
  });

  it("returns 404 for unknown kinds and 405 for write attempts on history", async () => {
    const alice = await login(ALICE);
    expect((await list("secrets", alice)).status).toBe(404);
    expect((await save("runs", {}, alice)).status).toBe(405);
  });
});

describe("saved templates, lists and senders", () => {
  it("saves, lists and deletes a template", async () => {
    const alice = await login(ALICE);
    const res = await save("templates", tpl, alice);
    expect(res.status).toBe(200);
    const { item } = await res.json();
    expect(item).toMatchObject({ name: "Welcome", subject: "Hi @firstname" });
    const { DELETE } = await itemRoute();
    expect((await DELETE(jsonRequest(`/x${inWs(await wsOf(alice))}`, "DELETE", undefined, alice), itemCtx("templates", item.id))).status).toBe(200);
    expect((await (await list("templates", alice)).json()).items).toEqual([]);
  });

  it("saves a list and loads its rows back, but lists only summaries", async () => {
    const alice = await login(ALICE);
    const { item } = await (await save("lists", sheet, alice)).json();
    expect(item).toMatchObject({ rowCount: 1, emailColumn: "Email" });
    expect(item.rows).toBeUndefined();
    const summaries = (await (await list("lists", alice)).json()).items;
    expect(summaries[0].rows).toBeUndefined();
    const { GET } = await itemRoute();
    const full = await (await GET(jsonRequest(`/x${inWs(await wsOf(alice))}`, "GET", undefined, alice), itemCtx("lists", item.id))).json();
    expect(full.item.rows).toEqual(sheet.rows);
  });

  it("remembers the From / Reply-To pair on connect and can switch to it", async () => {
    const alice = await login(ALICE);
    const senders = (await (await list("senders", alice)).json()).items;
    expect(senders).toHaveLength(1);
    expect(senders[0]).toMatchObject({ fromAddress: "alice@brand.io", replyTo: "alice@brand.io" });
    expect(JSON.stringify(senders)).not.toMatch(/abcd|password/i);

    const other = await (await save("senders", { fromName: "Press", fromAddress: "press@brand.io", replyTo: "press@brand.io" }, alice)).json();
    const { PUT } = await itemRoute();
    const res = await PUT(jsonRequest("/x", "PUT", undefined, alice), itemCtx("senders", other.item.id));
    expect(res.status).toBe(200);
    expect((await res.json()).profile).toMatchObject({ user: "alice@example.com", fromAddress: "press@brand.io" });

    // The switch is sealed into the cookie, so the next request sees it.
    const { GET } = await sessionRoute();
    const status = await (await GET(jsonRequest("/api/session", "GET", undefined, joinCookies(await authCookie(ALICE.user), cookieFrom(res))))).json();
    expect(status.profile.fromAddress).toBe("press@brand.io");
  });

  it("will not let one mailbox switch to another mailbox's sender", async () => {
    const alice = await login(ALICE);
    const bob = await login(BOB);
    const bobSender = (await (await list("senders", bob)).json()).items[0];
    const { PUT } = await itemRoute();
    expect((await PUT(jsonRequest("/x", "PUT", undefined, alice), itemCtx("senders", bobSender.id))).status).toBe(404);
  });

  it("validates input", async () => {
    const alice = await login(ALICE);
    expect((await save("templates", { ...tpl, name: "  " }, alice)).status).toBe(400);
    expect((await save("lists", { ...sheet, emailColumn: "Nope" }, alice)).status).toBe(400);
    expect((await save("lists", { ...sheet, rows: [] }, alice)).status).toBe(400);
    expect((await save("senders", { fromName: "x", fromAddress: "nope", replyTo: "a@b.co" }, alice)).status).toBe(400);
    expect((await save("senders", { fromName: "a\nBcc: x@y.z", fromAddress: "a@b.co", replyTo: "a@b.co" }, alice)).status).toBe(400);
  });

  it("explains the limit instead of failing opaquely", async () => {
    const alice = await login(ALICE);
    const w = await wsOf(alice);
    for (let i = 0; i < 100; i++) await store.saveTemplate("alice@example.com", w, { ...tpl, name: `T${i}` });
    const res = await save("templates", { ...tpl, name: "Extra" }, alice);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/limit of 100/);
  });
});

describe("when the database is unavailable", () => {
  it("says saving is off when no database is configured", async () => {
    setStoreForTests(null);
    const alice = await login(ALICE);
    const res = await list("templates", alice, "any");
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("storage-off");
  });

  it("returns a clean message, with no internals, when a query throws", async () => {
    const alice = await login(ALICE);
    await wsOf(alice);
    setStoreForTests({ ...store, listTemplates: async () => { throw new Error("mongodb://user:secret@host timed out"); } });
    const res = await list("templates", alice);
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toMatch(/secret|mongodb:\/\//);
  });

  it("still connects when saving the sender fails", async () => {
    setStoreForTests({ ...store, saveSender: async () => { throw new Error("down"); } });
    const { POST } = await sessionRoute();
    expect((await POST(jsonRequest("/api/session", "POST", ALICE, await authCookie(ALICE.user)))).status).toBe(200);
  });
});

describe("marking a list as done", () => {
  const patch = async (id: string, body: unknown, cookie?: string, ws?: string) => {
    const { PATCH } = await itemRoute();
    const w = ws ?? (cookie ? await wsOf(cookie) : undefined);
    return PATCH(jsonRequest(`/api/saved/lists/${id}${inWs(w)}`, "PATCH", body, cookie), itemCtx("lists", id));
  };

  it("needs a signed-in account", async () => {
    expect((await patch("abc", { done: true })).status).toBe(401);
  });

  it("marks a list done and moves it back, keeping its rows", async () => {
    const alice = await login(ALICE);
    const { item } = await (await save("lists", sheet, alice)).json();
    expect(item.doneAt).toBeUndefined();

    const done = await (await patch(item.id, { done: true }, alice)).json();
    expect(done.item).toMatchObject({ id: item.id, name: item.name, rowCount: item.rowCount });
    expect(typeof done.item.doneAt).toBe("string");
    expect((await (await list("lists", alice)).json()).items[0].doneAt).toBe(done.item.doneAt);

    const { GET } = await itemRoute();
    const full = await GET(jsonRequest(`/api/saved/lists/${item.id}${inWs(await wsOf(alice))}`, "GET", undefined, alice), itemCtx("lists", item.id));
    expect((await full.json()).item.rows).toHaveLength(item.rowCount);

    const back = await (await patch(item.id, { done: false }, alice)).json();
    expect(back.item.doneAt).toBeUndefined();
    expect((await (await list("lists", alice)).json()).items[0].doneAt).toBeUndefined();
  });

  it("keeps the done mark when the list is saved again", async () => {
    const alice = await login(ALICE);
    const { item } = await (await save("lists", sheet, alice)).json();
    await patch(item.id, { done: true }, alice);
    await save("lists", sheet, alice);
    expect((await (await list("lists", alice)).json()).items[0].doneAt).toBeDefined();
  });

  it("validates the body and only touches your own lists", async () => {
    const alice = await login(ALICE);
    const bob = await login(BOB);
    const { item } = await (await save("lists", sheet, alice)).json();
    expect((await patch(item.id, { done: "yes" }, alice)).status).toBe(400);
    expect((await patch(item.id, {}, alice)).status).toBe(400);
    expect((await patch(item.id, { done: true }, bob)).status).toBe(404);
    expect((await (await list("lists", alice)).json()).items[0].doneAt).toBeUndefined();
    expect((await patch("000000000000000000000000", { done: true }, alice)).status).toBe(404);
  });

  it("is only for lists", async () => {
    const alice = await login(ALICE);
    const { PATCH } = await itemRoute();
    const res = await PATCH(jsonRequest("/api/saved/templates/abc", "PATCH", { done: true }, alice), itemCtx("templates", "abc"));
    expect(res.status).toBe(405);
  });
});

describe("deleting a file's send history", () => {
  const messages = [{ rowId: "r0", to: "a@x.com", subject: "Hi", html: "<p>Hi</p>" }];

  async function del(cookie: string, query: string) {
    const { DELETE } = await kindRoute();
    return DELETE(jsonRequest(`/api/saved/runs${query}`, "DELETE", undefined, cookie), kindCtx("runs"));
  }

  it("removes the runs sent from that file and reports 404 once nothing is left", async () => {
    currentMailer = makeFakeMailer();
    const alice = await login(ALICE);
    const ws = await wsOf(alice);
    const { POST } = await sendRoute();
    const res = await POST(jsonRequest("/api/send", "POST", { messages, run: { runId: "run-delfile01", subject: "Hi", workspaceId: ws, fileName: "leads.xlsx" } }, alice));
    expect(res.status).toBe(200);

    const url = `${inWs(ws)}&file=${encodeURIComponent("leads.xlsx")}`;
    const removed = await del(alice, url);
    expect(removed.status).toBe(200);
    expect((await removed.json()).deleted).toBe(1);
    expect((await (await list("runs", alice, ws)).json()).items).toHaveLength(0);
    expect((await del(alice, url)).status).toBe(404);
  });

  it("needs a file name, a workspace and a signed-in user", async () => {
    const alice = await login(ALICE);
    const ws = await wsOf(alice);
    expect((await del(alice, inWs(ws))).status).toBe(400);
    expect((await del(alice, "?file=x.csv")).status).toBe(400);
    expect((await del("", `${inWs(ws)}&file=x.csv`)).status).toBe(401);
  });

  it("only applies to send history", async () => {
    const alice = await login(ALICE);
    const { DELETE } = await kindRoute();
    expect((await DELETE(jsonRequest("/api/saved/lists", "DELETE", undefined, alice), kindCtx("lists"))).status).toBe(405);
  });
});

describe("send history", () => {
  const messages = [
    { rowId: "r0", to: "a@x.com", subject: "Hi Ada", html: "<p>Hi</p>" },
    { rowId: "r1", to: "b@x.com", subject: "Hi Bo", html: "<p>Hi</p>" },
  ];
  const runIn = (workspaceId: string) => ({ runId: "run-12345678", subject: "Hi @firstname", workspaceId });

  async function send(cookie: string, body: unknown) {
    const { POST } = await sendRoute();
    return POST(jsonRequest("/api/send", "POST", body, cookie));
  }
  async function log(cookie: string, runId: string, ws: string) {
    const { GET } = await itemRoute();
    return (await (await GET(jsonRequest(`/x${inWs(ws)}`, "GET", undefined, cookie), itemCtx("runs", runId))).json()).items;
  }

  it("records outcomes for the run, scoped to the sender and the workspace", async () => {
    currentMailer = makeFakeMailer({
      send: async (m) => {
        if (m.to === "b@x.com") throw { code: "EENVELOPE", responseCode: 550, message: "No such user" };
        return {};
      },
    });
    const alice = await login(ALICE);
    const ws = await wsOf(alice);
    const run = runIn(ws);
    const res = await send(alice, { messages, run });
    expect(res.status).toBe(200);

    const runs = (await (await list("runs", alice)).json()).items;
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ runId: run.runId, sent: 1, failed: 1, fromAddress: "alice@brand.io", subject: "Hi @firstname" });
    expect((await log(alice, run.runId, ws)).map((l: { to: string; status: string }) => [l.to, l.status])).toEqual([
      ["a@x.com", "sent"],
      ["b@x.com", "failed"],
    ]);

    const bob = await login(BOB);
    expect((await (await list("runs", bob)).json()).items).toEqual([]);
    expect(await log(bob, run.runId, await wsOf(bob))).toEqual([]);
    // Naming Alice's workspace does not open her history to Bob.
    const { GET } = await itemRoute();
    expect((await GET(jsonRequest(`/x${inWs(ws)}`, "GET", undefined, bob), itemCtx("runs", run.runId))).status).toBe(404);
  });

  it("remembers which spreadsheet a run was sent from, from the first chunk on", async () => {
    const alice = await login(ALICE);
    const ws = await wsOf(alice);
    const run = { ...runIn(ws), fileName: "  spring-leads.xlsx " };
    await send(alice, { messages: [messages[0]], run });
    await send(alice, { messages: [messages[1]], run: { ...run, fileName: "something-else.xlsx" } });
    const runs = (await (await list("runs", alice)).json()).items;
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ fileName: "spring-leads.xlsx", sent: 2 });
  });

  it("still records a run that came with no file", async () => {
    const alice = await login(ALICE);
    const ws = await wsOf(alice);
    expect((await send(alice, { messages, run: runIn(ws) })).status).toBe(200);
    const [only] = (await (await list("runs", alice)).json()).items;
    expect(only).not.toHaveProperty("fileName");
  });

  it("rejects an oversized file name instead of storing it", async () => {
    const alice = await login(ALICE);
    const ws = await wsOf(alice);
    expect((await send(alice, { messages, run: { ...runIn(ws), fileName: "x".repeat(201) } })).status).toBe(400);
  });

  it("files the run under the workspace it was sent from", async () => {
    const alice = await login(ALICE);
    const first = await wsOf(alice);
    const second = await createWs("Second", alice);
    await send(alice, { messages, run: runIn(second) });
    expect((await (await list("runs", alice, first)).json()).items).toEqual([]);
    expect((await (await list("runs", alice, second)).json()).items).toHaveLength(1);
  });

  it("does not record anything when the client sends no run", async () => {
    const alice = await login(ALICE);
    await send(alice, { messages });
    expect((await (await list("runs", alice)).json()).items).toEqual([]);
  });

  it("does not record rows that were skipped after a fatal error", async () => {
    currentMailer = makeFakeMailer({
      send: async () => {
        throw { code: "EAUTH", responseCode: 535, message: "bad credentials" };
      },
    });
    const alice = await login(ALICE);
    await send(alice, { messages, run: runIn(await wsOf(alice)) });
    const runs = (await (await list("runs", alice)).json()).items;
    expect(runs[0]).toMatchObject({ sent: 0, failed: 1 });
  });

  it("still sends, but writes nothing, when the run names a workspace that is not yours", async () => {
    const alice = await login(ALICE);
    const bob = await login(BOB);
    const aliceWs = await wsOf(alice);
    const res = await send(bob, { messages, run: runIn(aliceWs) });
    expect(res.status).toBe(200);
    expect((await res.json()).outcomes).toHaveLength(2);
    expect((await (await list("runs", alice)).json()).items).toEqual([]);
    expect((await (await list("runs", bob)).json()).items).toEqual([]);
  });

  it("still reports the sends when history cannot be written", async () => {
    const alice = await login(ALICE);
    const run = runIn(await wsOf(alice));
    setStoreForTests({ ...store, logMessages: async () => { throw new Error("down"); } });
    const res = await send(alice, { messages, run });
    expect(res.status).toBe(200);
    expect((await res.json()).outcomes).toHaveLength(2);
  });

  it("rejects a malformed run id, and a run without a workspace", async () => {
    const alice = await login(ALICE);
    const ws = await wsOf(alice);
    expect((await send(alice, { messages, run: { runId: "../etc", subject: "x", workspaceId: ws } })).status).toBe(400);
    expect((await send(alice, { messages, run: { runId: "run-12345678", subject: "x" } })).status).toBe(400);
  });
});

describe("workspaces", () => {
  const call = async (method: "GET" | "POST", body: unknown, cookie?: string) => {
    const route = await wsRoute();
    return route[method](jsonRequest("/api/workspaces", method, body, cookie));
  };
  const one = async (method: "GET" | "PATCH" | "DELETE", id: string, body?: unknown, cookie?: string) => {
    const route = await wsItemRoute();
    return route[method](jsonRequest(`/api/workspaces/${id}`, method, body, cookie), wsCtx(id));
  };

  it("needs a connected mailbox for every workspace route", async () => {
    expect((await call("GET", undefined)).status).toBe(401);
    expect((await call("POST", { name: "x" })).status).toBe(401);
    expect((await one("GET", "abc")).status).toBe(401);
    expect((await one("PATCH", "abc", { name: "x" })).status).toBe(401);
    expect((await one("DELETE", "abc")).status).toBe(401);
  });

  it("creates, lists, renames and deletes a workspace", async () => {
    const alice = await login(ALICE);
    const created = await call("POST", { name: "  Spring  " }, alice);
    expect(created.status).toBe(201);
    const { item } = await created.json();
    expect(item).toMatchObject({ name: "Spring", counts: { lists: 0, templates: 0, runs: 0 } });

    expect((await (await call("GET", undefined, alice)).json()).items.map((w: { name: string }) => w.name)).toEqual(["My workspace", "Spring"]);
    expect((await (await one("PATCH", item.id, { name: "Summer" }, alice)).json()).item.name).toBe("Summer");
    expect((await (await one("GET", item.id, undefined, alice)).json()).item.name).toBe("Summer");
    expect((await one("DELETE", item.id, undefined, alice)).status).toBe(200);
    expect((await one("GET", item.id, undefined, alice)).status).toBe(404);
    expect((await one("DELETE", item.id, undefined, alice)).status).toBe(404);
  });

  it("lets a signed-in account create and keep workspaces before any mailbox is connected", async () => {
    const cookie = await signedInOnly("newbie@example.com");
    // Loading the app checks the session, which records the account and its starter workspace.
    const { GET } = await sessionRoute();
    expect((await (await GET(jsonRequest("/api/session", "GET", undefined, cookie))).json()).account).toBe("newbie@example.com");
    const created = await call("POST", { name: "Launch" }, cookie);
    expect(created.status).toBe(201);
    const names = (await (await call("GET", undefined, cookie)).json()).items.map((w: { name: string }) => w.name);
    expect(names).toEqual(["My workspace", "Launch"]);
    expect(await store.listWorkspaces("newbie@example.com")).toHaveLength(2);
    expect(await store.getUser("newbie@example.com")).toMatchObject({ email: "newbie@example.com" });
  });

  it("validates names and explains duplicates and limits", async () => {
    const alice = await login(ALICE);
    expect((await call("POST", { name: "   " }, alice)).status).toBe(400);
    expect((await call("POST", { name: "a\nb" }, alice)).status).toBe(400);
    expect((await call("POST", {}, alice)).status).toBe(400);
    expect((await call("POST", { name: "x".repeat(81) }, alice)).status).toBe(400);

    await call("POST", { name: "Clients" }, alice);
    const dup = await call("POST", { name: " clients " }, alice);
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({ code: "conflict", error: expect.stringMatching(/already have a workspace called "clients"/) });

    for (let i = 0; i < 18; i++) await store.createWorkspace("alice@example.com", `W${i}`);
    const over = await call("POST", { name: "Extra" }, alice);
    expect(over.status).toBe(409);
    expect((await over.json()).error).toMatch(/limit of 20 workspaces/);
  });

  it("never shows, renames or deletes another mailbox's workspace", async () => {
    const alice = await login(ALICE);
    const bob = await login(BOB);
    const mine = await createWs("Private", alice);

    // Bob sees only his own starter workspace, never Alice's.
    const bobs = (await (await call("GET", undefined, bob)).json()).items;
    expect(bobs).toHaveLength(1);
    expect(bobs[0].id).not.toBe(mine);
    expect((await one("GET", mine, undefined, bob)).status).toBe(404);
    expect((await one("PATCH", mine, { name: "Hijacked" }, bob)).status).toBe(404);
    expect((await one("DELETE", mine, undefined, bob)).status).toBe(404);
    expect((await (await one("GET", mine, undefined, alice)).json()).item.name).toBe("Private");
  });

  it("gives a mailbox with no workspace a starter one, once", async () => {
    const alice = await login(ALICE);
    const first = (await (await call("GET", undefined, alice)).json()).items;
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ name: "My workspace", counts: { lists: 0, templates: 0, runs: 0 } });
    const again = (await (await call("GET", undefined, alice)).json()).items;
    expect(again.map((w: { id: string }) => w.id)).toEqual([first[0].id]);
  });

  it("does not add a starter workspace to a mailbox that already has one", async () => {
    const alice = await login(ALICE);
    await createWs("Clients", alice);
    expect((await (await call("GET", undefined, alice)).json()).items.map((w: { name: string }) => w.name)).toEqual(["My workspace", "Clients"]);
  });

  it("refuses to delete the last workspace, and says why", async () => {
    const alice = await login(ALICE);
    const [starter] = (await (await call("GET", undefined, alice)).json()).items;
    const refused = await one("DELETE", starter.id, undefined, alice);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "last-workspace", error: expect.stringMatching(/at least one workspace/) });
    expect((await one("GET", starter.id, undefined, alice)).status).toBe(200);

    // Once there is another, either can go, but never both.
    const other = await createWs("Second", alice);
    expect((await one("DELETE", starter.id, undefined, alice)).status).toBe(200);
    expect((await one("DELETE", other, undefined, alice)).status).toBe(409);
    expect((await (await call("GET", undefined, alice)).json()).items.map((w: { id: string }) => w.id)).toEqual([other]);
  });

  it("does not count another mailbox's workspaces towards the minimum", async () => {
    const alice = await login(ALICE);
    const bob = await login(BOB);
    const [starter] = (await (await call("GET", undefined, alice)).json()).items;
    await createWs("Bob one", bob);
    await createWs("Bob two", bob);
    expect((await one("DELETE", starter.id, undefined, alice)).status).toBe(409);
  });

  it("keeps each workspace's lists, templates and history apart", async () => {
    const alice = await login(ALICE);
    const a = await createWs("Alpha", alice);
    const b = await createWs("Beta", alice);
    await save("lists", sheet, alice, a);
    await save("templates", tpl, alice, b);

    const items = async (kind: string, ws: string) => (await (await list(kind, alice, ws)).json()).items;
    expect(await items("lists", a)).toHaveLength(1);
    expect(await items("lists", b)).toEqual([]);
    expect(await items("templates", a)).toEqual([]);
    expect(await items("templates", b)).toHaveLength(1);

    const { GET, DELETE } = await itemRoute();
    const listed = (await items("lists", a))[0];
    expect((await GET(jsonRequest(`/x${inWs(b)}`, "GET", undefined, alice), itemCtx("lists", listed.id))).status).toBe(404);
    expect((await DELETE(jsonRequest(`/x${inWs(b)}`, "DELETE", undefined, alice), itemCtx("lists", listed.id))).status).toBe(404);
    expect((await GET(jsonRequest(`/x${inWs(a)}`, "GET", undefined, alice), itemCtx("lists", listed.id))).status).toBe(200);
  });

  it("refuses saved-data requests that name no workspace, a missing one, or someone else's", async () => {
    const alice = await login(ALICE);
    const bob = await login(BOB);
    const aliceWs = await createWs("Alice only", alice);
    await save("lists", sheet, alice, aliceWs);

    const { GET, POST } = await kindRoute();
    const noWs = await GET(jsonRequest("/api/saved/lists", "GET", undefined, alice), kindCtx("lists"));
    expect(noWs.status).toBe(400);
    expect((await noWs.json()).code).toBe("no-workspace");
    expect((await list("lists", alice, "does-not-exist")).status).toBe(404);

    // Bob names Alice's real workspace id: read, write and delete all fail without leaking anything.
    const read = await list("lists", bob, aliceWs);
    expect(read.status).toBe(404);
    expect(await read.text()).not.toMatch(/Leads/);
    expect((await save("lists", sheet, bob, aliceWs)).status).toBe(404);
    expect((await save("templates", tpl, bob, aliceWs)).status).toBe(404);
    expect((await list("runs", bob, aliceWs)).status).toBe(404);
    const res = await POST(jsonRequest(`/api/saved/lists${inWs(aliceWs)}`, "POST", { ...sheet, workspaceId: aliceWs }, bob), kindCtx("lists"));
    expect(res.status).toBe(404);
    expect((await (await list("lists", alice, aliceWs)).json()).items).toHaveLength(1);
  });

  it("keeps sender aliases at the mailbox level, with no workspace needed", async () => {
    const alice = await login(ALICE);
    const { GET } = await kindRoute();
    const res = await GET(jsonRequest("/api/saved/senders", "GET", undefined, alice), kindCtx("senders"));
    expect(res.status).toBe(200);
    expect((await res.json()).items).toHaveLength(1);
  });

  it("deletes everything inside a workspace along with it", async () => {
    const alice = await login(ALICE);
    await createWs("Keeper", alice);
    const doomed = await createWs("Doomed", alice);
    await save("lists", sheet, alice, doomed);
    await save("templates", tpl, alice, doomed);
    expect((await (await call("GET", undefined, alice)).json()).items.find((w: { id: string }) => w.id === doomed).counts).toMatchObject({ lists: 1, templates: 1 });
    expect((await one("DELETE", doomed, undefined, alice)).status).toBe(200);
    expect((await list("lists", alice, doomed)).status).toBe(404);
    expect(await store.listLists("alice@example.com", doomed)).toEqual([]);
  });

  it("gives a clean message when the database fails", async () => {
    const alice = await login(ALICE);
    setStoreForTests({ ...store, listWorkspaces: async () => { throw new Error("mongodb://u:secret@h down"); } });
    const res = await call("GET", undefined, alice);
    expect(res.status).toBe(503);
    expect(await res.text()).not.toMatch(/secret|mongodb:\/\//);
  });
});
