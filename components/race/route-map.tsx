import type { LobbyTeam, RoutePoint } from "@/lib/race/lobby";
import { teamColor } from "@/lib/race/lobby";
import { pointLabel, teamsAt } from "@/lib/race/route";

type MarkerState = "passed" | "here" | "next" | "ahead";

function Check() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-5">
      <path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Flag() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-5">
      <path d="M5 17V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 3.5h10v7H5z" fill="currentColor" opacity="0.25" />
      <path d="M5 3.5h3.3v3.5H5zm6.7 0H15V7h-3.3zM8.3 7h3.4v3.5H8.3z" fill="currentColor" />
    </svg>
  );
}

function Marker({ point, state }: { point: RoutePoint; state: MarkerState }) {
  const base = "relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-extrabold transition";
  const ring = state === "next" ? " ring-4 ring-brand/25" : "";

  if (point.type === "finish") {
    return (
      <span className={`${base} ${state === "here" || state === "passed" ? "bg-teal text-white" : "bg-ink text-white"}${ring}`}>
        {state === "here" ? <Check /> : <Flag />}
      </span>
    );
  }
  if (state === "passed" || (state === "here" && point.type === "start")) {
    return (
      <span className={`${base} ${state === "passed" ? "bg-teal text-white" : "bg-teal-soft text-teal-strong ring-2 ring-teal"}`}>
        {state === "passed" ? <Check /> : "С"}
      </span>
    );
  }
  if (point.type === "start") {
    return <span className={`${base} bg-teal-soft text-teal-strong ring-2 ring-teal/60${ring}`}>С</span>;
  }
  return (
    <span
      className={`${base} ${
        state === "here" ? "bg-brand text-white shadow-brand" : "bg-surface text-brand-strong ring-2 ring-brand/40"
      }${ring}`}
    >
      {point.position}
    </span>
  );
}

function TeamChip({ team, teams, own }: { team: LobbyTeam; teams: LobbyTeam[]; own: boolean }) {
  return (
    <li
      className={`animate-pop-in inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ${
        own ? "bg-brand-soft text-brand-strong ring-brand/30" : "bg-surface ring-line"
      }`}
    >
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: teamColor(teams, team.id) ?? undefined }} aria-hidden="true" />
      <span className="truncate">{team.name}</span>
      {own && <span className="shrink-0 text-xs font-bold">· ваша</span>}
    </li>
  );
}

/**
 * The race map: START → checkpoints → FINISH, with every team standing on its
 * point. `ownTeamId` highlights the viewer's team and its progress.
 */
export function RouteMap({
  route,
  teams,
  ownTeamId = null,
}: {
  route: RoutePoint[];
  teams: LobbyTeam[];
  ownTeamId?: string | null;
}) {
  const own = teams.find((team) => team.id === ownTeamId) ?? null;

  return (
    <ol aria-label="Маршрут гонки">
      {route.map((point, index) => {
        const here = teamsAt(teams, point.position);
        const state: MarkerState = !own
          ? "ahead"
          : point.position < own.position
            ? "passed"
            : point.position === own.position
              ? "here"
              : point.position === own.position + 1
                ? "next"
                : "ahead";
        const last = index === route.length - 1;

        return (
          <li key={point.position} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && (
              <span
                aria-hidden="true"
                className={`absolute top-11 bottom-0 left-[21px] w-0.5 ${
                  own && point.position < own.position ? "bg-teal" : "bg-line"
                }`}
              />
            )}
            <Marker point={point} state={state} />
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-xs font-extrabold tracking-wider text-ink-muted uppercase">
                {pointLabel(point)}
                {state === "next" && <span className="text-brand-strong"> · следующий</span>}
              </p>
              {point.type === "checkpoint" && <p className="font-bold break-words">{point.title}</p>}
              {point.task ? (
                <p className="mt-1 line-clamp-2 text-sm break-words text-ink-muted" title={point.task.question}>
                  <span className="font-semibold text-brand-strong">
                    {point.task.type === "single_choice" ? "Выбор ответа" : "Короткий ответ"}:
                  </span>{" "}
                  {point.task.question}
                </p>
              ) : (
                point.hasTask && (
                  <span className="mt-1 inline-flex rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand-strong">
                    Задание
                  </span>
                )
              )}
              {here.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Команды: ${pointLabel(point)}`}>
                  {here.map((team) => (
                    <TeamChip key={`${team.id}-${team.position}`} team={team} teams={teams} own={team.id === ownTeamId} />
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
