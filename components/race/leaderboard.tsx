"use client";

import { useLayoutEffect, useRef } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import { AnimatedScore } from "@/components/race/race-fx";
import { teamColor, type LobbyTeam, type RoutePoint } from "@/lib/race/lobby";
import { pointLabel, teamProgress } from "@/lib/race/route";
import { accuracy, pointsWord, standings } from "@/lib/race/scoring";

/** Place badge: gold, silver and bronze for the podium. */
const PODIUM = [
  "bg-sun text-ink",
  "bg-[#dfe3ee] text-ink",
  "bg-[#f3c9a8] text-ink",
] as const;

export function PlaceBadge({ place }: { place: number | null }) {
  const { m } = useI18n();
  const podium = place !== null && place <= 3 ? PODIUM[place - 1] : "bg-canvas text-ink-muted ring-1 ring-line";
  return (
    <span
      className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-extrabold tabular-nums ${podium}`}
      aria-label={place === null ? m.leaderboard.noPlace : m.leaderboard.place(place)}
    >
      {place ?? "—"}
    </span>
  );
}

/**
 * Race leaderboard in database order (place, then name).
 * `detailed` adds the teacher's statistics: right / wrong answers and accuracy.
 */
export function Leaderboard({
  teams,
  route,
  ownTeamId = null,
  detailed = false,
}: {
  teams: LobbyTeam[];
  route: RoutePoint[];
  ownTeamId?: string | null;
  detailed?: boolean;
}) {
  const { m } = useI18n();
  const list = useRef<HTMLOListElement>(null);
  const tops = useRef(new Map<string, number>());

  // FLIP: when places change, rows slide to their new place instead of jumping.
  useLayoutEffect(() => {
    const node = list.current;
    if (!node) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, number>();
    for (const row of Array.from(node.children) as HTMLElement[]) {
      const id = row.dataset.team;
      if (!id) continue;
      const top = row.getBoundingClientRect().top;
      next.set(id, top);
      const before = tops.current.get(id);
      if (!still && before !== undefined && Math.abs(before - top) > 2) {
        row.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], {
          duration: 600,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        });
      }
    }
    tops.current = next;
  });

  if (teams.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">
        {m.leaderboard.noTeams}
      </p>
    );
  }

  return (
    <ol ref={list} className="space-y-2" aria-label={m.leaderboard.aria}>
      {standings(teams).map((team) => {
        const progress = teamProgress(route, team.position);
        const color = teamColor(teams, team.id) ?? "#E0162B";
        const own = team.id === ownTeamId;
        const share = detailed ? accuracy(team.stats) : null;
        return (
          <li
            key={team.id}
            data-team={team.id}
            className={`relative flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl px-3 py-2.5 ring-1 ${own ? "bg-brand-soft ring-brand/40" : "bg-surface ring-line"}`}
          >
            {/* How far along the route: a soft bar in the team colour behind the row */}
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 -z-0 transition-[width] duration-700 ease-out"
              style={{ width: `${(progress?.ratio ?? 0) * 100}%`, backgroundColor: color, opacity: 0.1 }}
            />
            <span className="relative"><PlaceBadge place={team.place} /></span>
            <div className="relative min-w-0 flex-1">
              <p className="flex min-w-0 items-center gap-2 font-bold">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                <span className="truncate" title={team.name}>
                  {team.name}
                </span>
                {own && <span className="shrink-0 text-xs font-bold text-brand-strong">· {m.common.you}</span>}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {progress?.finished
                  ? team.finishOrder
                    ? m.leaderboard.finishOrder(team.finishOrder)
                    : m.common.finish
                  : progress
                    ? pointLabel(progress.current, m)
                    : "—"}
                {detailed && team.stats && (
                  <>
                    {" · "}
                    <span className="text-teal-strong">{m.leaderboard.correct(team.stats.correct)}</span>
                    {" · "}
                    <span className="text-danger">{m.leaderboard.wrong(team.stats.wrong)}</span>
                    {share !== null && ` · ${m.leaderboard.accuracy(share)}`}
                  </>
                )}
              </p>
            </div>
            <p className="relative shrink-0 text-right">
              <AnimatedScore value={team.score} className="block font-display text-lg leading-none font-bold" />
              <span className="text-xs text-ink-muted">{pointsWord(team.score, m)}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
