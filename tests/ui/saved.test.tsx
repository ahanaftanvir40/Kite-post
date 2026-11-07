// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/features/merge/api";
import type { SessionStatus } from "@/features/merge/api";
import { ComposePanel } from "@/features/merge/components/ComposePanel";
import { ConnectPanel } from "@/features/merge/components/ConnectPanel";
import { HistoryPanel } from "@/features/merge/components/HistoryPanel";
import { WorkspacesPanel } from "@/features/merge/components/WorkspacesPanel";
import { WorkspaceSwitcher } from "@/features/merge/components/WorkspaceSwitcher";
import { RecipientsPanel } from "@/features/merge/components/RecipientsPanel";
import { SendPanel } from "@/features/merge/components/SendPanel";
import { useSessionBootstrap, useWorkspaceBootstrap } from "@/features/merge/hooks";
import { formatWhen, workbookFromList } from "@/features/merge/saved";
import { resetMergeStore, useMergeStore } from "@/features/merge/store";

vi.mock("@/features/merge/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/merge/api")>();
  return {
    ...actual,
    sendChunk: vi.fn(),
    sendTest: vi.fn(),
    getSession: vi.fn(),
    listTemplates: vi.fn(),
    listLists: vi.fn(),
    listSenders: vi.fn(),
    listRuns: vi.fn(),
    listWorkspaces: vi.fn(),
    createWorkspace: vi.fn(),
    renameWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    saveTemplate: vi.fn(),
    saveList: vi.fn(),
    markListDone: vi.fn(),
    loadList: vi.fn(),
    loadRunMessages: vi.fn(),
    switchSender: vi.fn(),
    deleteSaved: vi.fn(),
    deleteRunsForFile: vi.fn(),
  };
});

const PROFILE = { user: "team@mybedigital.com", fromName: "ResumeStart Team", fromAddress: "team@resumestart.ai", replyTo: "team@resumestart.ai", preset: "gmail" as const };
const CONNECTED: SessionStatus = {
  connected: true,
  account: "team@mybedigital.com",
  profile: PROFILE,
  quota: { perDay: 2000, label: "about 2000 a day" },
  accessCodeRequired: false,
  localAccountAvailable: false,
  maxRecipientsPerRun: 100,
  savingAvailable: true,
};
const NO_DB: SessionStatus = { ...CONNECTED, savingAvailable: false };

const NOW = "2026-11-01T10:00:00.000Z";
const template = { id: "t1", name: "Welcome", subject: "Hello @firstname", body: "<p>Hi @firstname</p>", fallbacks: { firstname: "there" }, updatedAt: NOW };
const listSummary = { id: "l1", name: "Leads", fileName: "leads.csv", headers: ["Email", "Name"], emailColumn: "Email", rowCount: 2, updatedAt: NOW };
const WS = "w1";
const workspace = (id: string, name: string, counts = { lists: 0, templates: 0, runs: 0 }) => ({ id, name, createdAt: NOW, counts });
const sender = { id: "s1", fromName: "Press", fromAddress: "press@resumestart.ai", replyTo: "press@resumestart.ai", lastUsedAt: NOW };

beforeEach(() => {
  window.localStorage.clear();
  resetMergeStore();
  vi.mocked(api.listTemplates).mockResolvedValue([]);
  vi.mocked(api.listLists).mockResolvedValue([]);
  vi.mocked(api.listSenders).mockResolvedValue([]);
  vi.mocked(api.listRuns).mockResolvedValue([]);
  vi.mocked(api.listWorkspaces).mockResolvedValue([workspace(WS, "Main")]);
  vi.mocked(api.sendTest).mockResolvedValue({ sentTo: PROFILE.user } as never);
  vi.mocked(api.sendChunk).mockImplementation((messages) =>
    Promise.resolve({ halted: false, outcomes: messages.map((m) => ({ rowId: m.rowId, status: "sent" as const })) }),
  );
});

/** Connect, and sit inside a workspace the way a person who already chose one would. */
function connect(status: SessionStatus = CONNECTED) {
  const s = useMergeStore.getState();
  s.setSession(status);
  if (status.savingAvailable) s.setWorkspaces([workspace(WS, "Main")], WS);
}

describe("helpers", () => {
  it("turns a saved list into a workbook with spreadsheet row numbers", () => {
    const wb = workbookFromList({ ...listSummary, rows: [{ Email: "a@x.com", Name: "Ada" }, { Email: "b@x.com", Name: "" }] });
    expect(wb.fileName).toBe("leads.csv");
    expect(wb.sheets[0]).toMatchObject({ headers: ["Email", "Name"], rowNumbers: [2, 3], truncated: false });
  });

  it("describes time in plain words", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    expect(formatWhen("2026-11-01T09:59:40Z", now)).toBe("just now");
    expect(formatWhen("2026-11-01T09:30:00Z", now)).toBe("30 min ago");
    expect(formatWhen("2026-11-01T05:00:00Z", now)).toBe("5 h ago");
    expect(formatWhen("not a date", now)).toBe("");
  });

  it("makes run ids the server will accept", () => {
    expect(api.newRunId()).toMatch(/^run-[A-Za-z0-9_-]{8,}$/);
  });
});

describe("saved templates", () => {
  beforeEach(() => {
    connect();
    useMergeStore.getState().loadSample();
  });

  it("lists saved templates and applies one to the editor state", async () => {
    vi.mocked(api.listTemplates).mockResolvedValue([template]);
    const user = userEvent.setup();
    render(<ComposePanel />);
    const list = await screen.findByRole("list", { name: "Saved templates" });
    await user.click(within(list).getByRole("button", { name: "Use" }));
    const s = useMergeStore.getState();
    expect(s.subject).toBe("Hello @firstname");
    expect(s.body).toBe("<p>Hi @firstname</p>");
    expect(s.fallbacks).toEqual({ firstname: "there" });
  });

  it("saves the current message under a name and refreshes the list", async () => {
    vi.mocked(api.saveTemplate).mockResolvedValue(template);
    const user = userEvent.setup();
    render(<ComposePanel />);
    await user.type(await screen.findByLabelText("Save this message as"), "Welcome");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.saveTemplate).toHaveBeenCalledWith(WS, expect.objectContaining({ name: "Welcome", subject: expect.stringContaining("@firstname") })),
    );
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    await waitFor(() => expect(api.listTemplates).toHaveBeenCalledTimes(2));
  });

  it("shows the server's reason when saving fails", async () => {
    vi.mocked(api.saveTemplate).mockRejectedValue(new api.ApiError("You have reached the limit of 100 saved templates.", 409, "limit"));
    const user = userEvent.setup();
    render(<ComposePanel />);
    await user.type(await screen.findByLabelText("Save this message as"), "Another");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("limit of 100");
  });

  it("asks before deleting, and keeps the item when you back out", async () => {
    vi.mocked(api.listTemplates).mockResolvedValue([template]);
    vi.mocked(api.deleteSaved).mockResolvedValue();
    const user = userEvent.setup();
    render(<ComposePanel />);
    await user.click(await screen.findByRole("button", { name: "Delete template Welcome" }));
    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(api.deleteSaved).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete template Welcome" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(api.deleteSaved).toHaveBeenCalledWith("templates", "t1", WS);
  });

  it("explains a load failure instead of showing an empty list", async () => {
    vi.mocked(api.listTemplates).mockRejectedValue(new api.ApiError("Could not reach the database. Try again shortly.", 503, "storage"));
    render(<ComposePanel />);
    expect(await screen.findByText("Could not reach the database. Try again shortly.")).toBeInTheDocument();
    expect(screen.queryByText("No templates in this workspace yet.")).not.toBeInTheDocument();
  });

  it("is absent when the server has no database", () => {
    connect(NO_DB);
    render(<ComposePanel />);
    expect(screen.queryByText("Saved templates")).not.toBeInTheDocument();
    expect(api.listTemplates).not.toHaveBeenCalled();
  });
});

