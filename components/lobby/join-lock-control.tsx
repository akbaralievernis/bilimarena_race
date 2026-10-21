"use client";

import { setJoinLockedAction } from "@/app/race/[raceId]/lobby/actions";
import { useI18n } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import type { LobbyRace } from "@/lib/race/lobby";
import type { ActionRunner } from "./use-action-runner";

/** Stage 11: the teacher closes joining once the class is in, so a forwarded code is useless. */
export function JoinLockControl({ race, runner }: { race: LobbyRace; runner: ActionRunner }) {
  const { m } = useI18n();
  const closed = race.joinLocked;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className={`flex items-center gap-2 font-bold ${closed ? "text-danger" : "text-teal-strong"}`} role="status">
          <span className={`size-2.5 shrink-0 rounded-full ${closed ? "bg-danger" : "bg-teal"}`} aria-hidden="true" />
          {closed ? m.lobby.joinClosed : m.lobby.joinOpen}
        </p>
        <p className="mt-1 text-sm text-ink-muted">{m.lobby.joinHint}</p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="shrink-0"
        pending={runner.isPending("join-lock")}
        onClick={() => runner.run("join-lock", () => setJoinLockedAction(race.id, !closed))}
      >
        {closed ? m.lobby.openJoin : m.lobby.closeJoin}
      </Button>
      {runner.errorFor("join-lock") && <p className="text-sm font-semibold text-danger">{runner.errorFor("join-lock")}</p>}
    </div>
  );
}
