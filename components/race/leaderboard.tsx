import { teamColor, type LobbyTeam, type RoutePoint } from "@/lib/race/lobby";
import { pointLabel, teamProgress } from "@/lib/race/route";
import { accuracy, standings } from "@/lib/race/scoring";

/** Place badge: gold, silver and bronze for the podium. */
const PODIUM = [
  "bg-sun text-ink",
  "bg-[#dfe3ee] text-ink",
  "bg-[#f3c9a8] text-ink",
] as const;

export function PlaceBadge({ place }: { place: number | null }) {
  const podium = place !== null && place <= 3 ? PODIUM[place - 1] : "bg-canvas text-ink-muted ring-1 ring-line";
  return (
    <span
      className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-extrabold tabular-nums ${podium}`}
      aria-label={place === null ? "Место не определено" : `${place}-е место`}
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
  if (teams.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">
        Команд пока нет.
      </p>
    );
  }

  return (
    <ol className="space-y-2" aria-label="Таблица мест">
      {standings(teams).map((team) => {
        const progress = teamProgress(route, team.position);
        const color = teamColor(teams, team.id) ?? "#635BFF";
        const own = team.id === ownTeamId;
        const share = detailed ? accuracy(team.stats) : null;
        return (
          <li
            key={team.id}
            className={`flex min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5 ring-1 ${own ? "bg-brand-soft ring-brand/40" : "ring-line"}`}
          >
            <PlaceBadge place={team.place} />
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-center gap-2 font-bold">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                <span className="truncate" title={team.name}>
                  {team.name}
                </span>
                {own && <span className="shrink-0 text-xs font-bold text-brand-strong">· вы</span>}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {progress?.finished
                  ? team.finishOrder
                    ? `Финиш · ${team.finishOrder}-я команда`
                    : "Финиш"
                  : progress
                    ? pointLabel(progress.current)
                    : "—"}
                {detailed && team.stats && (
                  <>
                    {" · "}
                    <span className="text-teal-strong">верно {team.stats.correct}</span>
                    {" · "}
                    <span className="text-danger">неверно {team.stats.wrong}</span>
                    {share !== null && ` · точность ${share}%`}
                  </>
                )}
              </p>
            </div>
            <p className="shrink-0 text-right">
              <span className="block font-display text-lg leading-none font-bold tabular-nums">{team.score}</span>
              <span className="text-xs text-ink-muted">очков</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
