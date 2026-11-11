// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/features/merge/api";
import { PreviewPane } from "@/features/merge/components/PreviewPane";
import { SendPanel } from "@/features/merge/components/SendPanel";
import { nextStep, StatusBar } from "@/features/merge/components/StatusBar";
import { Workspace } from "@/features/merge/components/Workspace";
import { mergeRows } from "@/features/merge/compose";
import { resetMergeStore, useMergeStore } from "@/features/merge/store";
import type { SessionStatus } from "@/features/merge/api";

vi.mock("@/features/merge/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/merge/api")>();
  return {
    ...actual,
    getSession: vi.fn(),
    connect: vi.fn(),
    connectLocal: vi.fn(),
    disconnect: vi.fn(),
    sendChunk: vi.fn(),
    sendTest: vi.fn(),
  };
});

const CONNECTED: SessionStatus = {
  connected: true,
  account: "team@mybedigital.com",
  profile: {
    user: "team@mybedigital.com",
    fromName: "ResumeStart Team",
    fromAddress: "team@resumestart.ai",
    replyTo: "team@resumestart.ai",
    preset: "gmail",
  },
  quota: { perDay: 2000, label: "about 2000 a day" },
  accessCodeRequired: false,
  localAccountAvailable: false,
  maxRecipientsPerRun: 100,
};

const DISCONNECTED: SessionStatus = {
  connected: false,
  accessCodeRequired: false,
  localAccountAvailable: false,
  maxRecipientsPerRun: 100,
};

function allSent(messages: api.OutgoingMessage[]) {
  return Promise.resolve({
    halted: false,
    outcomes: messages.map((m) => ({ rowId: m.rowId, status: "sent" as const })),
  });
}

beforeEach(() => {
  resetMergeStore();
  vi.mocked(api.getSession).mockResolvedValue(DISCONNECTED);
  vi.mocked(api.sendChunk).mockImplementation(allSent);
  vi.mocked(api.sendTest).mockResolvedValue({ sentTo: CONNECTED.profile!.user } as never);
});

/** Put the store in a state where the send step has everything it needs. */
function readyStore(overrides: { testSent?: boolean } = {}) {
  const s = useMergeStore.getState();
  s.setSession(CONNECTED);
  s.loadSample();
  if (overrides.testSent) s.markTestSent();
  s.setStep("send");
}

