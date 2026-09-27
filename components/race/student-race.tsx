"use client";

import { advanceTeamAction } from "@/app/race/[raceId]/actions";
import { ConnectionBanner, ConnectionPill } from "@/components/lobby/connection-status";
import { StatusBadge } from "@/components/lobby/status-badge";
import { useActionRunner } from "@/components/lobby/use-action-runner";
import type { ConnectionState } from "@/components/lobby/use-lobby";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { teamColor, type LobbySnapshot, type RoutePoint } from "@/lib/race/lobby";
import { pointLabel, teamProgress } from "@/lib/race/route";
import { RouteMap } from "./route-map";

function PointCard({ caption, point, tone }: { caption: string; point: RoutePoint; tone: "now" | "next" }) {
  return (
    <div className={`min-w-0 rounded-2xl px-4 py-3 ${tone === "next" ? "bg-brand-soft" : "bg-canvas ring-1 ring-line"}`}>
      <dt className="text-xs font-bold text-ink-muted">{caption}</dt>
      <dd className="mt-1">
        <span className={`block text-lg font-extrabold ${tone === "next" ? "text-brand-strong" : ""}`}>
          {pointLabel(point)}
        </span>
        {point.type === "checkpoint" && <span className="mt-0.5 block text-sm break-words">{point.title}</span>}
      </dd>
    </div>
  );
}

function buttonLabel(status: string, next: RoutePoint) {
  if (status === "lobby" || status === "draft") return "Ждём старта гонки";
  if (status === "finished") return "Гонка завершена";
  return next.type === "finish" ? "Финишировать" : `Пройти чекпоинт ${next.position}`;
}

export function StudentRace({
  lobby,
  connection,
  refresh,
}: {
  lobby: LobbySnapshot;
  connection: ConnectionState;
  refresh: () => Promise<void>;
}) {
  const runner = useActionRunner(refresh);
  const { race, route, teams, viewer } = lobby;
  const team = teams.find((candidate) => candidate.id === viewer.teamId) ?? null;
  const progress = team ? teamProgress(route, team.position) : null;
  const color = teamColor(teams, viewer.teamId);

  async function advance() {
    if (!team || !progress?.next) return;
    // Always ask for exactly the next point; the server re-checks everything.
    const target = progress.next.position;
    const ok = await runner.run("advance", () => advanceTeamAction(team.id, target));
    // A teammate may have moved first: re-read the map either way.
    if (!ok) void refresh();
  }

  return (
    <div className="space-y-4">
      <ConnectionBanner state={connection} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <StatusBadge status={race.status} />
            <ConnectionPill state={connection} />
          </div>
          <p className="mt-5 text-sm font-bold text-teal-strong">Bilim Arena Race</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight break-words sm:text-3xl">{race.title}</h1>

          {!team || !progress ? (
            <div className="mt-6 rounded-2xl border-2 border-dashed border-line px-5 py-4">
              <p className="font-bold">Команда пока не назначена</p>
              <p className="mt-1 text-sm text-ink-muted">Учитель добавит вас в команду, а карта гонки уже открыта.</p>
            </div>
          ) : (
            <>
              <div className="mt-6 rounded-2xl px-5 py-4" style={{ boxShadow: `inset 0 0 0 2px ${color ?? "#E4E7F0"}` }}>
                <p className="text-sm font-semibold text-ink-muted">Твоя команда:</p>
                <p className="mt-1 flex items-center gap-2.5 font-display text-xl font-bold break-words">
                  <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: color ?? undefined }} aria-hidden="true" />
                  {team.name}
                </p>
              </div>

              {progress.finished ? (
                <div key="finished" className="animate-pop-in mt-4 rounded-2xl bg-teal-soft px-5 py-6 text-center" role="status">
                  <svg viewBox="0 0 20 20" aria-hidden="true" className="mx-auto size-10 text-teal-strong">
                    <path d="M5 17V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M5 3.5h3.3v3.5H5zm6.7 0H15V7h-3.3zM8.3 7h3.4v3.5H8.3z" fill="currentColor" />
                  </svg>
                  <p className="mt-2 font-display text-2xl font-bold text-teal-strong">Финиш!</p>
                  <p className="mt-1 text-sm">Ваша команда прошла маршрут.</p>
                </div>
              ) : (
                <>
                  <dl key={team.position} className="animate-pop-in mt-4 grid grid-cols-2 gap-3">
                    <PointCard caption="Сейчас" point={progress.current} tone="now" />
                    {progress.next && <PointCard caption="Дальше" point={progress.next} tone="next" />}
                  </dl>
                  {progress.next && (
                    <Button
                      className="mt-5 w-full"
                      disabled={race.status !== "running"}
                      pending={runner.isPending("advance")}
                      pendingLabel="Проходим…"
                      onClick={advance}
                    >
                      {buttonLabel(race.status, progress.next)}
                    </Button>
                  )}
                  <p className="mt-2 text-center text-xs text-ink-muted">
                    Пока чекпоинт проходится кнопкой — задания появятся на следующих этапах.
                  </p>
                </>
              )}
              {runner.errorFor("advance") && <Alert className="mt-4">{runner.errorFor("advance")}</Alert>}
            </>
          )}
        </section>

        <section aria-labelledby="map-heading" className="rounded-card bg-surface p-5 shadow-card ring-1 ring-line sm:p-6">
          <h2 id="map-heading" className="font-display text-lg font-bold tracking-tight">
            Карта гонки
          </h2>
          <div className="mt-5">
            <RouteMap route={route} teams={teams} ownTeamId={team?.id ?? null} />
          </div>
        </section>
      </div>
    </div>
  );
}
