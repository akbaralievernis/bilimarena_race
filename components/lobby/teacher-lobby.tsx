"use client";

import { RouteStrip } from "@/components/race/route-strip";
import { ButtonLink } from "@/components/ui/button-link";
import type { LobbySnapshot } from "@/lib/race/lobby";
import type { RaceStatus } from "@/lib/race/status";
import { ConnectionBanner, ConnectionPill } from "./connection-status";
import { ParticipantsPanel } from "./participants-panel";
import { RaceStatusControl } from "./race-status-control";
import { RoomCode } from "./room-code";
import { StatusBadge } from "./status-badge";
import { TeamsPanel } from "./teams-panel";
import type { ConnectionState } from "./use-lobby";
import { useActionRunner } from "./use-action-runner";

const STATUS_HINTS: Record<RaceStatus, string> = {
  draft: "Гонка ещё не открыта для подключения.",
  lobby: "Когда все подключатся и команды будут готовы — начинайте гонку.",
  running: "Гонка идёт — положение команд видно на карте гонки.",
  finished: "Гонка завершена. Изменения больше недоступны.",
};

export function TeacherLobby({
  lobby,
  connection,
  refresh,
}: {
  lobby: LobbySnapshot;
  connection: ConnectionState;
  refresh: () => Promise<void>;
}) {
  const runner = useActionRunner(refresh);
  const { race } = lobby;
  const locked = race.status === "finished";
  const unassigned = lobby.participants.filter((participant) => !participant.teamId).length;

  return (
    <div className="space-y-6">
      <ConnectionBanner state={connection} />

      <section className="rounded-card bg-surface p-5 shadow-card ring-1 ring-line sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={race.status} />
              <ConnectionPill state={connection} />
            </div>
            <h1 className="mt-3 font-display text-2xl font-bold tracking-tight break-words sm:text-3xl">{race.title}</h1>
            {race.description && (
              <p className="mt-2 max-w-2xl whitespace-pre-line text-ink-muted">{race.description}</p>
            )}
            <dl className="mt-6 grid grid-cols-3 gap-3 sm:max-w-md">
              {[
                ["Участники", lobby.studentCount],
                ["Команды", lobby.teams.length],
                ["Без команды", unassigned],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-canvas px-3 py-3 ring-1 ring-line">
                  <dt className="text-xs font-bold text-ink-muted">{label}</dt>
                  <dd className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <RoomCode code={race.code} />
        </div>

        <div className="mt-6 border-t border-line pt-6">
          <RaceStatusControl race={race} runner={runner} hint={STATUS_HINTS[race.status]} />
        </div>
      </section>

      <section aria-labelledby="route-heading" className="rounded-card bg-surface p-5 shadow-card ring-1 ring-line sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="route-heading" className="font-display text-lg font-bold tracking-tight">
            Маршрут
          </h2>
          <ButtonLink href={`/race/${race.id}`} variant="secondary" size="sm">
            Карта гонки
          </ButtonLink>
        </div>
        <div className="mt-4">
          <RouteStrip route={lobby.route} />
        </div>
      </section>

      {/* grid-cols-1 = minmax(0, 1fr): truncated names must not widen the column. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <TeamsPanel lobby={lobby} runner={runner} locked={locked} />
        <ParticipantsPanel lobby={lobby} runner={runner} locked={locked} />
      </div>
    </div>
  );
}
