// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudyFinder } from "@/features/leads/components/StudyFinder";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  remember: vi.fn(),
  run: vi.fn(),
  quota: vi.fn(),
  download: vi.fn(),
}));

vi.mock("@/features/leads/history", async (orig) => ({
  ...(await orig<typeof import("@/features/leads/history")>()),
  findPreviousDownload: mocks.find,
  rememberDownload: mocks.remember,
}));
vi.mock("@/features/leads/api", async (orig) => ({ ...(await orig<typeof import("@/features/leads/api")>()), readLeadQuota: mocks.quota }));
vi.mock("@/features/leads/study", async (orig) => ({
  ...(await orig<typeof import("@/features/leads/study")>()),
  runStudySearch: mocks.run,
  peopleToXlsx: () => new Uint8Array([1]),
}));
vi.mock("@/features/merge/download", () => ({ download: mocks.download }));

const person = (email: string, name: string) => ({ name, greeting: "", role: "Professor", university: "University of Oxford", domain: "ox.ac.uk", country: "United Kingdom", email, otherEmails: [], about: "", url: "https://ox.ac.uk" });
const previous = { key: "k", params: { kind: "professors", field: "ml", level: "masters", countries: ["uk"], university: "" }, contacts: ["old@ox.ac.uk"], crawl: { pages: { uk: 2 }, urls: ["https://ox.ac.uk/a"] }, downloads: 1, lastDownloadedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.quota.mockResolvedValue({ remaining: 1, limit: 2 });
  mocks.run.mockImplementation(async (_i: unknown, _s: unknown, onProgress: (p: unknown) => void) => {
    const state = { phase: "done", people: [person("new@ox.ac.uk", "New Person")], pagesRead: 1, pagesFound: 1, crawl: { pages: { uk: 3 }, urls: ["https://ox.ac.uk/b"] } };
    onProgress(state);
    return state;
  });
});

async function submit() {
  await userEvent.type(screen.getByLabelText(/subject or research area/i), "machine learning");
  await userEvent.click(screen.getByRole("button", { name: /find contacts/i }));
}

describe("StudyFinder repeat searches", () => {
  it("searches straight away when nothing matches", async () => {
    mocks.find.mockResolvedValue(null);
    render(<StudyFinder />);
    await submit();
    await waitFor(() => expect(mocks.run).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: /download excel/i })).toBeEnabled();
  });

  it("asks first, spends nothing on 'Not now'", async () => {
    mocks.find.mockResolvedValue(previous);
    render(<StudyFinder />);
    await submit();
    const dialog = await screen.findByRole("dialog", { name: /searched this before/i });
    expect(within(dialog).getByText(/3 days ago/)).toBeInTheDocument();
    expect(within(dialog).getByText(/1 contact\b/)).toBeInTheDocument();
    expect(within(dialog).getByText(/1 search left/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: /not now/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("on 'Find new contacts', carries on from the last search and downloads only new people", async () => {
    mocks.find.mockResolvedValue(previous);
    render(<StudyFinder />);
    await submit();
    await userEvent.click(await screen.findByRole("button", { name: /find new contacts/i }));
    await waitFor(() => expect(mocks.run).toHaveBeenCalled());

    // The crawl is handed what the last download covered, so it can skip those pages and people.
    expect(mocks.run.mock.calls[0][0]).toMatchObject({ previous: { contacts: ["old@ox.ac.uk"], crawl: { pages: { uk: 2 } } } });
    expect(await screen.findByText(/the 1 you already have are left out/i)).toBeInTheDocument();
    expect(screen.queryByText("Old Person")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /download new contacts/i }));
    expect(mocks.download).toHaveBeenCalledWith("study-abroad-contacts-new.xlsx", expect.anything(), expect.anything());
    expect(mocks.remember).toHaveBeenCalledWith(
      expect.objectContaining({ field: "machine learning" }),
      [expect.objectContaining({ email: "new@ox.ac.uk" })],
      { pages: { uk: 3 }, urls: ["https://ox.ac.uk/b"] },
    );
  });

  it("remembers a plain download so the next search can be recognised", async () => {
    mocks.find.mockResolvedValue(null);
    render(<StudyFinder />);
    await submit();
    await userEvent.click(await screen.findByRole("button", { name: /download excel/i }));
    expect(mocks.remember).toHaveBeenCalledWith(expect.objectContaining({ kind: "professors", countries: ["uk"] }), expect.arrayContaining([expect.objectContaining({ email: "new@ox.ac.uk" })]), expect.objectContaining({ pages: { uk: 3 } }));
  });
});
