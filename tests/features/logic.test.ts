import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyze, bodyIsEmpty, fieldsFor, mergeRows, preflight, resultsToCsv, runCounts } from "@/features/merge/compose";
import { ApiError } from "@/features/merge/api";
import { runQueue } from "@/features/merge/queue";
import {
  activeSheet,
  pendingIds,
  resetMergeStore,
  sendableRecipients,
  useMergeStore,
} from "@/features/merge/store";
import { stepIndex, progressFraction } from "@/lib/motion";
import { parseSpreadsheet } from "@/lib/spreadsheet";

const csv = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

function load(text: string) {
  useMergeStore.getState().loadWorkbook(parseSpreadsheet("t.csv", csv(text)));
}

beforeEach(() => resetMergeStore());

describe("store: recipients", () => {
  it("detects the email column and excludes flagged rows by default", () => {
    load("Name,Email\nAda,ada@x.com\nBad,nope\nAda again,ADA@x.com\nBlank,");
    const s = useMergeStore.getState();
    expect(s.emailColumn).toBe("Email");
    expect(s.recipients.map((r) => r.issues)).toEqual([[], ["invalid-email"], ["duplicate"], ["empty-email"]]);
    expect(sendableRecipients(s).map((r) => r.email)).toEqual(["ada@x.com"]);
  });

  it("lets a duplicate be re-included but never an invalid row", () => {
    load("Email\na@x.com\na@x.com\nbad");
    const st = useMergeStore.getState();
    st.toggleExcluded("r1");
    expect(sendableRecipients(useMergeStore.getState()).map((r) => r.id)).toEqual(["r0", "r1"]);
    st.toggleExcluded("r2");
    expect(sendableRecipients(useMergeStore.getState()).map((r) => r.id)).toEqual(["r0", "r1"]);
  });

  it("rebuilds recipients when the email column changes", () => {
    load("Email,Backup\na@x.com,b@x.com");
    useMergeStore.getState().setEmailColumn("Backup");
    expect(useMergeStore.getState().recipients[0].email).toBe("b@x.com");
  });

  it("switches sheets and clears the workbook", () => {
    load("Email\na@x.com");
    expect(activeSheet(useMergeStore.getState())?.name).toBeTruthy();
    useMergeStore.getState().clearWorkbook();
    expect(useMergeStore.getState().recipients).toEqual([]);
    expect(activeSheet(useMergeStore.getState())).toBeNull();
  });

  it("includes all or none", () => {
    load("Email\na@x.com\nb@x.com\nbad");
    useMergeStore.getState().setAllIncluded(false);
    expect(sendableRecipients(useMergeStore.getState())).toHaveLength(0);
    useMergeStore.getState().setAllIncluded(true);
    expect(sendableRecipients(useMergeStore.getState())).toHaveLength(2);
  });

  it("loads the sample and fills an empty template only", () => {
    useMergeStore.getState().loadSample();
    let s = useMergeStore.getState();
    expect(s.recipients).toHaveLength(4);
    expect(s.subject).toContain("@firstname");

    resetMergeStore();
    useMergeStore.getState().setSubject("Mine");
    useMergeStore.getState().loadSample();
    s = useMergeStore.getState();
    expect(s.subject).toBe("Mine");
  });

  it("stores and clears fallbacks", () => {
    const st = useMergeStore.getState();
    st.setFallback("firstname", "there");
    expect(useMergeStore.getState().fallbacks).toEqual({ firstname: "there" });
    st.setFallback("firstname", "  ");
    expect(useMergeStore.getState().fallbacks).toEqual({});
  });

  it("forgets the test email when the mailbox disconnects", () => {
    const st = useMergeStore.getState();
    const status = { connected: true, accessCodeRequired: false, localAccountAvailable: false, maxRecipientsPerRun: 100 };
    st.setSession(status);
    st.markTestSent();
    st.setSession(status);
    expect(useMergeStore.getState().testSent).toBe(true);
    st.setSession({ ...status, connected: false });
    expect(useMergeStore.getState().testSent).toBe(false);
  });
});