describe("links in the message", () => {
  beforeEach(() => {
    connect();
    useMergeStore.getState().loadSample();
    useMergeStore.getState().setBody("<p>Hello</p>");
  });

  it("adds a link with its own text, shows it in the editor, and stores it as an anchor", async () => {
    const user = userEvent.setup();
    render(<ComposePanel />);
    await user.click(await screen.findByRole("button", { name: "Link (Ctrl+K)" }));
    const card = screen.getByRole("dialog", { name: "Add link" });
    await user.type(within(card).getByLabelText("Text to show"), "Pick up where you left off");
    await user.type(within(card).getByLabelText("Link to"), "resumestart.ai/offer");
    await user.click(within(card).getByRole("button", { name: "Add" }));
    const link = await screen.findByRole("link", { name: "Pick up where you left off" });
    expect(link).toHaveAttribute("href", "https://resumestart.ai/offer");
    expect(useMergeStore.getState().body).toContain('href="https://resumestart.ai/offer"');
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("will not accept a script link", async () => {
    const user = userEvent.setup();
    render(<ComposePanel />);
    await user.click(await screen.findByRole("button", { name: "Link (Ctrl+K)" }));
    await user.type(screen.getByLabelText("Link to"), "javascript:alert(1)");
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("clicking a link shows where it goes, with open, edit and remove", async () => {
    useMergeStore.getState().setBody('<p>Hi <a href="https://old.example/">there</a></p>');
    const user = userEvent.setup();
    render(<ComposePanel />);
    await user.click(await screen.findByRole("link", { name: "there" }));
    const card = await screen.findByRole("dialog", { name: "Link" });
    const open = within(card).getByRole("link", { name: "Open link in a new tab" });
    expect(open).toHaveAttribute("href", "https://old.example/");
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(within(card).getByRole("button", { name: "Edit link" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Remove link" })).toBeInTheDocument();
  });

  it("edits the address and the text of an existing link", async () => {
    useMergeStore.getState().setBody('<p>Hi <a href="https://old.example/">there</a></p>');
    const user = userEvent.setup();
    render(<ComposePanel />);
    await user.click(await screen.findByRole("link", { name: "there" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Link" })).getByRole("button", { name: "Edit link" }));
    const card = screen.getByRole("dialog", { name: "Edit link" });
    expect(within(card).getByLabelText("Link to")).toHaveValue("https://old.example/");
    expect(within(card).getByLabelText("Text to show")).toHaveValue("there");
    await user.clear(within(card).getByLabelText("Link to"));
    await user.type(within(card).getByLabelText("Link to"), "new.example");
    await user.clear(within(card).getByLabelText("Text to show"));
    await user.type(within(card).getByLabelText("Text to show"), "friend");
    await user.click(within(card).getByRole("button", { name: "Update" }));
    await waitFor(() => expect(useMergeStore.getState().body).toContain('href="https://new.example"'));
    expect(useMergeStore.getState().body).toContain(">friend</a>");
    expect(useMergeStore.getState().body).not.toContain("old.example");
  });

  it("removes a link but keeps its text", async () => {
    useMergeStore.getState().setBody('<p>Hi <a href="https://old.example/">there</a></p>');
    const user = userEvent.setup();
    render(<ComposePanel />);
    await user.click(await screen.findByRole("link", { name: "there" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Link" })).getByRole("button", { name: "Remove link" }));
    await waitFor(() => expect(useMergeStore.getState().body).not.toContain("<a"));
    expect(useMergeStore.getState().body).toContain("there");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the card with Escape", async () => {
    useMergeStore.getState().setBody('<p>Hi <a href="https://old.example/">there</a></p>');
    const user = userEvent.setup();
    render(<ComposePanel />);
    await user.click(await screen.findByRole("link", { name: "there" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Link" })).getByRole("button", { name: "Edit link" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("@ suggestions in the subject", () => {
  beforeEach(() => {
    connect();
    useMergeStore.getState().loadSample();
    useMergeStore.getState().setSubject("");
  });

  it("suggests columns as you type @, filtered by what follows", async () => {
    const user = userEvent.setup();
    render(<ComposePanel />);
    const subject = await screen.findByRole("combobox");
    await user.click(subject);
    await user.type(subject, "Hello @");
    expect(within(screen.getByRole("listbox", { name: "Columns" })).getAllByRole("option").length).toBeGreaterThan(1);
    await user.type(subject, "fir");
    const options = within(screen.getByRole("listbox", { name: "Columns" })).getAllByRole("option");
    expect(options[0]).toHaveTextContent("@firstname");
  });

  it("inserts the highlighted column with Enter and closes the menu", async () => {
    const user = userEvent.setup();
    render(<ComposePanel />);
    const subject = await screen.findByRole("combobox");
    await user.type(subject, "Hi @fir{Enter}");
    expect(subject).toHaveValue("Hi @firstname ");
    expect(screen.queryByRole("listbox", { name: "Columns" })).not.toBeInTheDocument();
    expect(useMergeStore.getState().subject).toBe("Hi @firstname ");
  });

  it("inserts a column picked with the mouse in the middle of the text", async () => {
    const user = userEvent.setup();
    render(<ComposePanel />);
    const subject = await screen.findByRole("combobox");
    await user.type(subject, "Hi @fir");
    await user.click(within(screen.getByRole("listbox", { name: "Columns" })).getByRole("option", { name: /@firstname/ }));
    expect(subject).toHaveValue("Hi @firstname ");
  });

  it("highlights a column token blue and an unknown one red, without changing the text", async () => {
    const user = userEvent.setup();
    const { container } = render(<ComposePanel />);
    const subject = await screen.findByRole("combobox");
    await user.type(subject, "Hi @firstname and @nope ");
    await user.keyboard("{Escape}");
    expect(container.querySelector('[data-token-state="ok"]')).toHaveTextContent("@firstname");
    expect(container.querySelector('[data-token-state="bad"]')).toHaveTextContent("@nope");
    expect(subject).toHaveValue("Hi @firstname and @nope ");
  });

  it("closes with Escape and stays closed when the text has no @", async () => {
    const user = userEvent.setup();
    render(<ComposePanel />);
    const subject = await screen.findByRole("combobox");
    await user.type(subject, "Hi @");
    expect(screen.getByRole("listbox", { name: "Columns" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox", { name: "Columns" })).not.toBeInTheDocument();
    await user.type(subject, "x");
    await user.clear(subject);
    await user.type(subject, "Plain subject");
    expect(screen.queryByRole("listbox", { name: "Columns" })).not.toBeInTheDocument();
  });
});

describe("saved lists", () => {
  beforeEach(() => connect());

  it("opens a saved list and keeps the email column that was saved", async () => {
    vi.mocked(api.listLists).mockResolvedValue([listSummary]);
    vi.mocked(api.loadList).mockResolvedValue({
      ...listSummary,
      headers: ["Contact", "Email"],
      emailColumn: "Email",
      rows: [{ Contact: "x@y.com", Email: "a@x.com" }, { Contact: "q@y.com", Email: "b@x.com" }],
    });
    const user = userEvent.setup();
    render(<RecipientsPanel />);
    await user.click(await screen.findByRole("button", { name: "Open" }));
    await waitFor(() => expect(useMergeStore.getState().workbook).not.toBeNull());
    const s = useMergeStore.getState();
    expect(s.emailColumn).toBe("Email");
    expect(s.recipients.map((r) => r.email)).toEqual(["a@x.com", "b@x.com"]);
  });

  it("saves the loaded sheet with its headers, email column and rows", async () => {
    vi.mocked(api.saveList).mockResolvedValue(listSummary);
    useMergeStore.getState().loadSample();
    const user = userEvent.setup();
    render(<RecipientsPanel />);
    await user.click(screen.getByRole("button", { name: "Save list" }));
    await waitFor(() => expect(api.saveList).toHaveBeenCalledTimes(1));
    const input = vi.mocked(api.saveList).mock.calls[0][1];
    expect(vi.mocked(api.saveList).mock.calls[0][0]).toBe(WS);
    expect(input).toMatchObject({ name: "kitepost-sample", fileName: "kitepost-sample.csv", emailColumn: "Email" });
    expect(input.headers).toEqual(["First Name", "Last Name", "Email", "Company"]);
    expect(input.rows).toHaveLength(4);
  });

  it("removes a row, and saving again sends the trimmed rows under the same name", async () => {
    vi.mocked(api.saveList).mockResolvedValue(listSummary);
    useMergeStore.getState().loadSample();
    const user = userEvent.setup();
    render(<RecipientsPanel />);
    const first = useMergeStore.getState().recipients[0].email;
    await user.click(screen.getByRole("button", { name: `Remove ${first}` }));
    expect(useMergeStore.getState().recipients).toHaveLength(3);
    expect(screen.queryByRole("button", { name: `Remove ${first}` })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save list" }));
    await waitFor(() => expect(api.saveList).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.saveList).mock.calls[0][1].rows).toHaveLength(3);

    // Saved and unchanged: there is nothing to update yet.
    expect(await screen.findByRole("button", { name: "Update list" })).toBeDisabled();

    // Any change turns it back on, and it asks how to save first.
    await user.click(screen.getByRole("button", { name: `Remove ${useMergeStore.getState().recipients[0].email}` }));
    await user.click(screen.getByRole("button", { name: "Update list" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Update list" }));
    await waitFor(() => expect(api.saveList).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.saveList).mock.calls[1][1].name).toBe("kitepost-sample");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("List updated.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update list" })).toBeDisabled();
  });

  it("keeps Update list off for an opened list until something changes", async () => {
    vi.mocked(api.listLists).mockResolvedValue([listSummary]);
    vi.mocked(api.loadList).mockResolvedValue({
      ...listSummary,
      headers: ["Email"],
      emailColumn: "Email",
      rows: [{ Email: "a@x.com" }, { Email: "b@x.com" }],
    });
    const user = userEvent.setup();
    render(<RecipientsPanel />);
    await user.click(await screen.findByRole("button", { name: "Open" }));
    expect(await screen.findByRole("button", { name: "Update list" })).toBeDisabled();

    // Typing another name is a different save, so it is allowed.
    const name = screen.getByLabelText(/Saved as/);
    await user.type(name, " copy");
    expect(screen.getByRole("button", { name: "Update list" })).toBeEnabled();
    await user.clear(name);
    await user.type(name, listSummary.name);
    expect(screen.getByRole("button", { name: "Update list" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Remove a@x.com" }));
    expect(screen.getByRole("button", { name: "Update list" })).toBeEnabled();
  });

  it("offers to save as a new list instead, leaving the old one alone", async () => {
    vi.mocked(api.saveList).mockResolvedValue(listSummary);
    vi.mocked(api.listLists).mockResolvedValue([{ ...listSummary, name: "kitepost-sample" }, { ...listSummary, id: "l2", name: "kitepost-sample (2)" }]);
    useMergeStore.getState().loadSample();
    const user = userEvent.setup();
    render(<RecipientsPanel />);
    await screen.findByRole("button", { name: "Save list" });
    await waitFor(() => expect(api.listLists).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Save list" }));

    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("radio", { name: /Save as a new list/ }));
    // The suggested name skips the one that is already taken.
    const field = dialog.getByLabelText("Name of the new list");
    expect(field).toHaveValue("kitepost-sample (3)");
    await user.clear(field);
    await user.type(field, "KITEPOST-SAMPLE (2)");
    expect(dialog.getByRole("alert")).toHaveTextContent("already exists");
    expect(dialog.getByRole("button", { name: "Save new list" })).toBeDisabled();
    await user.clear(field);
    await user.type(field, "Fresh copy");
    await user.click(dialog.getByRole("button", { name: "Save new list" }));

    await waitFor(() => expect(api.saveList).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.saveList).mock.calls[0][1].name).toBe("Fresh copy");
    expect(await screen.findByText(/Saved as a new list/)).toBeInTheDocument();
    expect(useMergeStore.getState().savedListName).toBe("Fresh copy");
  });

  it("closes the dialog on Cancel and Escape without saving", async () => {
    vi.mocked(api.listLists).mockResolvedValue([{ ...listSummary, name: "kitepost-sample" }]);
    useMergeStore.getState().loadSample();
    const user = userEvent.setup();
    render(<RecipientsPanel />);
    await waitFor(() => expect(api.listLists).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Save list" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save list" }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.saveList).not.toHaveBeenCalled();
  });

  it("adds a row by hand and saves it with the list", async () => {
    vi.mocked(api.saveList).mockResolvedValue(listSummary);
    useMergeStore.getState().loadSample();
    const user = userEvent.setup();
    render(<RecipientsPanel />);
    await user.click(screen.getByRole("button", { name: "Add row" }));
    expect(screen.getByRole("button", { name: "Add to list" })).toBeDisabled();
    const form = within(screen.getByRole("form", { name: "Add a row" }));
    await user.type(form.getByLabelText("First Name"), "Zed");
    await user.type(form.getByLabelText(/Email/), "zed@x.com");
    await user.click(form.getByRole("button", { name: "Add to list" }));

    const state = useMergeStore.getState();
    expect(state.recipients).toHaveLength(5);
    expect(state.recipients[4]).toMatchObject({ email: "zed@x.com", rowNumber: 6 });
    expect(state.excluded.has("r4")).toBe(false);
    expect(await screen.findByText("Row added.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Save list" }));
    await waitFor(() => expect(api.saveList).toHaveBeenCalledTimes(1));
    const rows = vi.mocked(api.saveList).mock.calls[0][1].rows;
    expect(rows).toHaveLength(5);
    expect(rows[4]).toEqual({ "First Name": "Zed", "Last Name": "", Email: "zed@x.com", Company: "" });
  });

  it("adds a flagged row unchecked when the email repeats", async () => {
    useMergeStore.getState().loadSample();
    const existing = useMergeStore.getState().recipients[0].email;
    const user = userEvent.setup();
    render(<RecipientsPanel />);
    await user.click(screen.getByRole("button", { name: "Add row" }));
    await user.type(within(screen.getByRole("form", { name: "Add a row" })).getByLabelText(/Email/), existing);
    await user.click(screen.getByRole("button", { name: "Add to list" }));
    const state = useMergeStore.getState();
    expect(state.recipients).toHaveLength(5);
    expect(state.excluded.has("r4")).toBe(true);
    expect(await screen.findByText(/it is flagged and unchecked/)).toBeInTheDocument();
  });

  it("removes every unchecked row at once", async () => {
    useMergeStore.getState().loadSample();
    const user = userEvent.setup();
    render(<RecipientsPanel />);
    const [keep, ...rest] = useMergeStore.getState().recipients;
    useMergeStore.getState().setAllIncluded(false);
    useMergeStore.getState().toggleExcluded(keep.id);
    await user.click(screen.getByRole("button", { name: "Remove unchecked rows" }));
    expect(useMergeStore.getState().recipients.map((r) => r.email)).toEqual([keep.email]);
    expect(rest.length).toBeGreaterThan(0);
  });

  it("says why a saved list could not be opened", async () => {
    vi.mocked(api.listLists).mockResolvedValue([listSummary]);
    vi.mocked(api.loadList).mockRejectedValue(new api.ApiError("That item no longer exists.", 404));
    const user = userEvent.setup();
    render(<RecipientsPanel />);
    await user.click(await screen.findByRole("button", { name: "Open" }));
    expect(await screen.findByText("That item no longer exists.")).toBeInTheDocument();
    expect(useMergeStore.getState().workbook).toBeNull();
  });

  describe("tabs", () => {
    const tab = (name: string, headers: string[], rows: string[][]) => ({
      name,
      headers,
      rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]]))),
      rowNumbers: rows.map((_, i) => i + 2),
      truncated: false,
    });
    const multi = () =>
      useMergeStore.getState().loadWorkbook({
        fileName: "Win-back.xlsx",
        sheets: [
          tab("Notes", ["Topic", "Detail"], [["x", "y"]]),
          tab("Has resume", ["Email", "Name"], [["a@x.com", "A"], ["b@x.com", "B"]]),
          tab("Lapsed", ["Email", "Name"], [["c@x.com", "C"]]),
        ],
      });

    it("asks which tabs to use instead of opening the first one", async () => {
      multi();
      render(<RecipientsPanel />);
      expect(screen.getByRole("heading", { name: "Choose the tabs to use" })).toBeInTheDocument();
      expect(useMergeStore.getState().workbook).toBeNull();
      // The first tab that holds emails is ticked, not the first tab.
      expect(screen.getByRole("checkbox", { name: /Has resume/ })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: /Notes/ })).not.toBeChecked();
      expect(screen.getByText("No email column found")).toBeInTheDocument();
    });

    it("uses one tab", async () => {
      multi();
      const user = userEvent.setup();
      render(<RecipientsPanel />);
      await user.click(screen.getByRole("button", { name: "Use “Has resume”" }));
      const s = useMergeStore.getState();
      expect(s.recipients.map((r) => r.email)).toEqual(["a@x.com", "b@x.com"]);
      expect(await screen.findByRole("button", { name: "Change tabs" })).toBeInTheDocument();
    });

    it("stacks several tabs with a Source tab column, and Change tabs goes back", async () => {
      multi();
      const user = userEvent.setup();
      render(<RecipientsPanel />);
      await user.click(screen.getByRole("checkbox", { name: /Lapsed/ }));
      await user.click(screen.getByRole("button", { name: /Use 2 tabs \(3 rows\)/ }));
      const s = useMergeStore.getState();
      expect(s.recipients.map((r) => r.email)).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
      expect(s.workbook?.sheets[0].headers).toEqual(["Email", "Name", "Source tab"]);
      expect(s.workbook?.sheets[0].rows.map((r) => r["Source tab"])).toEqual(["Has resume", "Has resume", "Lapsed"]);

      await user.click(await screen.findByRole("button", { name: "Change tabs" }));
      expect(screen.getByRole("checkbox", { name: /Has resume/ })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: /Lapsed/ })).toBeChecked();
      await user.click(screen.getByRole("checkbox", { name: /Has resume/ }));
      await user.click(screen.getByRole("button", { name: "Use “Lapsed”" }));
      expect(useMergeStore.getState().recipients.map((r) => r.email)).toEqual(["c@x.com"]);
    });

    it("cannot continue with no tab ticked", async () => {
      multi();
      const user = userEvent.setup();
      render(<RecipientsPanel />);
      await user.click(screen.getByRole("checkbox", { name: /Has resume/ }));
      expect(screen.getByRole("button", { name: "Pick at least one tab" })).toBeDisabled();
    });

    it("goes back to the upload screen from the picker", async () => {
      multi();
      const user = userEvent.setup();
      render(<RecipientsPanel />);
      await user.click(screen.getByRole("button", { name: "Choose another file" }));
      expect(useMergeStore.getState().tabSource).toBeNull();
      expect(screen.getByRole("heading", { name: "Add your recipients" })).toBeInTheDocument();
    });
  });

  describe("batches", () => {
    const load = (count: number) =>
      useMergeStore.getState().loadWorkbook({
        fileName: "Leads.xlsx",
        sheets: [
          {
            name: "Sheet1",
            headers: ["Email", "Name"],
            rows: Array.from({ length: count }, (_, i) => ({ Email: `p${i}@x.com`, Name: `P${i}` })),
            rowNumbers: Array.from({ length: count }, (_, i) => i + 2),
            truncated: false,
          },
        ],
      });

    it("is off until there are enough rows to make two batches", () => {
      load(5);
      render(<RecipientsPanel />);
      expect(screen.getByRole("button", { name: "Create batches" })).toBeDisabled();
    });

    it("saves each batch as its own list in the workspace", async () => {
      vi.mocked(api.saveList).mockResolvedValue(listSummary);
      load(45);
      const user = userEvent.setup();
      render(<RecipientsPanel />);
      await user.click(screen.getByRole("button", { name: "Create batches" }));
      const dialog = within(await screen.findByRole("dialog"));

      const size = dialog.getByLabelText("Rows per batch");
      await user.clear(size);
      await user.type(size, "4");
      expect(dialog.getByText(/smallest batch is 5/)).toBeInTheDocument();
      expect(dialog.getByRole("button", { name: /Create/ })).toBeDisabled();

      await user.clear(size);
      await user.type(size, "20");
      expect(dialog.getByText(/45 rows become 3 batches: 2 of 20 and one of 5/)).toBeInTheDocument();

      // Workspace only: skip the download.
      await user.click(dialog.getByRole("checkbox", { name: /Download as Excel files/ }));
      await user.click(dialog.getByRole("button", { name: "Create 3 batches" }));

      await waitFor(() => expect(api.saveList).toHaveBeenCalledTimes(3));
      const calls = vi.mocked(api.saveList).mock.calls.map((c) => c[1]);
      expect(calls.map((c) => c.name)).toEqual(["Leads - batch 1 of 3", "Leads - batch 2 of 3", "Leads - batch 3 of 3"]);
      expect(calls.map((c) => c.rows.length)).toEqual([20, 20, 5]);
      expect(calls[0]).toMatchObject({ fileName: "Leads - batch 1 of 3.xlsx", emailColumn: "Email", headers: ["Email", "Name"] });
      expect(vi.mocked(api.saveList).mock.calls[0][0]).toBe(WS);
      expect(await screen.findByText(/3 lists saved in Main/)).toBeInTheDocument();
    });

    it("downloads one zip of Excel files", async () => {
      const create = vi.fn(() => "blob:x");
      const revoke = vi.fn();
      Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
      load(12);
      const user = userEvent.setup();
      render(<RecipientsPanel />);
      await user.click(screen.getByRole("button", { name: "Create batches" }));
      const dialog = within(await screen.findByRole("dialog"));
      await user.click(dialog.getByRole("checkbox", { name: /Save in Main/ }));
      await user.click(dialog.getByRole("button", { name: /Create \d+ batches/ }));
      expect(await screen.findByText(/Excel files downloaded in Leads - batches\.zip/)).toBeInTheDocument();
      expect(create).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
      expect(api.saveList).not.toHaveBeenCalled();
      click.mockRestore();
    });

    it("will not overwrite a list that already has a batch name", async () => {
      vi.mocked(api.listLists).mockResolvedValue([{ ...listSummary, name: "Leads - batch 1 of 2" }]);
      load(10);
      const user = userEvent.setup();
      render(<RecipientsPanel />);
      await waitFor(() => expect(api.listLists).toHaveBeenCalled());
      await user.click(screen.getByRole("button", { name: "Create batches" }));
      const dialog = within(await screen.findByRole("dialog"));
      const size = dialog.getByLabelText("Rows per batch");
      await user.clear(size);
      await user.type(size, "5");
      expect(await dialog.findByRole("alert")).toHaveTextContent("already exists");
      expect(dialog.getByRole("button", { name: /Create/ })).toBeDisabled();
      expect(api.saveList).not.toHaveBeenCalled();
    });
  });

  it("offers nothing to save when saving is off", () => {
    connect(NO_DB);
    useMergeStore.getState().loadSample();
    render(<RecipientsPanel />);
    expect(screen.queryByRole("button", { name: "Save list" })).not.toBeInTheDocument();
  });
});

describe("saved senders", () => {
  beforeEach(() => {
    connect();
    vi.mocked(api.listSenders).mockResolvedValue([
      { id: "s0", fromName: "ResumeStart Team", fromAddress: "team@resumestart.ai", replyTo: "team@resumestart.ai", lastUsedAt: NOW },
      sender,
    ]);
  });

  it("marks the sender in use and switches to another without a password", async () => {
    vi.mocked(api.switchSender).mockResolvedValue({ ...PROFILE, fromName: "Press", fromAddress: "press@resumestart.ai", replyTo: "press@resumestart.ai" });
    useMergeStore.getState().markTestSent();
    const user = userEvent.setup();
    render(<ConnectPanel />);
    const list = await screen.findByRole("list", { name: "Saved senders" });
    expect(within(list).getByText("Current")).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "In use" })).toBeDisabled();

    await user.click(within(list).getByRole("button", { name: "Use" }));
    await waitFor(() => expect(useMergeStore.getState().session?.profile?.fromAddress).toBe("press@resumestart.ai"));
    // A different alias must be proven again with a real test email.
    expect(useMergeStore.getState().testSent).toBe(false);
  });

  it("never renders a password field for saved senders", async () => {
    render(<ConnectPanel />);
    await screen.findByRole("list", { name: "Saved senders" });
    expect(screen.queryByLabelText("App password")).not.toBeInTheDocument();
  });
});

describe("send history", () => {
  const run = { runId: "run-abcdefgh", subject: "Hello @firstname", fromAddress: "team@resumestart.ai", startedAt: NOW, finishedAt: NOW, sent: 2, failed: 1 };

  it("lists runs and expands one to show each recipient", async () => {
    vi.mocked(api.listRuns).mockResolvedValue([run]);
    vi.mocked(api.loadRunMessages).mockResolvedValue([
      { rowId: "r0", to: "a@x.com", subject: "Hello Ada", status: "sent", at: NOW },
      { rowId: "r1", to: "b@x.com", subject: "Hello Bo", status: "failed", error: "Mailbox full", at: NOW },
    ]);
    connect();
    const user = userEvent.setup();
    render(<HistoryPanel />);
    const toggle = await screen.findByRole("button", { name: /Hello @firstname/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(toggle).getByText("2 sent")).toBeInTheDocument();
    expect(within(toggle).getByText("1 failed")).toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("a@x.com")).toBeInTheDocument();
    expect(screen.getByText("Mailbox full")).toBeInTheDocument();
    expect(api.loadRunMessages).toHaveBeenCalledWith(WS, "run-abcdefgh");
  });

  it("shows which spreadsheet each run was sent from, and stays quiet for older runs without one", async () => {
    vi.mocked(api.listRuns).mockResolvedValue([
      { ...run, runId: "run-withfile1", subject: "Spring promo", fileName: "spring-leads.xlsx" },
      { ...run, runId: "run-nofile001", subject: "Old send" },
    ]);
    connect();
    render(<HistoryPanel />);
    const withFile = await screen.findByRole("button", { name: /Spring promo/ });
    expect(within(withFile).getByText("spring-leads.xlsx")).toBeInTheDocument();
    const without = screen.getByRole("button", { name: /Old send/ });
    expect(within(without).queryByText(/\.xlsx|\.csv/)).not.toBeInTheDocument();
  });

  it("explains an empty history", async () => {
    connect();
    render(<HistoryPanel />);
    expect(await screen.findByText(/Nothing sent yet/)).toBeInTheDocument();
  });

  it("asks you to sign in first", () => {
    useMergeStore.getState().setSession({ connected: false, accessCodeRequired: false, localAccountAvailable: false, maxRecipientsPerRun: 100 });
    render(<HistoryPanel />);
    expect(screen.getByText(/Sign in to see what you have sent/)).toBeInTheDocument();
    expect(api.listRuns).not.toHaveBeenCalled();
  });

  it("says plainly when the server records nothing", () => {
    connect(NO_DB);
    render(<HistoryPanel />);
    expect(screen.getByText(/no database set up/)).toBeInTheDocument();
    expect(api.listRuns).not.toHaveBeenCalled();
  });
});

describe("sent files on the Recipients screen", () => {
  const sentRun = (runId: string, fileName: string | undefined, sent: number, failed = 0, finishedAt = NOW) => ({
    runId,
    subject: "Hello",
    fromAddress: "team@resumestart.ai",
    startedAt: finishedAt,
    finishedAt,
    sent,
    failed,
    ...(fileName ? { fileName } : {}),
  });

  it("lists each sent spreadsheet once, in its own section apart from saved lists", async () => {
    vi.mocked(api.listLists).mockResolvedValue([listSummary]);
    vi.mocked(api.listRuns).mockResolvedValue([
      sentRun("run-aaaaaaa1", "spring.xlsx", 10, 1, "2026-11-01T09:00:00.000Z"),
      sentRun("run-aaaaaaa2", "Spring.xlsx", 5, 0, "2026-11-01T10:00:00.000Z"),
      sentRun("run-aaaaaaa3", "clients.csv", 3, 0, "2026-10-30T10:00:00.000Z"),
      sentRun("run-aaaaaaa4", undefined, 99),
    ]);
    connect();
    render(<RecipientsPanel />);

    const section = await screen.findByRole("list", { name: "Sent files" });
    const rows = within(section).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    // Same file under two spellings is one entry, newest first, totals added up.
    expect(within(rows[0]).getByText("Spring.xlsx")).toBeInTheDocument();
    expect(within(rows[0]).getByText("15 sent")).toBeInTheDocument();
    expect(within(rows[0]).getByText("1 failed")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/2 sends/)).toBeInTheDocument();
    expect(within(rows[1]).getByText("clients.csv")).toBeInTheDocument();
    expect(within(rows[1]).getByText(/1 send ·/)).toBeInTheDocument();
    // Saved lists are a separate list, and not mixed in.
    expect(within(screen.getByRole("list", { name: "Saved lists" })).queryByText("spring.xlsx")).not.toBeInTheDocument();
    expect(within(section).queryByText("Leads")).not.toBeInTheDocument();
  });

  it("takes you to History from a sent file", async () => {
    vi.mocked(api.listRuns).mockResolvedValue([sentRun("run-bbbbbbb1", "spring.xlsx", 4)]);
    connect();
    const user = userEvent.setup();
    render(<RecipientsPanel />);
    await user.click(await screen.findByRole("button", { name: "History" }));
    expect(useMergeStore.getState().step).toBe("history");
  });

  it("shows no section before anything has been sent from a file", async () => {
    vi.mocked(api.listRuns).mockResolvedValue([sentRun("run-ccccccc1", undefined, 4)]);
    connect();
    render(<RecipientsPanel />);
    await screen.findByText(/No saved lists in this workspace yet/);
    await waitFor(() => expect(api.listRuns).toHaveBeenCalled());
    expect(screen.queryByRole("list", { name: "Sent files" })).not.toBeInTheDocument();
    expect(screen.queryByText("Sent files")).not.toBeInTheDocument();
  });

  it("shows no section when saving is off", () => {
    connect(NO_DB);
    render(<RecipientsPanel />);
    expect(screen.queryByText("Sent files")).not.toBeInTheDocument();
    expect(api.listRuns).not.toHaveBeenCalled();
  });
});

describe("marking lists as done", () => {
  const doneList = { ...listSummary, id: "l2", name: "Old campaign", doneAt: "2026-11-01T09:00:00.000Z" };

  it("keeps done lists out of Saved lists and shows them under Already done or sent", async () => {
    vi.mocked(api.listLists).mockResolvedValue([listSummary, doneList]);
    connect();
    render(<RecipientsPanel />);

    const todo = await screen.findByRole("list", { name: "Saved lists" });
    expect(within(todo).getByText("Leads")).toBeInTheDocument();
    expect(within(todo).queryByText("Old campaign")).not.toBeInTheDocument();
    const done = screen.getByRole("list", { name: "Done lists" });
    expect(within(done).getByText("Old campaign")).toBeInTheDocument();
    expect(screen.getByText("Already done or sent")).toBeInTheDocument();
  });

  it("marks a list done and refreshes both sections", async () => {
    vi.mocked(api.listLists).mockResolvedValueOnce([listSummary]).mockResolvedValue([{ ...listSummary, doneAt: NOW }]);
    vi.mocked(api.markListDone).mockResolvedValue({ ...listSummary, doneAt: NOW });
    connect();
    const user = userEvent.setup();
    render(<RecipientsPanel />);

    await user.click(await screen.findByRole("button", { name: "Mark done" }));
    expect(api.markListDone).toHaveBeenCalledWith(WS, "l1", true);
    const done = await screen.findByRole("list", { name: "Done lists" });
    expect(within(done).getByText("Leads")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Saved lists" })).queryByText("Leads")).not.toBeInTheDocument();
    expect(screen.getByText("Every saved list is marked as done.")).toBeInTheDocument();
  });

  it("moves a done list back", async () => {
    vi.mocked(api.listLists).mockResolvedValueOnce([doneList]).mockResolvedValue([{ ...doneList, doneAt: undefined }]);
    vi.mocked(api.markListDone).mockResolvedValue({ ...doneList, doneAt: undefined });
    connect();
    const user = userEvent.setup();
    render(<RecipientsPanel />);

    await user.click(await screen.findByRole("button", { name: "Move back" }));
    expect(api.markListDone).toHaveBeenCalledWith(WS, "l2", false);
    expect(within(await screen.findByRole("list", { name: "Saved lists" })).getByText("Old campaign")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Done lists" })).not.toBeInTheDocument();
  });

  it("explains a failure and leaves the list where it was", async () => {
    vi.mocked(api.listLists).mockResolvedValue([listSummary]);
    vi.mocked(api.markListDone).mockRejectedValue(new api.ApiError("Could not reach the database. Try again shortly.", 503));
    connect();
    const user = userEvent.setup();
    render(<RecipientsPanel />);
    await user.click(await screen.findByRole("button", { name: "Mark done" }));
    expect(await screen.findByText("Could not reach the database. Try again shortly.")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Saved lists" })).getByText("Leads")).toBeInTheDocument();
  });

  it("lists them in History too", async () => {
    vi.mocked(api.listLists).mockResolvedValue([listSummary, doneList]);
    connect();
    render(<HistoryPanel />);
    const marked = await screen.findByRole("list", { name: "Lists marked as done" });
    expect(within(marked).getByText("Old campaign")).toBeInTheDocument();
    expect(within(marked).queryByText("Leads")).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing sent yet/)).not.toBeInTheDocument();
  });
});

describe("finished lists and sent files", () => {
  const sentRun = (fileName: string, finishedAt: string, sent = 4) => ({
    runId: `run-${fileName}`,
    subject: "Hello",
    fromAddress: "team@resumestart.ai",
    startedAt: finishedAt,
    finishedAt,
    sent,
    failed: 0,
    fileName,
  });
  const AFTER = "2026-11-01T11:00:00.000Z";

  it("moves a list out of Saved lists once its file has been sent from", async () => {
    vi.mocked(api.listLists).mockResolvedValue([listSummary, { ...listSummary, id: "l3", name: "Other", fileName: "other.csv" }]);
    vi.mocked(api.listRuns).mockResolvedValue([sentRun("leads.csv", AFTER)]);
    connect();
    render(<RecipientsPanel />);

    const todo = await screen.findByRole("list", { name: "Saved lists" });
    await screen.findByRole("list", { name: "Done lists" });
    expect(within(todo).queryByText("Leads")).not.toBeInTheDocument();
    expect(within(todo).getByText("Other")).toBeInTheDocument();
    const done = screen.getByRole("list", { name: "Done lists" });
    expect(within(done).getByText("Leads")).toBeInTheDocument();
    expect(within(done).getByText("4 sent")).toBeInTheDocument();
    // Its file is not listed a second time.
    expect(screen.queryByRole("list", { name: "Sent files" })).not.toBeInTheDocument();
  });

  it("keeps a list in Saved lists when it was edited after the last send", async () => {
    vi.mocked(api.listLists).mockResolvedValue([listSummary]);
    vi.mocked(api.listRuns).mockResolvedValue([sentRun("leads.csv", "2026-11-01T09:00:00.000Z")]);
    connect();
    render(<RecipientsPanel />);
    const todo = await screen.findByRole("list", { name: "Saved lists" });
    await waitFor(() => expect(within(todo).getByText("Leads")).toBeInTheDocument());
    expect(screen.queryByRole("list", { name: "Done lists" })).not.toBeInTheDocument();
  });

  it("moves a sent list back", async () => {
    vi.mocked(api.listLists).mockResolvedValueOnce([listSummary]).mockResolvedValue([{ ...listSummary, updatedAt: "2026-11-01T12:00:00.000Z" }]);
    vi.mocked(api.listRuns).mockResolvedValue([sentRun("leads.csv", AFTER)]);
    vi.mocked(api.markListDone).mockResolvedValue({ ...listSummary, updatedAt: "2026-11-01T12:00:00.000Z" });
    connect();
    const user = userEvent.setup();
    render(<RecipientsPanel />);
    await user.click(await screen.findByRole("button", { name: "Move back" }));
    expect(api.markListDone).toHaveBeenCalledWith(WS, "l1", false);
    expect(within(await screen.findByRole("list", { name: "Saved lists" })).getByText("Leads")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Done lists" })).not.toBeInTheDocument();
  });

  it("deletes a finished list together with its send history", async () => {
    vi.mocked(api.listLists).mockResolvedValueOnce([listSummary]).mockResolvedValue([]);
    vi.mocked(api.listRuns).mockResolvedValueOnce([sentRun("leads.csv", AFTER)]).mockResolvedValue([]);
    vi.mocked(api.deleteSaved).mockResolvedValue(undefined);
    vi.mocked(api.deleteRunsForFile).mockResolvedValue(undefined);
    connect();
    const user = userEvent.setup();
    render(<RecipientsPanel />);
    await user.click(await screen.findByRole("button", { name: "Delete list Leads" }));
    expect(screen.getByText(/Deletes the list and its send history/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(api.deleteSaved).toHaveBeenCalledWith("lists", "l1", WS);
    expect(api.deleteRunsForFile).toHaveBeenCalledWith(WS, "leads.csv");
    await waitFor(() => expect(screen.queryByRole("list", { name: "Done lists" })).not.toBeInTheDocument());
  });

  it("deletes a sent file that has no saved list", async () => {
    vi.mocked(api.listRuns).mockResolvedValueOnce([sentRun("spring.xlsx", AFTER)]).mockResolvedValue([]);
    vi.mocked(api.deleteRunsForFile).mockResolvedValue(undefined);
    connect();
    const user = userEvent.setup();
    render(<RecipientsPanel />);
    await user.click(await screen.findByRole("button", { name: "Delete spring.xlsx from sent files" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(api.deleteRunsForFile).toHaveBeenCalledWith(WS, "spring.xlsx");
    expect(api.deleteSaved).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("list", { name: "Sent files" })).not.toBeInTheDocument());
  });
});

describe("recording a run", () => {
  function ready(status: SessionStatus) {
    const s = useMergeStore.getState();
    connect(status);
    s.loadSample();
    s.markTestSent();
    s.setStep("send");
  }

  it("tags every chunk of one run with the same id and the template subject", async () => {
    ready(CONNECTED);
    const user = userEvent.setup();
    render(<SendPanel />);
    await user.click(screen.getByRole("button", { name: /Send to 4 people/ }));
    await waitFor(() => expect(useMergeStore.getState().run.status).toBe("done"));
    const calls = vi.mocked(api.sendChunk).mock.calls;
    const runId = useMergeStore.getState().run.runId;
    expect(runId).toMatch(/^run-/);
    expect(calls.length).toBeGreaterThan(0);
    const fileName = useMergeStore.getState().workbook?.fileName;
    expect(fileName).toBeTruthy();
    for (const [, tag] of calls) expect(tag).toEqual({ runId, subject: useMergeStore.getState().subject, workspaceId: WS, fileName });
  });

  it("does not ask the server to record anything when saving is off", async () => {
    ready(NO_DB);
    const user = userEvent.setup();
    render(<SendPanel />);
    await user.click(screen.getByRole("button", { name: /Send to 4 people/ }));
    await waitFor(() => expect(useMergeStore.getState().run.status).toBe("done"));
    for (const [, tag] of vi.mocked(api.sendChunk).mock.calls) expect(tag).toBeUndefined();
  });

  it("keeps the same run id when a paused run is resumed", async () => {
    ready(CONNECTED);
    useMergeStore.getState().startRun(["r0", "r1"]);
    const id = useMergeStore.getState().run.runId;
    useMergeStore.getState().setRunStatus("paused");
    useMergeStore.getState().requeueFailed();
    expect(useMergeStore.getState().run.runId).toBe(id);
    useMergeStore.getState().resetRun();
    expect(useMergeStore.getState().run.runId).toBeNull();
  });
});

describe("workspaces", () => {
  const two = [workspace("w1", "Spring campaign", { lists: 2, templates: 1, runs: 3 }), workspace("w2", "Clients")];

  function connectWith(items = two, active: string | null = "w1") {
    const s = useMergeStore.getState();
    s.setSession(CONNECTED);
    s.setWorkspaces(items, active);
  }

  it("loads this mailbox's workspaces on start and opens the first one", async () => {
    vi.mocked(api.getSession).mockResolvedValue(CONNECTED);
    vi.mocked(api.listWorkspaces).mockResolvedValue(two);
    render(<WorkspaceHarness />);
    await waitFor(() => expect(useMergeStore.getState().activeWorkspaceId).toBe("w1"));
    expect(useMergeStore.getState().workspaces).toHaveLength(2);
  });

  it("goes back to the workspace this mailbox used last", async () => {
    window.localStorage.setItem("postie.workspace:team@mybedigital.com", "w2");
    vi.mocked(api.getSession).mockResolvedValue(CONNECTED);
    vi.mocked(api.listWorkspaces).mockResolvedValue(two);
    render(<WorkspaceHarness />);
    await waitFor(() => expect(useMergeStore.getState().activeWorkspaceId).toBe("w2"));
  });

  it("does not load workspaces when the server cannot save", async () => {
    vi.mocked(api.getSession).mockResolvedValue(NO_DB);
    render(<WorkspaceHarness />);
    await waitFor(() => expect(useMergeStore.getState().session?.connected).toBe(true));
    expect(api.listWorkspaces).not.toHaveBeenCalled();
  });

  it("creates a workspace, opens it, and says what to do next", async () => {
    connectWith([]);
    vi.mocked(api.createWorkspace).mockResolvedValue(workspace("w9", "Autumn"));
    vi.mocked(api.listWorkspaces).mockResolvedValue([workspace("w9", "Autumn")]);
    const user = userEvent.setup();
    render(<WorkspacesPanel />);
    expect(screen.getByText(/No workspaces yet/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("New workspace"), "Autumn");
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    expect(await screen.findByText(/“Autumn” is ready and open/)).toBeInTheDocument();
    expect(api.createWorkspace).toHaveBeenCalledWith("Autumn");
    expect(useMergeStore.getState().activeWorkspaceId).toBe("w9");
    const list = await screen.findByRole("list", { name: "Workspaces" });
    expect(within(list).getByText("Current")).toBeInTheDocument();
  });

  it("shows the server's reason when a name is taken", async () => {
    connectWith();
    vi.mocked(api.createWorkspace).mockRejectedValue(new api.ApiError('You already have a workspace called "Clients".', 409, "conflict"));
    const user = userEvent.setup();
    render(<WorkspacesPanel />);
    await user.type(screen.getByLabelText("New workspace"), "Clients");
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already have a workspace called");
  });

  it("describes what each workspace holds", () => {
    connectWith();
    render(<WorkspacesPanel />);
    const list = screen.getByRole("list", { name: "Workspaces" });
    expect(within(list).getByText("2 lists · 1 template · 3 sends")).toBeInTheDocument();
    expect(within(list).getByText("Empty")).toBeInTheDocument();
  });

  it("opens another workspace and lands on Recipients", async () => {
    connectWith();
    const user = userEvent.setup();
    render(<WorkspacesPanel />);
    const clients = screen.getByText("Clients").closest("li") as HTMLElement;
    await user.click(within(clients).getByRole("button", { name: "Open" }));
    expect(useMergeStore.getState().activeWorkspaceId).toBe("w2");
    expect(useMergeStore.getState().step).toBe("recipients");
    expect(window.localStorage.getItem("postie.workspace:team@mybedigital.com")).toBe("w2");
  });

  it("renames a workspace", async () => {
    connectWith();
    vi.mocked(api.renameWorkspace).mockResolvedValue(workspace("w2", "Big clients"));
    vi.mocked(api.listWorkspaces).mockResolvedValue([two[0], workspace("w2", "Big clients")]);
    const user = userEvent.setup();
    render(<WorkspacesPanel />);
    await user.click(screen.getByRole("button", { name: "Rename workspace Clients" }));
    const field = screen.getByLabelText("New name for Clients");
    await user.clear(field);
    await user.type(field, "Big clients");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(await screen.findByText("Big clients")).toBeInTheDocument();
    expect(api.renameWorkspace).toHaveBeenCalledWith("w2", "Big clients");
  });

  it("warns what will be lost, lets you back out, then deletes and moves to another workspace", async () => {
    connectWith();
    vi.mocked(api.deleteWorkspace).mockResolvedValue();
    vi.mocked(api.listWorkspaces).mockResolvedValue([two[1]]);
    const user = userEvent.setup();
    render(<WorkspacesPanel />);
    await user.click(screen.getByRole("button", { name: "Delete workspace Spring campaign" }));
    expect(screen.getByRole("alert")).toHaveTextContent("permanently deletes “Spring campaign” and everything in it: 2 lists · 1 template · 3 sends");
    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(api.deleteWorkspace).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete workspace Spring campaign" }));
    await user.click(screen.getByRole("button", { name: "Delete workspace" }));
    await waitFor(() => expect(api.deleteWorkspace).toHaveBeenCalledWith("w1"));
    await waitFor(() => expect(useMergeStore.getState().activeWorkspaceId).toBe("w2"));
    expect(screen.queryByText("Spring campaign")).not.toBeInTheDocument();
  });

  it("will not let you delete the only workspace, and says why", async () => {
    connectWith([workspace("w1", "My workspace")], "w1");
    const user = userEvent.setup();
    render(<WorkspacesPanel />);
    const remove = screen.getByRole("button", { name: "Delete workspace My workspace" });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute("title", expect.stringMatching(/at least one workspace/));
    expect(screen.getByText(/You need at least one workspace/, { selector: "p" })).toBeInTheDocument();
    await user.click(remove);
    expect(screen.queryByRole("button", { name: "Delete workspace" })).not.toBeInTheDocument();
    expect(api.deleteWorkspace).not.toHaveBeenCalled();
    // Renaming it is fine.
    expect(screen.getByRole("button", { name: "Rename workspace My workspace" })).toBeEnabled();
  });

  it("allows deleting once a second workspace exists, and the note goes away", () => {
    connectWith();
    render(<WorkspacesPanel />);
    expect(screen.getByRole("button", { name: "Delete workspace Spring campaign" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete workspace Clients" })).toBeEnabled();
    expect(screen.queryByText(/You need at least one workspace/)).not.toBeInTheDocument();
  });

  it("keeps a workspace on screen when deleting it fails", async () => {
    connectWith();
    vi.mocked(api.deleteWorkspace).mockRejectedValue(new api.ApiError("Could not reach the database. Try again shortly.", 503, "storage"));
    const user = userEvent.setup();
    render(<WorkspacesPanel />);
    await user.click(screen.getByRole("button", { name: "Delete workspace Clients" }));
    await user.click(screen.getByRole("button", { name: "Delete workspace" }));
    expect((await screen.findAllByText("Could not reach the database. Try again shortly.")).length).toBeGreaterThan(0);
    expect(screen.getByText("Clients")).toBeInTheDocument();
  });

  it("asks to connect first, and explains when there is no database", () => {
    const { unmount } = render(<WorkspacesPanel />);
    expect(screen.queryByRole("list", { name: "Workspaces" })).not.toBeInTheDocument();
    unmount();
    connect(NO_DB);
    render(<WorkspacesPanel />);
    expect(screen.getByText(/no database set up/)).toBeInTheDocument();
  });

  it("reads saved lists from the workspace that is open, and nothing from the others", async () => {
    connectWith();
    vi.mocked(api.listLists).mockImplementation(async (ws) => (ws === "w1" ? [listSummary] : []));
    render(<RecipientsPanel />);
    expect(await screen.findByText("Leads")).toBeInTheDocument();
    expect(screen.getByText(/Spring campaign/)).toBeInTheDocument();
    expect(api.listLists).toHaveBeenCalledWith("w1");

    act(() => useMergeStore.getState().switchWorkspace("w2"));
    expect(await screen.findByText(/No saved lists in this workspace yet/)).toBeInTheDocument();
    expect(screen.queryByText("Leads")).not.toBeInTheDocument();
    expect(api.listLists).toHaveBeenCalledWith("w2");
  });

  it("opens and saves lists inside the workspace that is open", async () => {
    connectWith();
    vi.mocked(api.listLists).mockResolvedValue([listSummary]);
    vi.mocked(api.loadList).mockResolvedValue({ ...listSummary, headers: ["Email"], emailColumn: "Email", rows: [{ Email: "a@x.com" }] });
    vi.mocked(api.saveList).mockResolvedValue(listSummary);
    const user = userEvent.setup();
    act(() => useMergeStore.getState().switchWorkspace("w2"));
    render(<RecipientsPanel />);
    await user.click(await screen.findByRole("button", { name: "Open" }));
    expect(api.loadList).toHaveBeenCalledWith("w2", "l1");
    await user.type(await screen.findByLabelText(/Saved as/), " 2");
    await user.click(screen.getByRole("button", { name: "Update list" }));
    await waitFor(() => expect(api.saveList).toHaveBeenCalledWith("w2", expect.objectContaining({ name: "Leads 2" })));
  });

  it("forgets which saved list a sheet came from when you change workspace", async () => {
    connectWith();
    vi.mocked(api.listLists).mockResolvedValue([]);
    useMergeStore.getState().loadSample();
    useMergeStore.getState().setSavedListName("Leads");
    expect(useMergeStore.getState().savedSignature).not.toBeNull();
    act(() => useMergeStore.getState().switchWorkspace("w2"));
    const s = useMergeStore.getState();
    // The sheet itself stays; it just is not a saved list of the new workspace.
    expect(s.workbook).not.toBeNull();
    expect(s.savedListName).toBeNull();
    expect(s.savedSignature).toBeNull();
    render(<RecipientsPanel />);
    expect(await screen.findByRole("button", { name: "Save list" })).toBeEnabled();
    expect(screen.getByLabelText(/Save this list in Clients/)).toBeInTheDocument();
  });

  it("keeps templates and history per workspace too", async () => {
    connectWith();
    vi.mocked(api.listTemplates).mockImplementation(async (ws) => (ws === "w1" ? [template] : []));
    vi.mocked(api.listRuns).mockResolvedValue([]);
    useMergeStore.getState().loadSample();
    const compose = render(<ComposePanel />);
    expect(await screen.findByText("Welcome")).toBeInTheDocument();
    compose.unmount();

    act(() => useMergeStore.getState().switchWorkspace("w2"));
    render(<ComposePanel />);
    expect(await screen.findByText("No templates in this workspace yet.")).toBeInTheDocument();
    expect(api.listTemplates).toHaveBeenLastCalledWith("w2");
  });

  it("tells you to create a workspace where saving needs one", async () => {
    connectWith([], null);
    useMergeStore.getState().loadSample();
    const user = userEvent.setup();
    const recipients = render(<RecipientsPanel />);
    expect(screen.getByText(/Create a workspace to keep this list/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save list" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create a workspace" }));
    expect(useMergeStore.getState().step).toBe("workspaces");
    expect(api.listLists).not.toHaveBeenCalled();
    recipients.unmount();

    render(<HistoryPanel />);
    expect(screen.getByText(/Create a workspace to keep send history/)).toBeInTheDocument();
    expect(api.listRuns).not.toHaveBeenCalled();
  });

  it("does not tag a send with a workspace when none is open", async () => {
    const s = useMergeStore.getState();
    s.setSession(CONNECTED);
    s.setWorkspaces([], null);
    s.loadSample();
    s.markTestSent();
    s.setStep("send");
    const user = userEvent.setup();
    render(<SendPanel />);
    await user.click(screen.getByRole("button", { name: /Send to 4 people/ }));
    await waitFor(() => expect(useMergeStore.getState().run.status).toBe("done"));
    for (const [, tag] of vi.mocked(api.sendChunk).mock.calls) expect(tag).toBeUndefined();
  });

  it("switches workspace from the header, and offers to create one when there are none", async () => {
    connectWith();
    const user = userEvent.setup();
    const view = render(<WorkspaceSwitcher />);
    const picker = screen.getByRole("combobox", { name: "Workspace" });
    expect(picker).toHaveTextContent("Spring campaign");
    await user.click(picker);
    expect(screen.getByRole("option", { name: "Spring campaign" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("option", { name: "Clients" }));
    expect(useMergeStore.getState().activeWorkspaceId).toBe("w2");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    view.unmount();

    useMergeStore.getState().setWorkspaces([], null);
    render(<WorkspaceSwitcher />);
    await user.click(screen.getByRole("button", { name: /Create a workspace/ }));
    expect(useMergeStore.getState().step).toBe("workspaces");
  });

  it("locks the header picker while a send is running", () => {
    connectWith();
    useMergeStore.getState().loadSample();
    useMergeStore.getState().startRun(["r0"]);
    render(<WorkspaceSwitcher />);
    expect(screen.getByRole("combobox", { name: "Workspace" })).toBeDisabled();
  });

  it("is hidden when the server cannot save or nobody is connected", () => {
    const { container, unmount } = render(<WorkspaceSwitcher />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    connect(NO_DB);
    const again = render(<WorkspaceSwitcher />);
    expect(again.container).toBeEmptyDOMElement();
  });

  it("drops workspaces when the mailbox disconnects or changes", () => {
    connectWith();
    expect(useMergeStore.getState().activeWorkspaceId).toBe("w1");
    // Switching the mailbox on the same account keeps the account's workspaces.
    useMergeStore.getState().setSession({ ...CONNECTED, profile: { ...PROFILE, user: "someone@else.com" } });
    expect(useMergeStore.getState().activeWorkspaceId).toBe("w1");
    useMergeStore.getState().setSession({ ...CONNECTED, account: "other@account.com" });
    expect(useMergeStore.getState().workspaces).toBeNull();
    expect(useMergeStore.getState().activeWorkspaceId).toBeNull();
    connectWith();
    useMergeStore.getState().setSession({ connected: false, accessCodeRequired: false, localAccountAvailable: false, maxRecipientsPerRun: 100 });
    expect(useMergeStore.getState().activeWorkspaceId).toBeNull();
  });

  it("moves off the workspaces view when disconnected", () => {
    connectWith();
    useMergeStore.getState().setStep("workspaces");
    useMergeStore.getState().setSession({ connected: false, accessCodeRequired: false, localAccountAvailable: false, maxRecipientsPerRun: 100 });
    expect(useMergeStore.getState().step).toBe("connect");
  });
});

/** Mounts just the bootstrap hooks, the way the app shell does. */
function WorkspaceHarness() {
  useSessionBootstrap();
  useWorkspaceBootstrap();
  return null;
}
