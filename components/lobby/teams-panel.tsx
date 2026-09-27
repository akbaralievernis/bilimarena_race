"use client";

import { useState, type FormEvent } from "react";
import { createTeamAction, deleteTeamAction, renameTeamAction } from "@/app/race/[raceId]/lobby/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PARTICIPANT_FORMS, plural } from "@/lib/format";
import { teamColor, type LobbySnapshot, type LobbyTeam } from "@/lib/race/lobby";
import { LIMITS, validateTeamName } from "@/lib/race/validation";
import type { ActionRunner } from "./use-action-runner";

const inputClass =
  "min-h-11 w-full min-w-0 rounded-xl bg-surface px-3.5 text-base ring-1 ring-line transition " +
  "placeholder:text-ink-muted/70 hover:ring-brand/40 focus:ring-2 focus:ring-brand focus:outline-none disabled:bg-canvas";

export function TeamsPanel({ lobby, runner, locked }: { lobby: LobbySnapshot; runner: ActionRunner; locked: boolean }) {
  const [name, setName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const creating = runner.isPending("create-team");

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const team = validateTeamName(name);
    if (!team.ok) {
      setLocalError(team.error);
      return;
    }
    setLocalError(null);
    if (await runner.run("create-team", () => createTeamAction(lobby.race.id, team.value))) setName("");
  }

  const createError = localError ?? runner.errorFor("create-team");

  return (
    <section aria-labelledby="teams-heading" className="rounded-card bg-surface p-5 shadow-card ring-1 ring-line sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="teams-heading" className="font-display text-lg font-bold tracking-tight">
          Команды
        </h2>
        <span className="text-sm font-semibold text-ink-muted">{lobby.teams.length} / 20</span>
      </div>

      {!locked && (
        <form onSubmit={createTeam} className="mt-4 flex gap-2" noValidate>
          <label htmlFor="new-team" className="sr-only">
            Название новой команды
          </label>
          <input
            id="new-team"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Название команды"
            maxLength={LIMITS.teamName.max}
            autoComplete="off"
            disabled={creating}
            aria-invalid={createError ? true : undefined}
            className={inputClass}
          />
          <Button type="submit" size="sm" className="min-h-11 shrink-0" pending={creating}>
            Добавить
          </Button>
        </form>
      )}
      {createError && <Alert className="mt-3">{createError}</Alert>}

      {lobby.teams.length === 0 ? (
        <p className="mt-5 rounded-2xl border-2 border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">
          Команд пока нет. Создайте, например, «Альфа» и «Бета».
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {lobby.teams.map((team) => (
            <TeamCard key={team.id} team={team} lobby={lobby} runner={runner} locked={locked} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TeamCard({
  team,
  lobby,
  runner,
  locked,
}: {
  team: LobbyTeam;
  lobby: LobbySnapshot;
  runner: ActionRunner;
  locked: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(team.name);
  const [localError, setLocalError] = useState<string | null>(null);
  const members = lobby.participants.filter((participant) => participant.teamId === team.id);
  const color = teamColor(lobby.teams, team.id) ?? "#635BFF";
  const renameKey = `rename:${team.id}`;
  const deleteKey = `delete:${team.id}`;
  const error = localError ?? runner.errorFor(renameKey) ?? runner.errorFor(deleteKey);

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validateTeamName(draft);
    if (!next.ok) {
      setLocalError(next.error);
      return;
    }
    setLocalError(null);
    if (next.value === team.name || (await runner.run(renameKey, () => renameTeamAction(team.id, next.value)))) {
      setEditing(false);
    }
  }

  return (
    <li className="animate-pop-in rounded-2xl p-4 ring-1 ring-line">
      <div className="flex min-w-0 items-center gap-3">
        <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
        {editing ? (
          <form onSubmit={rename} className="flex min-w-0 flex-1 flex-wrap gap-2" noValidate>
            <label htmlFor={`team-name-${team.id}`} className="sr-only">
              Новое название команды
            </label>
            <input
              id={`team-name-${team.id}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={LIMITS.teamName.max}
              autoComplete="off"
              autoFocus
              className={`${inputClass} flex-1 basis-40`}
            />
            <div className="flex gap-1">
              <Button type="submit" size="sm" pending={runner.isPending(renameKey)}>
                Сохранить
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setDraft(team.name);
                  setLocalError(null);
                  runner.clearError(renameKey);
                }}
              >
                Отмена
              </Button>
            </div>
          </form>
        ) : (
          <>
            <h3 className="min-w-0 flex-1 truncate font-bold" title={team.name}>
              {team.name}
            </h3>
            <span className="shrink-0 text-sm text-ink-muted">
              {team.memberCount} {plural(team.memberCount, PARTICIPANT_FORMS)}
            </span>
          </>
        )}
      </div>

      {members.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {members.map((member) => (
            <li key={member.id} className="rounded-full bg-canvas px-3 py-1 text-sm font-semibold ring-1 ring-line">
              {member.displayName}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">Пока никого нет.</p>
      )}

      {!locked && !editing && (
        <div className="mt-3 flex flex-wrap gap-1 border-t border-line pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(team.name); // the name may have changed via realtime
              setEditing(true);
            }}
          >
            Переименовать
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={team.memberCount > 0}
            title={team.memberCount > 0 ? "Сначала уберите участников из команды" : undefined}
            pending={runner.isPending(deleteKey)}
            onClick={() => runner.run(deleteKey, () => deleteTeamAction(team.id))}
          >
            Удалить
          </Button>
        </div>
      )}
      {error && <Alert className="mt-3">{error}</Alert>}
    </li>
  );
}