describe("store: run", () => {
  it("records outcomes, ignores skipped, and requeues only failures", () => {
    const st = useMergeStore.getState();
    st.startRun(["r0", "r1", "r2"]);
    st.applyOutcomes([
      { rowId: "r0", status: "sent" },
      { rowId: "r1", status: "failed", code: "recipient", error: "bad" },
      { rowId: "r2", status: "skipped" },
    ]);
    let run = useMergeStore.getState().run;
    expect(pendingIds(run)).toEqual(["r2"]);
    expect(runCounts(run)).toEqual({ total: 3, sent: 1, failed: 1, pending: 1 });
    st.requeueFailed();
    run = useMergeStore.getState().run;
    expect(pendingIds(run)).toEqual(["r1", "r2"]);
    expect(run.status).toBe("running");
  });
});

describe("queue", () => {
  const msgs = Array.from({ length: 7 }, (_, i) => ({ rowId: `r${i}`, to: `a${i}@x.com`, subject: "s", html: "<p>h</p>" }));
  const sent = (rowIds: string[]) => ({
    halted: false,
    outcomes: rowIds.map((rowId) => ({ rowId, status: "sent" as const })),
  });

  it("posts in chunks of five and reports each", async () => {
    const post = vi.fn(async (m: typeof msgs) => sent(m.map((x) => x.rowId)));
    const onOutcomes = vi.fn();
    const end = await runQueue(msgs, { post, stopSignal: () => null, onOutcomes });
    expect(end).toEqual({ reason: "done" });
    expect(post.mock.calls.map((c) => c[0].length)).toEqual([5, 2]);
    expect(onOutcomes).toHaveBeenCalledTimes(2);
  });

  it("pauses and cancels between chunks", async () => {
    let signal: "pause" | "cancel" | null = null;
    const post = vi.fn(async (m: typeof msgs) => {
      signal = "pause";
      return sent(m.map((x) => x.rowId));
    });
    expect(await runQueue(msgs, { post, stopSignal: () => signal, onOutcomes: () => {} })).toEqual({ reason: "paused" });
    expect(post).toHaveBeenCalledTimes(1);

    signal = "cancel";
    expect(await runQueue(msgs, { post, stopSignal: () => signal, onOutcomes: () => {} })).toEqual({ reason: "cancelled" });
  });

  it("stops on a halted batch, keeping skipped rows pending", async () => {
    const onOutcomes = vi.fn();
    const post = vi.fn(async () => ({
      halted: true,
      outcomes: [
        { rowId: "r0", status: "sent" as const },
        { rowId: "r1", status: "failed" as const, code: "auth" as const, error: "App password rejected" },
        { rowId: "r2", status: "skipped" as const },
      ],
    }));
    const end = await runQueue(msgs, { post, stopSignal: () => null, onOutcomes });
    expect(end).toEqual({ reason: "fatal", message: "App password rejected" });
    expect(post).toHaveBeenCalledTimes(1);
    expect(onOutcomes.mock.calls[0][0].map((o: { rowId: string }) => o.rowId)).toEqual(["r0", "r1"]);
  });

  it("surfaces a failed request as fatal", async () => {
    const post = vi.fn(async () => {
      throw new ApiError("Not connected.", 401, "no-session");
    });
    expect(await runQueue(msgs, { post, stopSignal: () => null, onOutcomes: () => {} })).toEqual({
      reason: "fatal",
      message: "Not connected.",
    });
  });
});

