import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/leads/history/route";
import { setStoreForTests } from "@/lib/db";
import { createMemoryStore } from "@/lib/db/memory";
import { authCookie, jsonRequest } from "./helpers";

const crawl = { pages: { uk: 2 }, urls: ["https://ox.ac.uk/a"] };
const params = { kind: "professors", field: "Machine Learning", level: "phd", countries: ["uk", "de"], university: "" };

beforeEach(() => setStoreForTests(createMemoryStore()));
afterEach(() => setStoreForTests(undefined));

const lookup = async (email: string, q: Record<string, string>) =>
  GET(jsonRequest(`/api/leads/history?${new URLSearchParams({ university: "", ...q })}`, "GET", undefined, await authCookie(email)));
const save = async (email: string, body: unknown) => POST(jsonRequest("/api/leads/history", "POST", body, await authCookie(email)));
const query = (over: Record<string, string> = {}) => ({ kind: "professors", field: "Machine Learning", level: "phd", countries: "uk,de", ...over });

describe("student search history", () => {
  it("needs a signed-in account", async () => {
    expect((await POST(jsonRequest("/api/leads/history", "POST", { params, contacts: [], crawl }))).status).toBe(401);
    expect((await GET(jsonRequest("/api/leads/history?kind=professors", "GET"))).status).toBe(401);
  });

  it("finds an earlier download with the same settings, however they are typed", async () => {
    expect(((await (await lookup("a@example.com", query())).json()) as { previous: unknown }).previous).toBeNull();
    expect((await save("a@example.com", { params, contacts: ["x@ox.ac.uk", "y@tum.de"], crawl })).status).toBe(200);

    for (const q of [query(), query({ field: "  machine   LEARNING " }), query({ countries: "de,uk" })]) {
      const body = (await (await lookup("a@example.com", q)).json()) as { previous: { contacts: string[]; downloads: number } };
      expect(body.previous).toMatchObject({ contacts: ["x@ox.ac.uk", "y@tum.de"], downloads: 1 });
    }
  });

  it("does not match different settings or another account", async () => {
    await save("a@example.com", { params, contacts: ["x@ox.ac.uk"], crawl });
    for (const q of [query({ field: "physics" }), query({ level: "masters" }), query({ kind: "admissions" }), query({ countries: "uk" }), query({ university: "Oxford" })]) {
      expect(((await (await lookup("a@example.com", q)).json()) as { previous: unknown }).previous).toBeNull();
    }
    expect(((await (await lookup("b@example.com", query())).json()) as { previous: unknown }).previous).toBeNull();
  });

  it("adds to the remembered contacts when the same search is downloaded again", async () => {
    await save("a@example.com", { params, contacts: ["x@ox.ac.uk"], crawl });
    expect(await (await save("a@example.com", { params, contacts: ["z@ox.ac.uk"], crawl: { pages: { uk: 3 }, urls: [] } })).json()).toMatchObject({ downloads: 2 });
    const body = (await (await lookup("a@example.com", query())).json()) as { previous: { contacts: string[]; crawl: unknown } };
    expect(body.previous.contacts.sort()).toEqual(["x@ox.ac.uk", "z@ox.ac.uk"]);
    expect(body.previous).toMatchObject({ crawl: { pages: { uk: 3 }, urls: ["https://ox.ac.uk/a"] } });
  });

  it("rejects settings it does not understand", async () => {
    expect((await save("a@example.com", { params: { ...params, countries: ["narnia"] }, contacts: [], crawl })).status).toBe(400);
    expect((await save("a@example.com", { params: { ...params, countries: [] }, contacts: [], crawl })).status).toBe(400);
    expect((await lookup("a@example.com", query({ level: "nope" }))).status).toBe(400);
  });

  it("rejects progress for a country that does not exist", async () => {
    expect((await save("a@example.com", { params, contacts: [], crawl: { pages: { narnia: 1 }, urls: [] } })).status).toBe(400);
  });

  it("answers 503 rather than crashing when saving is off", async () => {
    setStoreForTests(null);
    expect((await lookup("a@example.com", query())).status).toBe(503);
  });
});