describe("StatusBar", () => {
  it("walks the steps in order and stops at the last", () => {
    expect(nextStep("connect")).toBe("recipients");
    expect(nextStep("recipients")).toBe("compose");
    expect(nextStep("compose")).toBe("send");
    expect(nextStep("send")).toBeNull();
  });

  it("blocks Recipients until a mailbox is connected, and says why", () => {
    useMergeStore.getState().setSession(DISCONNECTED);
    render(<StatusBar />);
    expect(screen.getByRole("button", { name: "Recipients" })).toBeDisabled();
    expect(screen.getByText("Connect a mailbox to continue")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
  });

  it("shows the mailbox, alias and ready count once connected with recipients", async () => {
    const s = useMergeStore.getState();
    s.setSession(CONNECTED);
    s.loadSample();
    render(<StatusBar />);
    expect(screen.getByText("team@mybedigital.com")).toBeInTheDocument();
    expect(screen.getByText("team@resumestart.ai")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Recipients" }));
    expect(useMergeStore.getState().step).toBe("recipients");
  });

  it("holds the Compose step until a subject exists", () => {
    const s = useMergeStore.getState();
    s.setSession(CONNECTED);
    s.loadSample();
    s.setSubject("");
    s.setStep("compose");
    render(<StatusBar />);
    expect(screen.getByRole("button", { name: "Review and send" })).toBeDisabled();
  });

  it("has no primary action on the final step", () => {
    readyStore();
    render(<StatusBar />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("PreviewPane", () => {
  function rows() {
    const s = useMergeStore.getState();
    s.setSession(CONNECTED);
    s.loadSample();
    const { recipients, subject, body, fallbacks } = useMergeStore.getState();
    return mergeRows(recipients, subject, body, fallbacks);
  }

  it("renders From, Reply-To, To and the merged subject for the first row", () => {
    render(<PreviewPane rows={rows()} from="ResumeStart Team <team@resumestart.ai>" replyTo="team@resumestart.ai" />);
    expect(screen.getByText("ResumeStart Team <team@resumestart.ai>")).toBeInTheDocument();
    expect(screen.getAllByText("team@resumestart.ai").length).toBeGreaterThan(0);
    expect(screen.getByText("A quick hello, Ada")).toBeInTheDocument();
    expect(screen.getByText("1 / 4")).toBeInTheDocument();
  });

  it("steps forward, wraps at the ends, and jumps by recipient", async () => {
    const user = userEvent.setup();
    render(<PreviewPane rows={rows()} from="a" replyTo="b" />);
    await user.click(screen.getByRole("button", { name: "Next recipient" }));
    expect(screen.getByText("A quick hello, Grace")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous recipient" }));
    await user.click(screen.getByRole("button", { name: "Previous recipient" }));
    expect(screen.getByText("A quick hello, Ahanaf")).toBeInTheDocument();
    expect(screen.getByText("4 / 4")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Recipient" }));
    await user.click(screen.getByRole("option", { name: "grace@example.com" }));
    expect(screen.getByText("2 / 4")).toBeInTheDocument();
  });

  it("sandboxes the message frame so merged HTML cannot run scripts", () => {
    render(<PreviewPane rows={rows()} from="a" replyTo="b" />);
    const frame = screen.getByTitle(/Message preview for ada@example.com/);
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame.getAttribute("srcdoc")).toContain("Hi Ada,");
  });

  it("says so when there is nobody to preview", () => {
    render(<PreviewPane rows={[]} from="a" replyTo="b" />);
    expect(screen.getByText("No recipients to preview.")).toBeInTheDocument();
  });

  it("flags rows that have a gap", () => {
    const s = useMergeStore.getState();
    s.setSession(CONNECTED);
    s.loadSample();
    s.setBody("<p>Hi @firstname from @company</p>");
    const { recipients, subject, body, fallbacks } = useMergeStore.getState();
    const withGap = mergeRows(
      recipients.map((r) => ({ ...r, values: { ...r.values, company: "" } })),
      subject,
      body,
      fallbacks,
    );
    render(<PreviewPane rows={withGap} from="a" replyTo="b" />);
    expect(screen.getByText(/This message has no value for/)).toBeInTheDocument();
    expect(screen.getByText("@company")).toBeInTheDocument();
  });
});

describe("SendPanel", () => {
  it("treats a missing test email as a warning, not a block", () => {
    readyStore();
    render(<SendPanel />);
    expect(screen.getByText(/No test email yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send to 4 people/ })).toBeEnabled();
  });

  it("blocks the send when the mailbox is not connected", () => {
    const s = useMergeStore.getState();
    s.setSession(DISCONNECTED);
    s.loadSample();
    s.setStep("send");
    render(<SendPanel />);
    expect(screen.getByText("Connect your mailbox first.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send to 4 people/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Send a test to me/ })).toBeDisabled();
  });

  it("blocks the send when a token matches no column and suggests the fix", () => {
    readyStore();
    useMergeStore.getState().setBody("<p>Hi @firstnam</p>");
    render(<SendPanel />);
    expect(screen.getByText(/These tokens match no column/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send to 4 people/ })).toBeDisabled();
  });

  it("sends a test and then reports the test as done", async () => {
    readyStore();
    render(<SendPanel />);
    await userEvent.click(screen.getByRole("button", { name: /Send a test to me/ }));
    await waitFor(() => expect(screen.getByText(/Test email sent/)).toBeInTheDocument());
    expect(api.sendTest).toHaveBeenCalledWith("A quick hello, Ada", expect.stringContaining("Hi Ada,"));
  });

  it("shows the server's message when the test fails", async () => {
    readyStore();
    vi.mocked(api.sendTest).mockRejectedValueOnce(new api.ApiError("Google rejected the app password.", 401, "auth"));
    render(<SendPanel />);
    await userEvent.click(screen.getByRole("button", { name: /Send a test to me/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Google rejected the app password.");
  });

  it("sends every ready row, merged per recipient, and finishes", async () => {
    readyStore({ testSent: true });
    render(<SendPanel />);
    await userEvent.click(screen.getByRole("button", { name: /Send to 4 people/ }));
    await waitFor(() => expect(screen.getByText("Finished")).toBeInTheDocument());

    expect(api.sendChunk).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(api.sendChunk).mock.calls[0][0];
    expect(sent.map((m) => m.to)).toEqual([
      "ada@example.com",
      "grace@example.com",
      "linus@example.com",
      "ahanaf.tanvir40@gmail.com",
    ]);
    expect(sent[1].subject).toBe("A quick hello, Grace");
    expect(sent[2].html).toContain("Kernel Co");

    expect(screen.getByText("4 sent, 0 failed, 0 waiting")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Send progress" })).toHaveAttribute("aria-valuenow", "4");
    expect(screen.getByRole("button", { name: /Results CSV/ })).toBeInTheDocument();
  });

  it("never sends rows the user excluded", async () => {
    readyStore({ testSent: true });
    const grace = useMergeStore.getState().recipients.find((r) => r.email === "grace@example.com")!;
    useMergeStore.getState().toggleExcluded(grace.id);
    render(<SendPanel />);
    await userEvent.click(screen.getByRole("button", { name: /Send to 3 people/ }));
    await waitFor(() => expect(screen.getByText("Finished")).toBeInTheDocument());
    const sent = vi.mocked(api.sendChunk).mock.calls.flatMap((c) => c[0]).map((m) => m.to);
    expect(sent).not.toContain("grace@example.com");
    expect(sent).toHaveLength(3);
  });

  it("keeps going past a failed row, lists it, and retries only the failures", async () => {
    readyStore({ testSent: true });
    vi.mocked(api.sendChunk).mockImplementationOnce((messages) =>
      Promise.resolve({
        halted: false,
        outcomes: messages.map((m, i) =>
          i === 1
            ? { rowId: m.rowId, status: "failed" as const, code: "recipient" as never, error: "Mailbox does not exist" }
            : { rowId: m.rowId, status: "sent" as const },
        ),
      }),
    );
    render(<SendPanel />);
    await userEvent.click(screen.getByRole("button", { name: /Send to 4 people/ }));
    await waitFor(() => expect(screen.getByText("3 sent, 1 failed, 0 waiting")).toBeInTheDocument());

    const failedItem = screen.getAllByText("grace@example.com").find((el) => el.closest("li"))!.closest("li")!;
    expect(within(failedItem).getByText("Failed")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry 1 failed" }));
    await waitFor(() => expect(screen.getByText("4 sent, 0 failed, 0 waiting")).toBeInTheDocument());
    const retried = vi.mocked(api.sendChunk).mock.calls[1][0];
    expect(retried.map((m) => m.to)).toEqual(["grace@example.com"]);
  });

  it("halts on a fatal error, keeps the rest waiting, and resumes them", async () => {
    readyStore({ testSent: true });
    vi.mocked(api.sendChunk).mockRejectedValueOnce(new api.ApiError("Gmail is rate limiting this account.", 429, "rate"));
    render(<SendPanel />);
    await userEvent.click(screen.getByRole("button", { name: /Send to 4 people/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Gmail is rate limiting this account.");
    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(screen.getByText("0 sent, 0 failed, 4 waiting")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try the rest again" }));
    await waitFor(() => expect(screen.getByText("Finished")).toBeInTheDocument());
    expect(screen.getByText("4 sent, 0 failed, 0 waiting")).toBeInTheDocument();
  });

  it("pauses between batches and resumes only what is left", async () => {
    readyStore({ testSent: true });
    // Ten rows means two chunks, so there is a boundary to pause at.
    const csv = ["First Name,Email", ...Array.from({ length: 10 }, (_, i) => `P${i},p${i}@example.com`)].join("\n");
    const bytes = new TextEncoder().encode(csv);
    const { parseSpreadsheet } = await import("@/lib/spreadsheet");
    useMergeStore.getState().loadWorkbook(parseSpreadsheet("ten.csv", bytes.buffer as ArrayBuffer));
    useMergeStore.getState().setSubject("Hi @firstname");
    useMergeStore.getState().setBody("<p>Hi @firstname</p>");

    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.mocked(api.sendChunk).mockImplementationOnce(async (messages) => {
      await gate;
      return allSent(messages);
    });

    render(<SendPanel />);
    await userEvent.click(screen.getByRole("button", { name: /Send to 10 people/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Pause after this batch" }));
    await act(async () => release());

    await waitFor(() => expect(screen.getByText("Paused")).toBeInTheDocument());
    expect(screen.getByText("5 sent, 0 failed, 5 waiting")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(screen.getByText("Finished")).toBeInTheDocument());
    const all = vi.mocked(api.sendChunk).mock.calls.flatMap((c) => c[0]).map((m) => m.to);
    expect(all).toHaveLength(10);
    expect(new Set(all).size).toBe(10);
  });
});

describe("Workspace", () => {
  it("asks for the mailbox first and shows the four steps, then History (workspaces live in the navbar picker)", async () => {
    render(<Workspace />);
    expect(await screen.findByRole("heading", { name: "Connect your mailbox" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Steps" });
    // The mobile short label is aria-hidden, so read only what assistive tech reads.
    const readable = (b: HTMLElement) => {
      const copy = b.cloneNode(true) as HTMLElement;
      copy.querySelectorAll("[aria-hidden]").forEach((el) => el.remove());
      return copy.textContent?.replace(/^\d/, "");
    };
    expect(within(nav).getAllByRole("button").map(readable)).toEqual([
      "Connect",
      "Recipients",
      "Compose",
      "Review and send",
      "History",
    ]);
    expect(within(nav).getByRole("button", { name: /Connect/ })).toHaveAttribute("aria-current", "step");
  });

  it("restores an existing session from the cookie", async () => {
    vi.mocked(api.getSession).mockResolvedValue(CONNECTED);
    render(<Workspace />);
    expect(await screen.findByRole("heading", { name: "Mailbox connected" })).toBeInTheDocument();
    expect(screen.getAllByText("team@mybedigital.com").length).toBeGreaterThan(0);
  });

  it("connects with an app password, never echoing it back", async () => {
    vi.mocked(api.connect).mockResolvedValue(CONNECTED);
    const user = userEvent.setup();
    render(<Workspace />);
    await user.type(await screen.findByLabelText("Mailbox you sign in with"), "team@mybedigital.com");
    const password = screen.getByLabelText("App password");
    expect(password).toHaveAttribute("type", "password");
    await user.type(password, "abcd efgh ijkl mnop");
    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByRole("heading", { name: "Mailbox connected" })).toBeInTheDocument();
    expect(api.connect).toHaveBeenCalledWith(expect.objectContaining({ user: "team@mybedigital.com", password: "abcd efgh ijkl mnop" }));
    expect(document.body.textContent).not.toContain("abcd efgh ijkl mnop");
  });

  it("surfaces a rejected password without leaving the connect step", async () => {
    vi.mocked(api.connect).mockRejectedValue(new api.ApiError("Google rejected that app password.", 401, "auth"));
    const user = userEvent.setup();
    render(<Workspace />);
    await user.type(await screen.findByLabelText("Mailbox you sign in with"), "a@b.com");
    await user.type(screen.getByLabelText("App password"), "nope");
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByText("Google rejected that app password.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connect your mailbox" })).toBeInTheDocument();
  });

  it("goes from connected to recipients with the sample file", async () => {
    vi.mocked(api.getSession).mockResolvedValue(CONNECTED);
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(await screen.findByRole("button", { name: "Continue to recipients" }));
    await user.click(await screen.findByRole("button", { name: "Try the sample data" }));
    expect(await screen.findByText("ada@example.com")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("Ready")).toHaveLength(4);
    expect(useMergeStore.getState().emailColumn).toBe("Email");
  });

  it("opens a chosen file on its own tab, and Recipients goes back to choosing a file", async () => {
    vi.mocked(api.getSession).mockResolvedValue(CONNECTED);
    const user = userEvent.setup();
    render(<Workspace />);
    const nav = await screen.findByRole("navigation", { name: "Steps" });
    await user.click(await screen.findByRole("button", { name: "Continue to recipients" }));
    // Before a file is chosen there is no tab for it.
    expect(within(nav).queryByRole("button", { name: "Selected file" })).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Try the sample data" }));
    expect(useMergeStore.getState().step).toBe("selected");
    const tab = within(nav).getByRole("button", { name: "Selected file" });
    expect(tab).toHaveAttribute("aria-current", "page");
    // Recipients is still the numbered step this belongs to, and the table is on this tab.
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Add your recipients" })).not.toBeInTheDocument();

    // Recipients shows only choosing a file, with a way back to the one that is open.
    await user.click(within(nav).getByRole("button", { name: /Recipients/ }));
    expect(screen.getByRole("heading", { name: "Add your recipients" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View selected file" }));
    expect(screen.getByRole("table")).toBeInTheDocument();

    // Deselecting the file drops its tab and returns to choosing one.
    await user.click(screen.getByRole("button", { name: "Deselect file" }));
    expect(useMergeStore.getState().step).toBe("recipients");
    expect(within(nav).queryByRole("button", { name: "Selected file" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add your recipients" })).toBeInTheDocument();
  });

  it("does not pull you off another view when a saved list opens", () => {
    const s = useMergeStore.getState();
    s.setStep("history");
    s.loadSample();
    expect(useMergeStore.getState().step).toBe("history");
  });

  it("flags bad rows and lets the user exclude one", async () => {
    vi.mocked(api.getSession).mockResolvedValue(CONNECTED);
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(await screen.findByRole("button", { name: "Continue to recipients" }));
    await user.click(await screen.findByRole("button", { name: "Try the sample data" }));
    await user.click(await screen.findByRole("checkbox", { name: "Send to grace@example.com" }));
    expect(useMergeStore.getState().excluded.size).toBe(1);
    expect(screen.getByRole("checkbox", { name: "Send to grace@example.com" })).not.toBeChecked();
  });

  it("jumps straight to a step from the tab bar", async () => {
    vi.mocked(api.getSession).mockResolvedValue(CONNECTED);
    const user = userEvent.setup();
    render(<Workspace />);
    await screen.findByRole("heading", { name: "Mailbox connected" });
    await user.click(screen.getByRole("button", { name: /Review and send/ }));
    expect(await screen.findByRole("heading", { name: "Review and send" })).toBeInTheDocument();
  });

  it("tells the user to add a file before composing", async () => {
    vi.mocked(api.getSession).mockResolvedValue(CONNECTED);
    const user = userEvent.setup();
    render(<Workspace />);
    await screen.findByRole("heading", { name: "Mailbox connected" });
    await user.click(screen.getByRole("button", { name: /Compose/ }));
    expect(await screen.findByText(/Add a recipients file first/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Go to recipients" }));
    expect(useMergeStore.getState().step).toBe("recipients");
  });

  it("disconnecting returns to the connect form", async () => {
    vi.mocked(api.getSession).mockResolvedValue(CONNECTED);
    vi.mocked(api.disconnect).mockResolvedValue({ connected: false });
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(await screen.findByRole("button", { name: "Disconnect" }));
    expect(await screen.findByRole("heading", { name: "Connect your mailbox" })).toBeInTheDocument();
  });
});
