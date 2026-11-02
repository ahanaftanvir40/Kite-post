"use client";

import { Download, ExternalLink, Search, Square, TriangleAlert } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { download } from "@/features/merge/download";
import type { Kind, Level, Person } from "@/lib/leads/academic";
import { COUNTRIES, COUNTRY_BY_CODE, GENERAL_RESOURCES } from "@/lib/leads/countries";
import type { StudyCrawl, StudySearchParams, StudySearchRecord } from "@/lib/db/types";
import { QuotaExhaustedError, readLeadQuota } from "../api";
import { findPreviousDownload, rememberDownload } from "../history";
import { peopleToXlsx, runStudySearch, type StudyProgress } from "../study";
import { BetaQuotaModal } from "./BetaQuotaModal";
import { RepeatSearchModal } from "./RepeatSearchModal";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: "professors", label: "Professors", hint: "Faculty in your field: for supervisors, research positions and assistantships." },
  { value: "admissions", label: "Admissions offices", hint: "Graduate or international admissions contacts: for entry requirements, deadlines and documents." },
  { value: "funding", label: "Funding and scholarship offices", hint: "Scholarship and financial aid contacts for international students." },
];

const LEVELS: { value: Level; label: string }[] = [
  { value: "any", label: "Any level" },
  { value: "masters", label: "Master's" },
  { value: "phd", label: "PhD" },
  { value: "postdoc", label: "Postdoc" },
];

const TARGETS = [
  { value: "20", label: "About 20 contacts" },
  { value: "40", label: "About 40 contacts" },
  { value: "80", label: "About 80 contacts" },
];

function statusLine(p: StudyProgress): string {
  if (p.phase === "searching") return "Searching university sites";
  if (p.phase === "reading") return `Reading pages: ${p.pagesRead} of ${p.pagesFound}`;
  return "Done";
}

