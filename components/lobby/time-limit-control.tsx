"use client";

import { setTimeLimitAction } from "@/app/race/[raceId]/lobby/actions";
import { useI18n } from "@/components/i18n/i18n-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { LobbyRace } from "@/lib/race/lobby";
import { TIME_LIMIT_MINUTES, extendedLimit, minutesLabel } from "@/lib/race/timer";
import type { ActionRunner } from "./use-action-runner";

/**
 * Stage 7: the teacher's race timer. Before the start — choose a limit (or
 * none); while running — "+5 минут". The database checks and applies it.
 */
export function TimeLimitControl({ race, runner }: { race: LobbyRace; runner: ActionRunner }) {
  const { m } = useI18n();
  const pending = runner.isPending("time-limit");
  const error = runner.errorFor("time-limit");
  const set = (seconds: number | null) => runner.run("time-limit", () => setTimeLimitAction(race.id, seconds));

  if (race.status === "finished") return null;

  if (race.status === "running") {
    if (race.timeLimitSeconds === null) return null;
    const next = extendedLimit(race.timeLimitSeconds);
    return (
      <div className="flex flex-col items-start gap-2">
        <Button variant="secondary" size="sm" disabled={next === null} pending={pending} pendingLabel={m.timer.extending} onClick={() => next && set(next)}>
          {m.timer.extend}
        </Button>
        {error && <Alert>{error}</Alert>}
      </div>
    );
  }

  const options: (number | null)[] = [null, ...TIME_LIMIT_MINUTES.map((minutes) => minutes * 60)];
  // A limit set earlier that is not in the list (e.g. after "+5 минут") stays selectable.
  if (race.timeLimitSeconds !== null && !options.includes(race.timeLimitSeconds)) options.push(race.timeLimitSeconds);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="race-time-limit" className="text-sm font-bold">
        {m.timer.label}
      </label>
      <select
        id="race-time-limit"
        value={race.timeLimitSeconds ?? ""}
        disabled={pending}
        onChange={(event) => set(event.target.value === "" ? null : Number(event.target.value))}
        className="min-h-11 w-full rounded-xl bg-surface px-3 text-sm font-semibold ring-1 ring-line focus-visible:ring-2 focus-visible:ring-brand sm:w-60"
      >
        {options.map((seconds) => (
          <option key={seconds ?? "none"} value={seconds ?? ""}>
            {seconds === null ? m.timer.none : minutesLabel(seconds, m)}
          </option>
        ))}
      </select>
      <p className="text-xs text-ink-muted">
        {race.timeLimitSeconds === null
          ? m.timer.noLimitHint
          : m.timer.limitHint}
      </p>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
