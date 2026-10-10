"use client";

import { useState } from "react";
import { finishRaceAction, startRaceAction } from "@/app/race/[raceId]/lobby/actions";
import { useI18n } from "@/components/i18n/i18n-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { LobbyRace } from "@/lib/race/lobby";
import { canTransition } from "@/lib/race/status";
import type { ActionRunner } from "./use-action-runner";

type StatusAction = { to: "running" | "finished"; label: string; confirm: string; pendingLabel: string };

/**
 * Teacher's start / finish control with an inline confirmation step. Used in
 * the lobby and on the race screen; start_race / finish_race decide on the server.
 */
export function RaceStatusControl({ race, runner, hint }: { race: LobbyRace; runner: ActionRunner; hint: string }) {
  const [confirming, setConfirming] = useState<StatusAction["to"] | null>(null);
  const { m } = useI18n();
  const t = m.statusControl;
  const actions: StatusAction[] = [
    { to: "running", label: t.start, confirm: t.startConfirm, pendingLabel: t.starting },
    { to: "finished", label: t.finish, confirm: t.finishConfirm, pendingLabel: t.finishing },
  ];

  // "Start" is the main action in the lobby; "finish" is offered once running.
  const action = actions.find(
    (candidate) => canTransition(race.status, candidate.to) && (race.status !== "lobby" || candidate.to === "running"),
  );

  async function changeStatus(target: StatusAction) {
    const ok = await runner.run("status", () =>
      target.to === "running" ? startRaceAction(race.id) : finishRaceAction(race.id),
    );
    if (ok) setConfirming(null);
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-muted">{hint}</p>
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
                  {m.common.yes}
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1 sm:flex-none"
                  disabled={runner.isPending("status")}
                  onClick={() => setConfirming(null)}
                >
                  {m.common.cancel}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant={action.to === "running" ? "primary" : "secondary"}
              className="w-full shrink-0 sm:w-auto"
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
    </>
  );
}