export function StudyFinder() {
  const [kind, setKind] = useState<Kind>("professors");
  const [field, setField] = useState("");
  const [level, setLevel] = useState<Level>("masters");
  const [countries, setCountries] = useState<string[]>(["uk"]);
  const [university, setUniversity] = useState("");
  const [target, setTarget] = useState("40");
  const [progress, setProgress] = useState<StudyProgress | null>(null);
  const [searchedField, setSearchedField] = useState("");
  const [running, setRunning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaOpen, setQuotaOpen] = useState(false);
  /** A search that matches an earlier download, waiting for the person to say go. */
  const [repeat, setRepeat] = useState<{ previous: StudySearchRecord; remaining: number | null } | null>(null);
  /** How many people from an earlier download this search left out. */
  const [skipped, setSkipped] = useState(0);
  /** The settings the search on screen was run with, kept so a later edit to the form can't change what gets remembered. */
  const [searched, setSearched] = useState<StudySearchParams | null>(null);
  const abort = useRef<AbortController | null>(null);

  function toggleCountry(code: string) {
    setCountries((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : prev.length < 4 ? [...prev, code] : prev));
  }

  function currentParams(): StudySearchParams {
    return { kind, field: field.trim(), level, countries, university: university.trim() };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (running) return;
    if (countries.length === 0) {
      setError("Pick at least one country.");
      return;
    }
    const params = currentParams();
    setError(null);
    setChecking(true);
    // A repeat is spotted before anything is spent, so "Not now" costs the person nothing.
    const previous = await findPreviousDownload(params);
    setChecking(false);
    if (previous) {
      setRepeat({ previous, remaining: (await readLeadQuota())?.remaining ?? null });
      return;
    }
    await search(params, null);
  }

  async function search(params: StudySearchParams, previous: StudySearchRecord | null) {
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    setError(null);
    setProgress(null);
    setSearched(params);
    setSkipped(previous?.contacts.length ?? 0);
    setSearchedField(params.field);
    try {
      await runStudySearch(
        { ...params, target: Number(target), previous: previous ? { contacts: previous.contacts, crawl: previous.crawl } : undefined },
        controller.signal,
        setProgress,
      );
    } catch (e) {
      if (e instanceof QuotaExhaustedError) setQuotaOpen(true);
      else if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "The search failed.");
    } finally {
      setRunning(false);
    }
  }

  function searchAgain() {
    if (!repeat) return;
    const { previous } = repeat;
    setRepeat(null);
    void search(currentParams(), previous);
  }

  function downloadFile(list: Person[], crawl: StudyCrawl) {
    download(skipped > 0 ? "study-abroad-contacts-new.xlsx" : "study-abroad-contacts.xlsx", peopleToXlsx(list, searchedField), XLSX_TYPE);
    if (searched) void rememberDownload(searched, list, crawl);
  }

  const people = progress?.people ?? [];
  const withEmail = people.filter((p) => p.email).length;
  const shown = COUNTRIES.filter((c) => countries.includes(c.code));
  const kindHint = KINDS.find((k) => k.value === kind)?.hint;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      {quotaOpen ? <BetaQuotaModal onClose={() => setQuotaOpen(false)} /> : null}
      {repeat ? <RepeatSearchModal previous={repeat.previous} remaining={repeat.remaining} onSearch={searchAgain} onClose={() => setRepeat(null)} /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Study abroad contacts</h1>
        <Badge tone="warn">Beta</Badge>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-2">
        Find the people to write to when you want to study overseas: professors in your field, admissions offices and funding offices, with their public university email. Download an Excel file and send personal emails with the email merger.
      </p>

      <form onSubmit={(e) => void submit(e)} className="mt-6 grid gap-4 rounded-2xl border border-line bg-sheet p-5 max-sm:p-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <span className="mb-1 block text-sm font-medium text-ink">Who do you want to contact?</span>
          <div role="radiogroup" aria-label="Who to contact" className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={kind === k.value}
                onClick={() => setKind(k.value)}
                className={`h-9 max-sm:h-11 cursor-pointer rounded-full border px-4 text-sm transition-colors duration-200 ${
                  kind === k.value ? "border-kite-coral bg-sunk font-medium text-ink" : "border-line text-ink-2 hover:text-ink"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[13px] text-ink-3">{kindHint}</p>
        </div>
        <TextField
          label="Subject or research area"
          hint="Be specific for professors, e.g. computer vision. A degree name works for offices."
          value={field}
          onChange={(e) => setField(e.target.value)}
          placeholder="Machine learning"
          required
          minLength={2}
          maxLength={100}
        />
        <div>
          <span className="mb-1 block text-sm font-medium text-ink">Degree you want</span>
          <Select aria-label="Degree level" value={level} options={LEVELS} onChange={(v) => setLevel(v as Level)} />
        </div>
        <div className="md:col-span-2">
          <span className="mb-1 block text-sm font-medium text-ink">Countries (up to 4)</span>
          <div className="flex flex-wrap gap-2">
            {COUNTRIES.map((c) => {
              const on = countries.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleCountry(c.code)}
                  className={`h-8 max-sm:h-10 cursor-pointer rounded-full border px-3 text-[13px] transition-colors duration-200 ${
                    on ? "border-kite-coral bg-sunk font-medium text-ink" : "border-line text-ink-2 hover:text-ink"
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
        <TextField
          label="A specific university"
          hint="Optional. Leave empty to search every university in these countries."
          value={university}
          onChange={(e) => setUniversity(e.target.value)}
          placeholder="University of Edinburgh"
          maxLength={100}
        />
        <div>
          <span className="mb-1 block text-sm font-medium text-ink">How many</span>
          <Select aria-label="How many contacts" value={target} options={TARGETS} onChange={setTarget} />
        </div>
        <div className="flex items-end gap-2 md:col-span-2">
          <Button type="submit" variant="primary" loading={running || checking} icon={<Search className="size-4" aria-hidden />}>
            {running ? "Searching" : "Find contacts"}
          </Button>
          {running ? (
            <Button icon={<Square className="size-3.5" aria-hidden />} onClick={() => abort.current?.abort()}>
              Stop
            </Button>
          ) : null}
        </div>
      </form>

      {error ? (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-stamp bg-failed-wash px-3 py-2.5 text-sm text-failed">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {progress ? (
        <section aria-live="polite" className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{running ? statusLine(progress) : progress.phase === "done" ? "Finished" : "Stopped"}</p>
              <p className="text-[13px] text-ink-3">
                {people.length} contacts, {withEmail} with an email
              </p>
            </div>
            <Button
              variant="primary"
              disabled={people.length === 0}
              icon={<Download className="size-4" aria-hidden />}
              onClick={() => downloadFile(people, progress.crawl)}
            >
              {skipped > 0 ? "Download new contacts" : "Download Excel"}
            </Button>
          </div>
          {skipped > 0 ? (
            <p className="mt-3 text-[13px] text-ink-3">
              {people.length > 0
                ? `Carried on from your last download: these are all new, and the ${skipped} you already have are left out.`
                : `Nothing new this time. The ${skipped} you already have are left out. Try another country, a broader subject, or leave the university empty.`}
            </p>
          ) : null}
          {!running && progress.phase === "done" && people.length < 5 ? (
            <p className="mt-3 text-[13px] text-ink-3">Few results. Try a broader subject, another country, or leave the university empty.</p>
          ) : null}

          {people.length > 0 ? (
            <div className="mt-4 max-h-[28rem] overflow-auto rounded-stamp border border-line bg-sheet">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-sunk text-xs text-ink-2">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">University</th>
                    <th className="px-3 py-2 font-medium">Page</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {people.map((p, i) => (
                    <tr key={`${p.email || p.url}-${p.name}-${i}`}>
                      <td className="px-3 py-2">
                        <span className="block font-medium">{p.name || "Name not found"}</span>
                        <span className="text-xs text-ink-3">{p.role}</span>
                      </td>
                      <td className="px-3 py-2">{p.email || <span className="text-ink-3">Not public</span>}</td>
                      <td className="px-3 py-2">
                        <span className="block">{p.university}</span>
                        <span className="text-xs text-ink-3">{p.country}</span>
                      </td>
                      <td className="px-3 py-2">
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-postal hover:underline">
                          Open <ExternalLink className="size-3" aria-hidden />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold">Scholarships{shown.length ? " for your countries" : ""}</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {shown.map((c) => {
              const s = COUNTRY_BY_CODE.get(c.code)?.scholarship;
              return s ? (
                <li key={c.code}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-postal hover:underline max-sm:inline-block max-sm:py-2">
                    {s.name}
                  </a>
                  <span className="text-ink-3"> ({c.name})</span>
                </li>
              ) : null;
            })}
            {GENERAL_RESOURCES.map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-postal hover:underline max-sm:inline-block max-sm:py-2">
                  {r.name}
                </a>
                <span className="text-ink-3">: {r.note}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Before you write</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li>Read one or two of the professor&apos;s recent papers and mention them. Generic emails are ignored.</li>
            <li>Keep it short: who you are, why their work, what you ask, and your CV attached or linked.</li>
            <li>Ask admissions offices about deadlines, English test scores and documents. Ask professors about supervision and funding.</li>
            <li>Use the Excel columns in the email merger: <code>@greeting</code>, <code>@name</code>, <code>@university</code>, <code>@country</code>, <code>@field</code>.</li>
          </ul>
        </div>
      </section>

      <p className="mt-8 max-w-2xl text-[13px] leading-snug text-ink-3">
        Contacts come from public university web pages and may be out of date or incomplete. Check the page before you write, and send each professor a personal message, not a mass mailing.
      </p>
    </div>
  );
}
