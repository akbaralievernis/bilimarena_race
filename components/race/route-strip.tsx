import type { RoutePoint } from "@/lib/race/lobby";
import { pointLabel } from "@/lib/race/route";

/** Compact one-line route for the lobby: Старт → 1. Дроби → … → Финиш. */
export function RouteStrip({ route }: { route: RoutePoint[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2" aria-label="Маршрут гонки">
      {route.map((point, index) => (
        <li key={point.position} className="flex min-w-0 items-center gap-1.5">
          <span
            className={`max-w-56 truncate rounded-full px-3 py-1 text-sm font-semibold ${
              point.type === "start"
                ? "bg-teal-soft text-teal-strong"
                : point.type === "finish"
                  ? "bg-ink text-white"
                  : "bg-canvas ring-1 ring-line"
            }`}
            title={point.type === "checkpoint" ? `${pointLabel(point)}: ${point.title}` : undefined}
          >
            {point.type === "checkpoint" ? `${point.position}. ${point.title}` : pointLabel(point)}
          </span>
          {index < route.length - 1 && (
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 shrink-0 text-ink-muted">
              <path d="M3 8h9m-3-3.5L12.5 8 9 11.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </li>
      ))}
    </ol>
  );
}
