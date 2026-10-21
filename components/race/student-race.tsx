"use client";

import { useRef, useState } from "react";
import { advanceTeamAction, submitAnswerAction } from "@/app/race/[raceId]/actions";
import { ConnectionBanner, ConnectionPill } from "@/components/lobby/connection-status";
import { StatusBadge } from "@/components/lobby/status-badge";
import { useActionRunner } from "@/components/lobby/use-action-runner";
import type { ConnectionState } from "@/components/lobby/use-lobby";
import { useI18n } from "@/components/i18n/i18n-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Messages } from "@/lib/i18n/config";
import { clientErrorMessage } from "@/lib/race/errors";
import { teamColor, type LobbySnapshot, type RoutePoint } from "@/lib/race/lobby";
import { gaps } from "@/lib/race/events";
import { checkpointCount, pointLabel, teamProgress } from "@/lib/race/route";
import { SCORING, formatPoints, rulesSummary } from "@/lib/race/scoring";
import { Leaderboard } from "./leaderboard";
import { RaceClock } from "./race-clock";
import { AnimatedScore, Confetti, GoOverlay, LiveToast, useRaceEvents } from "./race-fx";
import { RaceTrack } from "./race-track";
import { TaskCard } from "./task-card";
import { useRaceClock } from "./use-race-clock";

type Feedback = { tone: "success" | "error" | "info"; text: string };

function PointCard({ caption, point, tone }: { caption: string; point: RoutePoint; tone: "now" | "next" }) {
  const { m } = useI18n();
  return (
    <div className={`min-w-0 rounded-2xl px-4 py-3 ${tone === "next" ? "bg-brand-soft" : "bg-canvas ring-1 ring-line"}`}>
      <dt className="text-xs font-bold text-ink-muted">{caption}</dt>
      <dd className="mt-1">
        <span className={`block text-lg font-extrabold ${tone === "next" ? "text-brand-strong" : ""}`}>
          {pointLabel(point, m)}
        </span>
        {point.type === "checkpoint" && <span className="mt-0.5 block text-sm break-words">{point.title}</span>}
      </dd>
    </div>
  );
}

