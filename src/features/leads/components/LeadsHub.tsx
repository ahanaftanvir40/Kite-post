"use client";

import { useState } from "react";
import { LeadFinder } from "./LeadFinder";
import { StudyFinder } from "./StudyFinder";

type Section = "business" | "study";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "business", label: "For business" },
  { id: "study", label: "For students" },
];

/** Business lead finder and the student finder behind one switch. Both stay mounted to keep results. */
export function LeadsHub() {
  const [section, setSection] = useState<Section>("business");
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-6xl gap-2 px-4 pt-5 sm:px-6" role="radiogroup" aria-label="Who is this for">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={section === s.id}
            onClick={() => setSection(s.id)}
            className={`h-9 max-sm:h-11 cursor-pointer rounded-full border px-4 text-sm transition-colors duration-200 ${
              section === s.id ? "border-kite-coral bg-sunk font-medium text-ink" : "border-line text-ink-2 hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div hidden={section !== "business"} className="flex-1 flex-col data-[on=true]:flex" data-on={section === "business"}>
        <LeadFinder />
      </div>
      <div hidden={section !== "study"} className="flex-1 flex-col data-[on=true]:flex" data-on={section === "study"}>
        <StudyFinder />
      </div>
    </div>
  );
}
