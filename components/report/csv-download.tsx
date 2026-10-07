"use client";

import { buttonClass } from "@/components/ui/button-styles";
import { answersCsv, standingsCsv, type RaceReport } from "@/lib/race/report";

function download(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before freeing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

const icon = (
  <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4">
    <path d="M10 3v10m0 0l-4-4m4 4l4-4M4 16h12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Tables for Excel / Google Sheets, built in the browser from the loaded report. */
export function CsvDownload({ report }: { report: RaceReport }) {
  const base = `gonka-${report.race.code}`;
  const hasAnswers = report.timeline.some((event) => event.kind === "answer");
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className={buttonClass({ variant: "secondary", size: "sm" })}
        disabled={report.teams.length === 0}
        onClick={() => download(`${base}-mesta.csv`, standingsCsv(report))}
      >
        {icon}
        Места (CSV)
      </button>
      <button
        type="button"
        className={buttonClass({ variant: "secondary", size: "sm" })}
        disabled={!hasAnswers}
        onClick={() => download(`${base}-otvety.csv`, answersCsv(report, stamp))}
      >
        {icon}
        Все ответы (CSV)
      </button>
    </div>
  );
}