function legacyButtonLabel(status: string, next: RoutePoint, m: Messages) {
  if (status === "lobby" || status === "draft") return m.race.waitingStart;
  if (status === "finished") return m.race.finished;
  return next.type === "finish" ? m.race.finishAction : m.race.passCheckpoint(next.position);
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
  const { m } = useI18n();
  const answering = useRef(false);
  const [answerPending, setAnswerPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [burst, setBurst] = useState(0);
  const [tries, setTries] = useState(0);
  const events = useRaceEvents(lobby);

  const { race, route, teams, viewer, currentTask } = lobby;
  const secondsLeft = useRaceClock(race, refresh);
  const team = teams.find((candidate) => candidate.id === viewer.teamId) ?? null;
  const progress = team ? teamProgress(route, team.position) : null;
  const color = teamColor(teams, viewer.teamId);
  const total = checkpointCount(route);
  const passed = team ? Math.min(team.position, total) : 0;
  const nextHasTask = Boolean(progress?.next?.hasTask);
  const taskPoint = currentTask ? route[currentTask.checkpointPosition] : null;

  async function answer(value: string) {
    if (!team || !currentTask || answering.current) return;
    // Synchronous lock: a double click cannot send the answer twice.
    answering.current = true;
    setAnswerPending(true);
    setFeedback(null);
    setTries((n) => n + 1);
    try {
      const result = await submitAnswerAction(team.id, currentTask.id, value);
      if (!result.ok) setFeedback({ tone: "error", text: result.message });
      else if (result.alreadyPassed) {
        setFeedback({ tone: "info", text: m.race.alreadyPassed });
      } else if (result.correct) {
        const earned = m.race.earned(formatPoints(result.points), result.points);
        setBurst((n) => n + 1);
        setFeedback({
          tone: "success",
          text: result.finished
            ? m.race.rightFinished(earned)
            : m.race.rightPassed(earned, currentTask.checkpointPosition),
        });
      } else {
        setFeedback({
          tone: "error",
          text: m.race.wrong(formatPoints(result.points), result.points, result.cooldownSeconds || SCORING.pauseSeconds),
        });
      }
      await refresh();
    } catch (error) {
      setFeedback({ tone: "error", text: clientErrorMessage(error, m) });
    } finally {
      answering.current = false;
      setAnswerPending(false);
    }
  }

  async function advanceLegacy() {
    if (!team || !progress?.next) return;
    const target = progress.next.position;
    const ok = await runner.run("advance", () => advanceTeamAction(team.id, target));
    if (!ok) void refresh();
  }

  const gap = team ? gaps(teams, team.id) : null;
  const left = team ? Math.max(0, route.length - 1 - team.position) : 0;
  const running = race.status !== "lobby" && race.status !== "draft";

  return (
    <div className="space-y-4">
      <GoOverlay go={events.go} />
      <Confetti burst={burst + events.end} />
      <LiveToast feed={events.feed} ownTeamId={team?.id ?? null} />
      <ConnectionBanner state={connection} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StatusBadge status={race.status} />
            {secondsLeft !== null && <RaceClock seconds={secondsLeft} />}
            <ConnectionPill state={connection} />
          </div>
          <p className="mt-5 text-sm font-bold text-teal-strong">Bilim Arena Race</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight break-words sm:text-3xl">{race.title}</h1>

          {!team || !progress ? (
            <div className="mt-6 rounded-2xl border-2 border-dashed border-line px-5 py-4">
              <p className="font-bold">{m.race.noTeamTitle}</p>
              <p className="mt-1 text-sm text-ink-muted">{m.race.noTeamText}</p>
            </div>
          ) : (
            <>
              <div className="stage-night relative mt-6 overflow-hidden rounded-2xl px-5 py-5 text-white shadow-lift">
                <span
                  aria-hidden="true"
                  className="absolute -top-16 -right-10 size-44 rounded-full opacity-40 blur-2xl"
                  style={{ backgroundColor: color ?? "#E0162B" }}
                />
                <p className="relative text-sm font-semibold text-white/70">{m.race.yourTeam}</p>
                <p className="relative mt-1 flex items-center gap-2.5 font-display text-xl font-bold break-words">
                  <span className="size-3.5 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: color ?? undefined }} aria-hidden="true" />
                  {team.name}
                </p>
                {running && (
                  <dl className="relative mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/15">
                      <dt className="text-xs font-bold text-white/70">{m.race.teamPoints}</dt>
                      <dd className="font-display text-2xl font-bold">
                        <AnimatedScore value={team.score} />
                      </dd>
                    </div>
                    <div className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/15">
                      <dt className="text-xs font-bold text-white/70">{m.race.place}</dt>
                      <dd key={team.place ?? 0} className="animate-pop-in font-display text-2xl font-bold tabular-nums">
                        {team.place === 1 && <span aria-hidden="true">👑 </span>}
                        {team.place ?? "—"}
                        <span className="text-sm font-semibold text-white/70">{m.race.of(teams.length)}</span>
                      </dd>
                    </div>
                  </dl>
                )}
                {total > 0 && (
                  <div className="relative mt-4">
                    <div className="flex items-center justify-between gap-3 text-xs font-bold text-white/75">
                      <span>{m.race.passed(passed, total)}</span>
                      {!progress.finished && <span>{m.live.leftToFinish(left)}</span>}
                    </div>
                    <div
                      className="mt-2 h-3 overflow-hidden rounded-full bg-white/15"
                      role="progressbar"
                      aria-label={m.race.progressAria(team.name)}
                      aria-valuemin={0}
                      aria-valuemax={route.length - 1}
                      aria-valuenow={team.position}
                    >
                      <div
                        className="h-full rounded-full transition-[width] duration-700 ease-out"
                        style={{ width: `${progress.ratio * 100}%`, background: `linear-gradient(90deg, ${color ?? "#E0162B"}, #FFB547)` }}
                      />
                    </div>
                  </div>
                )}
                {running && gap && teams.length > 1 && (
                  <p className="relative mt-3 text-sm font-semibold text-white/85">
                    {gap.toAbove === null
                      ? gap.overBelow !== null
                        ? m.live.lead(gap.overBelow)
                        : null
                      : m.live.toAbove(gap.toAbove)}
                  </p>
                )}
              </div>

              {feedback && (
                <Alert key={tries} tone={feedback.tone} className={`mt-4 ${feedback.tone === "error" ? "animate-shake" : "animate-pop-in"}`}>
                  {feedback.text}
                </Alert>
              )}

              {race.status === "finished" && team.place !== null && (
                <div className="animate-pop-in mt-4 rounded-2xl bg-sun-soft px-5 py-4" role="status">
                  <p className="font-display text-xl font-bold">
                    {m.race.placeOf(team.place, teams.length)}
                  </p>
                  <p className="mt-1 text-sm">
                    {m.race.finalScore(team.score)}
                  </p>
                </div>
              )}

              {progress.finished ? (
                <div key="finished" className="animate-pop-in mt-4 rounded-2xl bg-teal-soft px-5 py-6 text-center" role="status">
                  <svg viewBox="0 0 20 20" aria-hidden="true" className="mx-auto size-10 text-teal-strong">
                    <path d="M5 17V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M5 3.5h3.3v3.5H5zm6.7 0H15V7h-3.3zM8.3 7h3.4v3.5H8.3z" fill="currentColor" />
                  </svg>
                  <p className="mt-2 font-display text-2xl font-bold text-teal-strong">{m.race.finishBang}</p>
                  <p className="mt-1 text-sm">
                    {team.finishOrder && team.finishOrder <= SCORING.finishBonus.length
                      ? m.race.finishedOrder(team.finishOrder, SCORING.finishBonus[team.finishOrder - 1])
                      : m.race.routeDone}
                  </p>
                </div>
              ) : nextHasTask ? (
                currentTask && taskPoint && race.status === "running" ? (
                  <TaskCard key={currentTask.id} task={currentTask} point={taskPoint} pending={answerPending} onSubmit={answer} />
                ) : (
                  <div className="mt-4 rounded-2xl bg-canvas px-5 py-4 ring-1 ring-line">
                    <p className="font-bold">{progress.next ? m.race.nextPoint(pointLabel(progress.next, m)) : ""}</p>
                    <p className="mt-1 text-sm text-ink-muted">
                      {race.status === "finished"
                        ? m.race.noMoreAnswers
                        : m.race.taskAfterStart}
                    </p>
                  </div>
                )
              ) : (
                <>
                  <dl key={team.position} className="animate-pop-in mt-4 grid grid-cols-2 gap-3">
                    <PointCard caption={m.race.now} point={progress.current} tone="now" />
                    {progress.next && <PointCard caption={m.race.next} point={progress.next} tone="next" />}
                  </dl>
                  {progress.next && (
                    <Button
                      className="mt-5 w-full"
                      disabled={race.status !== "running"}
                      pending={runner.isPending("advance")}
                      pendingLabel={m.race.advancing}
                      onClick={advanceLegacy}
                    >
                      {legacyButtonLabel(race.status, progress.next, m)}
                    </Button>
                  )}
                  {runner.errorFor("advance") && <Alert className="mt-4">{runner.errorFor("advance")}</Alert>}
                </>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="map-heading" className="rounded-card bg-surface p-5 shadow-card ring-1 ring-line sm:p-6">
          <h2 id="map-heading" className="font-display text-lg font-bold tracking-tight">
            {m.race.map}
          </h2>
          <div className="mt-5">
            <RaceTrack route={route} teams={teams} ownTeamId={team?.id ?? null} perRow={4} />
          </div>
          <h2 className="mt-6 font-display text-lg font-bold tracking-tight">
            {race.status === "finished" ? m.race.results : m.race.standings}
          </h2>
          <div className="mt-3">
            <Leaderboard teams={teams} route={route} ownTeamId={team?.id ?? null} />
          </div>
          <p className="mt-3 text-xs text-ink-muted">{rulesSummary(m)}</p>
        </section>
      </div>
    </div>
  );
}
