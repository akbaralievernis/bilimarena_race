"use client";

import { assignParticipantAction } from "@/app/race/[raceId]/lobby/actions";
import { Spinner } from "@/components/ui/spinner";
import { teamColor, type LobbyParticipant, type LobbySnapshot } from "@/lib/race/lobby";
import type { ActionRunner } from "./use-action-runner";

export function ParticipantsPanel({
  lobby,
  runner,
  locked,
}: {
  lobby: LobbySnapshot;
  runner: ActionRunner;
  locked: boolean;
}) {
  return (
    <section
      aria-labelledby="participants-heading"
      className="rounded-card bg-surface p-5 shadow-card ring-1 ring-line sm:p-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="participants-heading" className="font-display text-lg font-bold tracking-tight">
          Участники
        </h2>
        <span className="text-sm font-semibold text-ink-muted">{lobby.studentCount}</span>
      </div>

      {lobby.participants.length === 0 ? (
        <p className="mt-5 rounded-2xl border-2 border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">
          Пока никто не подключился. Студенты открывают «Подключиться к гонке» и вводят код комнаты — они появятся здесь
          сразу.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {lobby.participants.map((participant) => (
            <ParticipantRow
              key={participant.id}
              participant={participant}
              lobby={lobby}
              runner={runner}
              locked={locked}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ParticipantRow({
  participant,
  lobby,
  runner,
  locked,
}: {
  participant: LobbyParticipant;
  lobby: LobbySnapshot;
  runner: ActionRunner;
  locked: boolean;
}) {
  const key = `assign:${participant.id}`;
  const pending = runner.isPending(key);
  const error = runner.errorFor(key);
  const color = teamColor(lobby.teams, participant.teamId);
  const selectId = `team-for-${participant.id}`;

  return (
    <li className="animate-pop-in py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ backgroundColor: color ?? "#5A6480" }}
          aria-hidden="true"
        >
          {[...participant.displayName][0]?.toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 basis-32 truncate font-semibold" title={participant.displayName}>
          {participant.displayName}
        </span>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <label htmlFor={selectId} className="sr-only">
            Команда для {participant.displayName}
          </label>
          <select
            id={selectId}
            value={participant.teamId ?? ""}
            disabled={locked || pending || lobby.teams.length === 0}
            onChange={(event) =>
              runner.run(key, () => assignParticipantAction(participant.id, event.target.value || null))
            }
            className={`min-h-10 w-full rounded-xl bg-surface px-3 text-sm font-semibold ring-1 ring-line transition hover:ring-brand/40 focus:ring-2 focus:ring-brand focus:outline-none disabled:cursor-not-allowed disabled:bg-canvas sm:w-48 ${
              participant.teamId ? "text-ink" : "text-ink-muted"
            }`}
          >
            <option value="">{lobby.teams.length === 0 ? "Сначала создайте команду" : "Без команды"}</option>
            {lobby.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          {pending && <Spinner className="size-4 shrink-0 text-brand" />}
        </div>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-danger">{error}</p>}
    </li>
  );
}
