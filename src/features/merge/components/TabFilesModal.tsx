"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

/** One file made from a tab, and where it ended up. */
export interface CreatedTabFile {
  /** Position of the tab in the workbook. */
  index: number;
  /** Saved list name, "<file> - <tab>". */
  name: string;
  fileName: string;
  rows: number;
  /** Null when no column of the tab looks like email addresses, so it cannot be mailed. */
  emailColumn: string | null;
  /** The saved list this file became, or null when it was not saved in the workspace. */
  savedAs: string | null;
}

interface Props {
  workbookName: string;
  files: CreatedTabFile[];
  downloaded: boolean;
  /** Set when the files were saved as lists in this workspace. */
  savedIn: string | null;
  /** Rows of all the ticked tabs stacked into one list. Null when only one tab was ticked. */
  stackedRows: number | null;
  onOpen: (file: CreatedTabFile) => void;
  onStack: () => void;
  /** Leave for Recipients, where the saved lists are. Also what closing the dialog does. */
  onDone: () => void;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * Shown after "Use tabs" has made a file for each tab. It says what was created and lets the person
 * choose: work on one of the files now, or go to Recipients to see all of them. Closing it is the
 * second choice, because the tabs are already split and going back to the picker would only offer
 * to split them again.
 */
export function TabFilesModal({ workbookName, files, downloaded, savedIn, stackedRows, onOpen, onStack, onDone }: Props) {
  const where = [downloaded ? (files.length === 1 ? "Downloaded" : "Downloaded as a zip") : null, savedIn ? `Saved in ${savedIn}` : null].filter(Boolean).join(" · ");
  const firstOpenable = files.find((f) => f.emailColumn !== null);

  return (
    <Modal title={files.length === 1 ? "Your tab file is ready" : `${files.length} tab files are ready`} onClose={onDone}>
      <div className="space-y-4">
        <p className="text-sm text-ink-2">
          Made from <span className="font-medium text-ink">{workbookName}</span>
          {where ? `. ${where}.` : "."}
        </p>

        <div>
          <p className="mb-1.5 text-sm font-medium">Which one do you want to work on now?</p>
          <ul aria-label="Tab files" className="divide-y divide-line rounded-stamp border border-line">
            {files.map((f) => (
              <li key={f.index} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium">{f.name}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                    <span className="tnum">{plural(f.rows, "row", "rows")}</span>
                    {f.emailColumn === null ? <span className="text-warn">No email column, so it can only be downloaded</span> : f.savedAs ? <Badge tone="sent">Saved</Badge> : null}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  className="h-8"
                  disabled={f.emailColumn === null}
                  aria-label={`Open ${f.name}`}
                  data-autofocus={f === firstOpenable ? "" : undefined}
                  onClick={() => onOpen(f)}
                >
                  Open
                </Button>
              </li>
            ))}
          </ul>
        </div>

        {stackedRows !== null ? (
          <button
            type="button"
            onClick={onStack}
            className="cursor-pointer text-left text-sm text-postal underline hover:text-postal-deep max-sm:py-2"
          >
            Or stack all {files.length} tabs into one list ({plural(stackedRows, "row", "rows")})
          </button>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={onDone}>
            Go to Recipients
          </Button>
          <p className="min-w-0 flex-1 text-[13px] text-ink-3">
            {savedIn ? "All of them are in Saved lists there." : "Pick any of them later by uploading it again."}
          </p>
        </div>
      </div>
    </Modal>
  );
}
