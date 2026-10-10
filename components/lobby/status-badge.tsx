"use client";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { RaceStatus } from "@/lib/race/status";

const STYLES: Record<RaceStatus, { badge: string; dot: string }> = {
  draft: { badge: "bg-canvas text-ink-muted ring-1 ring-line", dot: "bg-ink-muted" },
  lobby: { badge: "bg-sun-soft text-ink", dot: "bg-sun" },
  running: { badge: "bg-teal-soft text-teal-strong", dot: "bg-teal animate-pulse" },
  finished: { badge: "bg-canvas text-ink-muted ring-1 ring-line", dot: "bg-ink-muted" },
};

export function StatusBadge({ status }: { status: RaceStatus }) {
  const style = STYLES[status];
  const { m } = useI18n();
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${style.badge}`}
    >
      <span className={`size-2 rounded-full ${style.dot}`} aria-hidden="true" />
      <span>
        <span className="sr-only">{m.status.label}</span>
        {m.status.names[status]}
      </span>
    </span>
  );
}
