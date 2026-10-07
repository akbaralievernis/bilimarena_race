"use client";

import { useRef, useState } from "react";
import { advanceTeamAction, submitAnswerAction } from "@/app/race/[raceId]/actions";
import { ConnectionBanner, ConnectionPill } from "@/components/lobby/connection-status";
import { StatusBadge } from "@/components/lobby/status-badge";
import { useActionRunner } from "@/components/lobby/use-action-runner";
import type { ConnectionState } from "@/components/lobby/use-lobby";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { NETWORK_ERROR_MESSAGE, UNKNOWN_ERROR_MESSAGE, isNetworkError } from "@/lib/race/errors";
import { teamColor, type LobbySnapshot, type RoutePoint } from "@/lib/race/lobby";
import { checkpointCount, pointLabel, teamProgress } from "@/lib/race/route";
import { SCORING, formatPoints, pointsWord, rulesSummary } from "@/lib/race/scoring";
import { Leaderboard } from "./leaderboard";
import { RouteMap } from "./route-map";
import { TaskCard } from "./task-card";

type Feedback = { tone: "success" | "error" | "info"; text: string };

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

function legacyButtonLabel(status: string, next: RoutePoint) {
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
  const answering = useRef(false);
  const [answerPending, setAnswerPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const { race, route, teams, viewer, currentTask } = lobby;
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
    try {
      const result = await submitAnswerAction(team.id, currentTask.id, value);
      if (!result.ok) setFeedback({ tone: "error", text: result.message });
      else if (result.alreadyPassed) {
        setFeedback({ tone: "info", text: "Команда уже прошла этот чекпоинт — карта обновлена." });
      } else if (result.correct) {
        const earned = `${formatPoints(result.points)} ${pointsWord(result.points)}`;
        setFeedback({
          tone: "success",
          text: result.finished
            ? `Верно! ${earned}. Команда прошла последний чекпоинт и финишировала.`
            : `Верно! ${earned}. Команда прошла чекпоинт ${currentTask.checkpointPosition}.`,
        });
      } else {
        setFeedback({
          tone: "error",
          text: `Неверно: ${formatPoints(result.points)} ${pointsWord(result.points)}. Команда остаётся на месте — следующая попытка через ${
            result.cooldownSeconds || SCORING.pauseSeconds
          } секунд.`,
        });
      }
      await refresh();
    } catch (error) {
      setFeedback({
        tone: "error",
        text: !navigator.onLine || isNetworkError(error) ? NETWORK_ERROR_MESSAGE : UNKNOWN_ERROR_MESSAGE,
      });
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
                {total > 0 && (
                  <p className="mt-1 text-sm text-ink-muted">
                    Пройдено чекпоинтов: {passed} из {total}
                  </p>
                )}
                {race.status !== "lobby" && race.status !== "draft" && (
                  <dl className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-canvas px-3 py-2 ring-1 ring-line">
                      <dt className="text-xs font-bold text-ink-muted">Очки команды</dt>
                      <dd className="font-display text-xl font-bold tabular-nums">{team.score}</dd>
                    </div>
                    <div className="rounded-xl bg-canvas px-3 py-2 ring-1 ring-line">
                      <dt className="text-xs font-bold text-ink-muted">Место</dt>
                      <dd className="font-display text-xl font-bold tabular-nums">
                        {team.place ?? "—"}
                        <span className="text-sm font-semibold text-ink-muted"> из {teams.length}</span>
                      </dd>
                    </div>
                  </dl>
                )}
              </div>

              {feedback && (
                <Alert tone={feedback.tone} className="animate-pop-in mt-4">
                  {feedback.text}
                </Alert>
              )}

              {race.status === "finished" && team.place !== null && (
                <div className="animate-pop-in mt-4 rounded-2xl bg-sun-soft px-5 py-4" role="status">
                  <p className="font-display text-xl font-bold">
                    {team.place}-е место из {teams.length}
                  </p>
                  <p className="mt-1 text-sm">
                    Гонка завершена. У вашей команды {team.score} {pointsWord(team.score)}.
                  </p>
                </div>
              )}

              {progress.finished ? (
                <div key="finished" className="animate-pop-in mt-4 rounded-2xl bg-teal-soft px-5 py-6 text-center" role="status">
                  <svg viewBox="0 0 20 20" aria-hidden="true" className="mx-auto size-10 text-teal-strong">
                    <path d="M5 17V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M5 3.5h3.3v3.5H5zm6.7 0H15V7h-3.3zM8.3 7h3.4v3.5H8.3z" fill="currentColor" />
                  </svg>
                  <p className="mt-2 font-display text-2xl font-bold text-teal-strong">Финиш!</p>
                  <p className="mt-1 text-sm">
                    {team.finishOrder && team.finishOrder <= SCORING.finishBonus.length
                      ? `Ваша команда финишировала ${team.finishOrder}-й: +${SCORING.finishBonus[team.finishOrder - 1]} очков.`
                      : "Ваша команда прошла маршрут."}
                  </p>
                </div>
              ) : nextHasTask ? (
                currentTask && taskPoint && race.status === "running" ? (
                  <TaskCard key={currentTask.id} task={currentTask} point={taskPoint} pending={answerPending} onSubmit={answer} />
                ) : (
                  <div className="mt-4 rounded-2xl bg-canvas px-5 py-4 ring-1 ring-line">
                    <p className="font-bold">{progress.next ? `Дальше: ${pointLabel(progress.next)}` : ""}</p>
                    <p className="mt-1 text-sm text-ink-muted">
                      {race.status === "finished"
                        ? "Гонка завершена — ответы больше не принимаются."
                        : "Задание откроется, когда учитель начнёт гонку."}
                    </p>
                  </div>
                )
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
                      onClick={advanceLegacy}
                    >
                      {legacyButtonLabel(race.status, progress.next)}
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
            Карта гонки
          </h2>
          <div className="mt-5">
            <RouteMap route={route} teams={teams} ownTeamId={team?.id ?? null} />
          </div>
          <h2 className="mt-6 font-display text-lg font-bold tracking-tight">
            {race.status === "finished" ? "Итоги гонки" : "Таблица мест"}
          </h2>
          <div className="mt-3">
            <Leaderboard teams={teams} route={route} ownTeamId={team?.id ?? null} />
          </div>
          <p className="mt-3 text-xs text-ink-muted">{rulesSummary()}</p>
        </section>
      </div>
    </div>
  );
}