describe("compose", () => {
  const fields = fieldsFor(["First Name", "Email", "Company"]);

  it("merges rows with fallbacks and reports gaps", () => {
    load("First Name,Email,Company\nAda,a@x.com,Acme\n,b@x.com,");
    const { recipients } = useMergeStore.getState();
    const rows = mergeRows(recipients, "Hi @firstname", "<p>@firstname at @company</p>", { firstname: "there" });
    expect(rows[0].message).toMatchObject({ to: "a@x.com", subject: "Hi Ada", html: "<p>Ada at Acme</p>" });
    expect(rows[1].message.subject).toBe("Hi there");
    expect(rows[1].empty).toEqual(["company"]);
  });

  it("escapes cell values and strips line breaks from the subject", () => {
    load("First Name,Email\n\"<b>x</b>\",a@x.com");
    const rows = mergeRows(useMergeStore.getState().recipients, "S\r\n@firstname", "<p>@firstname</p>", {});
    expect(rows[0].message.html).toBe("<p>&lt;b&gt;x&lt;/b&gt;</p>");
    expect(rows[0].message.subject).not.toMatch(/[\r\n]/);
  });

  it("detects an empty body", () => {
    expect(bodyIsEmpty("<p></p>")).toBe(true);
    expect(bodyIsEmpty("<p>hi</p>")).toBe(false);
  });

  const base = {
    connected: true,
    user: "team@mybedigital.com",
    fromAddress: "team@resumestart.ai",
    fromName: "ResumeStart Team",
    replyTo: "team@resumestart.ai",
    quotaLabel: "about 2,000 messages a day on Google Workspace",
    sendableCount: 3,
    maxRecipients: 100,
    subject: "Hi @firstname",
    body: "<p>Hello @firstname</p>",
    analysis: analyze("Hi @firstname", "<p>Hello @firstname</p>", fields),
    emptyRows: 0,
    testSent: true,
  };

  it("passes a clean preflight", () => {
    const { checks, canSend } = preflight(base);
    expect(canSend).toBe(true);
    expect(checks.find((c) => c.id === "sender")?.text).toContain("ResumeStart Team <team@resumestart.ai>");
  });

  it("blocks on unknown tokens, naming a suggestion", () => {
    const { checks, canSend } = preflight({ ...base, analysis: analyze("Hi @frstname", "<p>x</p>", fields) });
    expect(canSend).toBe(false);
    expect(checks.find((c) => c.id === "tokens")?.text).toContain("did you mean @firstname");
  });

  it("blocks when disconnected, empty, or over the cap", () => {
    expect(preflight({ ...base, connected: false }).canSend).toBe(false);
    expect(preflight({ ...base, sendableCount: 0 }).canSend).toBe(false);
    expect(preflight({ ...base, sendableCount: 101 }).canSend).toBe(false);
    expect(preflight({ ...base, subject: " " }).canSend).toBe(false);
    expect(preflight({ ...base, body: "<p></p>" }).canSend).toBe(false);
  });

  it("only warns about missing test email and empty values", () => {
    const { checks, canSend } = preflight({ ...base, testSent: false, emptyRows: 2 });
    expect(canSend).toBe(true);
    expect(checks.filter((c) => c.level === "warn").map((c) => c.id)).toEqual(["empty", "test"]);
  });

  it("exports results CSV with formula-injection protection", () => {
    load("Email\na@x.com\nb@x.com\nc@x.com");
    const { recipients } = useMergeStore.getState();
    const csvText = resultsToCsv(recipients, {
      status: "stopped",
      runId: "run-test0000",
      queue: ["r0", "r1", "r2"],
      results: { r0: { status: "sent" }, r1: { status: "failed", error: '=HYPERLINK("x"), bad' } },
      fatal: null,
    });
    const lines = csvText.split("\r\n");
    expect(lines[0]).toBe("row,email,status,detail");
    expect(lines[1]).toBe("1,a@x.com,sent,");
    expect(lines[2]).toBe(`2,b@x.com,failed,"'=HYPERLINK(""x""), bad"`);
    expect(lines[3]).toBe("3,c@x.com,pending,");
  });
});

describe("motion helpers", () => {
  it("wraps preview stepping and clamps progress", () => {
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, 1, 0)).toBe(0);
    expect(progressFraction(5, 10)).toBe(0.5);
    expect(progressFraction(12, 10)).toBe(1);
    expect(progressFraction(1, 0)).toBe(0);
  });
});
