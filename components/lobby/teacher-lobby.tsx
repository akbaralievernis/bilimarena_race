"use client";

import { useState } from "react";
import { finishRaceAction, startRaceAction } from "@/app/race/[raceId]/lobby/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { canTransition, type RaceStatus } from "@/lib/race/status";
import type { LobbySnapshot } from "@/lib/race/lobby";
import { ConnectionBanner, ConnectionPill } from "./connection-status";
import { ParticipantsPanel } from "./participants-panel";
import { RoomCode } from "./room-code";
import { StatusBadge } from "./status-badge";
import { TeamsPanel } from "./teams-panel";
import type { ConnectionState } from "./use-lobby";
import { useActionRunner } from "./use-action-runner";

const STATUS_HINTS: Record<RaceStatus, string> = {
  draft: "Гонка ещё не открыта для подключения.",
  lobby: "Когда все подключатся и команды будут готовы — начинайте гонку.",
  running: "Гонка идёт. Карта и задания появятся на следующем этапе разработки.",
  finished: "Гонка завершена. Изменения больше недоступны.",
};

type StatusAction = { to: "running" | "finished"; label: string; confirm: string; pendingLabel: string };

const STATUS_ACTIONS: StatusAction[] = [
  { to: "running", label: "Начать гонку", confirm: "Начать? Вернуться в лобби будет нельзя.", pendingLabel: "Запуск…" },
  { to: "finished", label: "Завершить гонку", confirm: "Завершить гонку для всех?", pendingLabel: "Завершение…" },
];

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
  const [confirming, setConfirming] = useState<StatusAction["to"] | null>(null);
  const { race } = lobby;
  const locked = race.status === "finished";
  const unassigned = lobby.participants.filter((participant) => !participant.teamId).length;

  // "Start" is the main action in the lobby; "finish" is offered once running.
  const action = STATUS_ACTIONS.find(
    (candidate) => canTransition(race.status, candidate.to) && (race.status !== "lobby" || candidate.to === "running"),
  );

  async function changeStatus(target: StatusAction) {
    const ok = await runner.run("status", () =>
      target.to === "running" ? startRaceAction(race.id) : finishRaceAction(race.id),
    );
    if (ok) setConfirming(null);
  }

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

        <div className="mt-6 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-muted">{STATUS_HINTS[race.status]}</p>
          {action &&
            (confirming === action.to ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="text-sm font-bold">{action.confirm}</span>
                <div className="flex gap-2">
                  <Button
                    className="flex-1 sm:flex-none"
                    variant={action.to === "running" ? "primary" : "secondary"}
                    pending={runner.isPending("status")}
                    pendingLabel={action.pendingLabel}
                    onClick={() => changeStatus(action)}
                  >
                    Да
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1 sm:flex-none"
                    disabled={runner.isPending("status")}
                    onClick={() => setConfirming(null)}
                  >
                    Отмена
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant={action.to === "running" ? "primary" : "secondary"}
                className="w-full sm:w-auto"
                onClick={() => {
                  runner.clearError("status");
                  setConfirming(action.to);
                }}
              >
                {action.label}
              </Button>
            ))}
        </div>
        {runner.errorFor("status") && <Alert className="mt-4">{runner.errorFor("status")}</Alert>}
      </section>

      {/* grid-cols-1 = minmax(0, 1fr): truncated names must not widen the column. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <TeamsPanel lobby={lobby} runner={runner} locked={locked} />
        <ParticipantsPanel lobby={lobby} runner={runner} locked={locked} />
      </div>
    </div>
  );
}
