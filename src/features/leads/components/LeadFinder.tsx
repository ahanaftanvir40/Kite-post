"use client";

import { Download, Search, Square, TriangleAlert } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField, inputClass } from "@/components/ui/TextField";
import { download } from "@/features/merge/download";
import { leadsToXlsx, runLeadSearch, type Phase, type Progress } from "../run";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const TARGETS = [
  { value: "25", label: "About 25 businesses" },
  { value: "50", label: "About 50 businesses" },
  { value: "100", label: "About 100 businesses" },
];

const PHASE_LABEL: Record<Phase, string> = {
  planning: "Working out who to look for",
  searching: "Finding businesses",
  emails: "Looking for emails on their websites",
  done: "Done",
};

function statusLine(p: Progress): string {
  const base = PHASE_LABEL[p.phase];
  if (p.phase === "searching") return `${base}: ${p.leads.length} so far`;
  if (p.phase === "emails") return `${base}: ${p.checked} of ${p.toCheck} sites`;
  return base;
}

export function LeadFinder() {
  const [description, setDescription] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [location, setLocation] = useState("");
  const [target, setTarget] = useState("50");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (running) return;
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    setError(null);
    setProgress(null);
    try {
      await runLeadSearch({ description, productUrl, location, target: Number(target) }, controller.signal, setProgress);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "The lead search failed.");
    } finally {
      setRunning(false);
    }
  }

  const leads = progress?.leads ?? [];
  const withEmail = leads.filter((l) => l.emails.length > 0).length;
  const canDownload = leads.length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Find leads</h1>
        <Badge tone="warn">Beta</Badge>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-2">
        Describe what you sell and where. We find local businesses that could use it, look for a public email on each website, and give you an Excel file.
      </p>

      <form onSubmit={(e) => void submit(e)} className="mt-6 grid gap-4 rounded-2xl border border-line bg-sheet p-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <label htmlFor="lead-description" className="mb-1 block text-sm font-medium text-ink">
            What does your business sell?
          </label>
          <textarea
            id="lead-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            minLength={10}
            maxLength={1000}
            rows={3}
            placeholder="e.g. Appointment reminder software that cuts no-shows for clinics and salons."
            className={`${inputClass} h-auto resize-y py-2`}
          />
        </div>
        <TextField
          label="Product website"
          hint="Optional. Helps us understand what you sell."
          value={productUrl}
          onChange={(e) => setProductUrl(e.target.value)}
          placeholder="yourproduct.com"
          inputMode="url"
          autoComplete="url"
        />
        <TextField
          label="Where are your customers?"
          hint="A city or area. Leads are local businesses."
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Austin, TX"
          required
        />
        <div>
          <span className="mb-1 block text-sm font-medium text-ink">How many</span>
          <Select aria-label="How many businesses" value={target} options={TARGETS} onChange={setTarget} />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" variant="primary" loading={running} icon={<Search className="size-4" aria-hidden />}>
            {running ? "Searching" : "Find leads"}
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
                {leads.length} businesses, {withEmail} with an email
                {progress.plan?.audience ? ` · ${progress.plan.audience}` : ""}
              </p>
            </div>
            <Button
              variant="primary"
              disabled={!canDownload}
              icon={<Download className="size-4" aria-hidden />}
              onClick={() => download("leads.xlsx", leadsToXlsx(leads), XLSX_TYPE)}
            >
              Download Excel
            </Button>
          </div>

          {progress.plan && !progress.plan.ai ? (
            <p className="mt-3 text-[13px] text-ink-3">
              Searching for your description as written. Add an OpenRouter key to have it turned into better business-type searches.
            </p>
          ) : progress.plan ? (
            <p className="mt-3 text-[13px] text-ink-3">Searched for: {progress.plan.queries.join(", ")}</p>
          ) : null}

          {leads.length > 0 ? (
            <div className="mt-4 max-h-[28rem] overflow-auto rounded-stamp border border-line bg-sheet">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-sunk text-xs text-ink-2">
                  <tr>
                    <th className="px-3 py-2 font-medium">Business</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Website</th>
                    <th className="px-3 py-2 font-medium">Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {leads.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2">
                        <span className="block font-medium">{l.name}</span>
                        <span className="text-xs text-ink-3">{l.category}</span>
                      </td>
                      <td className="px-3 py-2">{l.emails[0] ?? <span className="text-ink-3">{l.website ? "Not found" : "No website"}</span>}</td>
                      <td className="max-w-48 truncate px-3 py-2">
                        {l.website ? (
                          <a href={l.website} target="_blank" rel="noopener noreferrer" className="text-postal hover:underline">
                            {l.website.replace(/^https?:\/\/(www\.)?/, "")}
                          </a>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-ink-2">{l.address}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      <p className="mt-8 max-w-2xl text-[13px] leading-snug text-ink-3">
        Emails are read from public business websites, usually info@ or contact@ addresses. Many businesses don&apos;t list one. If you email these leads, identify yourself, include a way to opt out, and follow the rules where they are based.
      </p>
    </div>
  );
}
