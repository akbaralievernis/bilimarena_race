"use client";

import { ConnectionBanner, ConnectionPill } from "@/components/lobby/connection-status";
import { RaceStatusControl } from "@/components/lobby/race-status-control";
import { StatusBadge } from "@/components/lobby/status-badge";
import { useActionRunner } from "@/components/lobby/use-action-runner";
import type { ConnectionState } from "@/components/lobby/use-lobby";
import { ButtonLink } from "@/components/ui/button-link";
import { teamColor, type LobbySnapshot } from "@/lib/race/lobby";
import { checkpointCount, pointName, teamProgress } from "@/lib/race/route";
import type { RaceStatus } from "@/lib/race/status";
import { RouteMap } from "./route-map";

const STATUS_HINTS: Record<RaceStatus, string> = {
  draft: "Гонка ещё не открыта.",
  lobby: "Гонка ещё не началась — все команды на старте.",
  running: "Команды проходят чекпоинты — карта обновляется сама.",
  finished: "Гонка завершена.",
};

export function TeacherRace({
  lobby,
  connection,
  refresh,
}: {
  lobby: LobbySnapshot;
  connection: ConnectionState;
  refresh: () => Promise<void>;
}) {
  const runner = useActionRunner(refresh);
  const { race, route, teams } = lobby;

  return (
    <div className="space-y-6">
      <ConnectionBanner state={connection} />

      <section className="rounded-card bg-surface p-5 shadow-card ring-1 ring-line sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={race.status} />
            <ConnectionPill state={connection} />
          </div>
          <ButtonLink href={`/race/${race.id}/lobby`} variant="secondary" size="sm">
            Лобби: команды и участники
          </ButtonLink>
        </div>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight break-words sm:text-3xl">{race.title}</h1>
        <div className="mt-6 border-t border-line pt-6">
          <RaceStatusControl race={race} runner={runner} hint={STATUS_HINTS[race.status]} />
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section aria-labelledby="map-heading" className="rounded-card bg-surface p-5 shadow-card ring-1 ring-line sm:p-6">
          <h2 id="map-heading" className="font-display text-lg font-bold tracking-tight">
            Карта гонки
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Чекпоинтов: {checkpointCount(route)}</p>
          <div className="mt-5">
            <RouteMap route={route} teams={teams} />
          </div>
        </section>

        <section aria-labelledby="teams-progress" className="rounded-card bg-surface p-5 shadow-card ring-1 ring-line sm:p-6">
          <h2 id="teams-progress" className="font-display text-lg font-bold tracking-tight">
            Команды
          </h2>
          {teams.length === 0 ? (
            <p className="mt-4 rounded-2xl border-2 border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">
              Команд пока нет — создайте их в лобби.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {teams.map((team) => {
                const progress = teamProgress(route, team.position);
                const color = teamColor(teams, team.id) ?? "#635BFF";
                return (
                  <li key={team.id} className="rounded-2xl p-4 ring-1 ring-line">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate font-bold" title={team.name}>
                        {team.name}
                      </span>
                      {progress?.finished && (
                        <span className="shrink-0 rounded-full bg-teal-soft px-2.5 py-0.5 text-xs font-bold text-teal-strong">
                          Финиш
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">
                      {progress ? (progress.finished ? "Прошла весь маршрут" : pointName(progress.current)) : "—"}
                    </p>
                    <div
                      className="mt-3 h-2 overflow-hidden rounded-full bg-canvas ring-1 ring-line"
                      role="progressbar"
                      aria-label={`Прогресс команды ${team.name}`}
                      aria-valuemin={0}
                      aria-valuemax={route.length - 1}
                      aria-valuenow={team.position}
                    >
                      <div
                        className="h-full rounded-full transition-[width] duration-500"
                        style={{ width: `${(progress?.ratio ?? 0) * 100}%`, backgroundColor: color }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
