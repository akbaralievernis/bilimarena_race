import type { ReactNode } from "react";
import { StatusBadge } from "@/components/lobby/status-badge";
import { PlaceBadge } from "@/components/race/leaderboard";
import { ButtonLink } from "@/components/ui/button-link";
import { TEAM_COLORS } from "@/lib/race/lobby";
import {
  firstTryRate,
  formatDuration,
  hardestTasks,
  summarize,
  type RaceReport,
  type ReportEvent,
  type ReportTask,
} from "@/lib/race/report";
import { formatPoints, pointsWord } from "@/lib/race/scoring";
import { formatRoomCode } from "@/lib/race/validation";
import { CsvDownload } from "./csv-download";
import { LocalTime } from "./local-time";

const percent = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 100));

function Card({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-card bg-surface p-5 shadow-card ring-1 ring-line sm:p-8">
      <h2 id={id} className="font-display text-xl font-bold tracking-tight">
        {title}
      </h2>
      {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
      {/* grid-cols-1 = minmax(0, 1fr): long names truncate instead of widening the page */}
      <div className="mt-5 grid grid-cols-1">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border-2 border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">{children}</p>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-canvas px-4 py-3 ring-1 ring-line">
      <p className="text-xs font-bold text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-2xl leading-tight font-bold tabular-nums">{value}</p>
      {note && <p className="text-xs text-ink-muted">{note}</p>}
    </div>
  );
}

/** Horizontal share bar; color by how well the class did. */
function Meter({ value, label }: { value: number | null; label: string }) {
  const tone = value === null ? "bg-line" : value >= 75 ? "bg-teal" : value >= 50 ? "bg-sun" : "bg-coral";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-ink-muted">{label}</span>
        <span className="font-bold tabular-nums">{value === null ? "—" : `${value}%`}</span>
      </div>
      <div
        className="mt-1 h-2 overflow-hidden rounded-full bg-canvas ring-1 ring-line"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? 0}
      >
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}

function WrongAnswers({ task }: { task: ReportTask }) {
  if (task.topWrong.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-bold text-ink-muted">Частые неверные ответы</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {task.topWrong.map((item) => (
          <li
            key={item.answer}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 text-xs font-bold text-danger"
          >
            <span className="truncate">«{item.answer}»</span>
            <span className="shrink-0 tabular-nums opacity-80">×{item.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TaskAnalysis({ task }: { task: ReportTask }) {
  const firstTry = firstTryRate(task);
  return (
    <li className="min-w-0 rounded-2xl p-4 ring-1 ring-line">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-extrabold text-brand-strong tabular-nums">
          {task.position}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold" title={task.title}>
            {task.title}
          </p>
          <p className="mt-0.5 text-sm break-words text-ink-muted">{task.question}</p>
          {task.options && (
            <p className="mt-1 text-xs break-words text-ink-muted">Варианты: {task.options.join(" · ")}</p>
          )}
        </div>
      </div>

      {task.teamsTried === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">До этого задания команды не дошли.</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Meter value={firstTry} label="Решили с первой попытки" />
            <Meter value={percent(task.correct, task.attempts)} label="Верных ответов" />
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Прошли {task.teamsPassed} из {task.teamsTried} · ответов {task.attempts} (неверных {task.wrong})
            {task.avgSolveSeconds !== null && ` · в среднем ${formatDuration(task.avgSolveSeconds)}`}
          </p>
          <WrongAnswers task={task} />
        </>
      )}
    </li>
  );
}

function EventLine({ event }: { event: ReportEvent }) {
  switch (event.kind) {
    case "start":
      return <span className="font-bold">Старт гонки</span>;
    case "race_finish":
      return <span className="font-bold">Гонка завершена</span>;
    case "finish":
      return (
        <span>
          <span className="font-bold">{event.teamName}</span> финишировала — {event.finishOrder}-я
        </span>
      );
    case "answer":
      return (
        <span>
          <span className="font-bold">{event.teamName}</span>
          {event.participantName && <span className="text-ink-muted"> ({event.participantName})</span>} · чекпоинт{" "}
          {event.position} «{event.checkpointTitle}» —{" "}
          <span className={event.correct ? "font-bold text-teal-strong" : "font-bold text-danger"}>
            {event.correct ? "верно" : "неверно"}, {formatPoints(event.points)}
          </span>
        </span>
      );
  }
}

const TIMELINE_LIMIT = 300;

/** The teacher's report: summary, standings, task analysis, students and the timeline. */
export function RaceReportView({ report }: { report: RaceReport }) {
  const { race, teams, tasks, participants, timeline } = report;
  const summary = summarize(report);
  const hardest = hardestTasks(tasks);
  // Newest first; the full list is in the CSV.
  const events = [...timeline].reverse();
  const shown = events.slice(0, TIMELINE_LIMIT);

  return (
    <div className="space-y-6">
      <section className="rounded-card bg-surface p-5 shadow-card ring-1 ring-line sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={race.status} />
            <span className="font-mono text-sm tracking-wider text-ink-muted">{formatRoomCode(race.code)}</span>
          </div>
          <ButtonLink href={`/race/${race.id}`} variant="secondary" size="sm">
            Карта гонки
          </ButtonLink>
        </div>
        <p className="mt-4 text-sm font-bold text-teal-strong">Отчёт по гонке</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight break-words sm:text-3xl">{race.title}</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {race.startedAt ? (
            <>
              Старт: <LocalTime iso={race.startedAt} date />
              {race.finishedAt && (
                <>
                  {" · "}конец: <LocalTime iso={race.finishedAt} date />
                </>
              )}
            </>
          ) : (
            <>
              Создана <LocalTime iso={race.createdAt} date /> · гонка ещё не начиналась
            </>
          )}
        </p>
        {race.status === "running" && (
          <p className="mt-3 rounded-2xl bg-sun-soft px-4 py-3 text-sm">
            Гонка ещё идёт — это снимок на момент открытия страницы. Обновите страницу, чтобы увидеть новые ответы.
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Команды" value={String(summary.teams)} note={`финишировали ${summary.finishedTeams}`} />
          <Tile label="Ученики" value={String(summary.students)} />
          <Tile
            label="Ответы"
            value={String(summary.answers)}
            note={summary.accuracy === null ? undefined : `верных ${summary.accuracy}%`}
          />
          <Tile label="Длительность" value={summary.durationSeconds === null ? "—" : formatDuration(summary.durationSeconds)} />
        </div>

        <div className="mt-6 border-t border-line pt-6">
          <p className="mb-3 text-sm text-ink-muted">Таблицы для Excel и Google Таблиц:</p>
          <CsvDownload report={report} />
        </div>
      </section>

      <Card id="standings-heading" title="Итоговые места" hint="Сначала финишировавшие по времени, затем по позиции на карте и очкам.">
        {teams.length === 0 ? (
          <Empty>Команд не было.</Empty>
        ) : (
          <ol className="space-y-2" aria-label="Таблица мест">
            {teams.map((team, index) => {
              const share = percent(team.correct, team.correct + team.wrong);
              return (
                <li key={team.id} className="flex min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5 ring-1 ring-line">
                  <PlaceBadge place={team.place} />
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-2 font-bold">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: TEAM_COLORS[index % TEAM_COLORS.length] }}
                        aria-hidden="true"
                      />
                      <span className="truncate" title={team.name}>
                        {team.name}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {team.finishOrder ? `Финиш · ${team.finishOrder}-я команда` : `Чекпоинт ${team.position}`}
                      {" · "}
                      {team.memberCount} уч.{" · "}
                      <span className="text-teal-strong">верно {team.correct}</span>
                      {" · "}
                      <span className="text-danger">неверно {team.wrong}</span>
                      {share !== null && ` · точность ${share}%`}
                    </p>
                  </div>
                  <p className="shrink-0 text-right">
                    <span className="block font-display text-lg leading-none font-bold tabular-nums">{team.score}</span>
                    <span className="text-xs text-ink-muted">{pointsWord(team.score)}</span>
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {hardest.length > 0 && (
        <Card
          id="hardest-heading"
          title="Что разобрать на уроке"
          hint="Задания, которые с первой попытки решили меньше 60 % команд."
        >
          <ul className="space-y-3">
            {hardest.map((task) => (
              <li key={task.position} className="rounded-2xl bg-sun-soft p-4">
                <p className="font-bold break-words">
                  {task.position}. {task.title} — с первой попытки {firstTryRate(task)}%
                </p>
                <p className="mt-0.5 text-sm break-words text-ink-muted">{task.question}</p>
                <WrongAnswers task={task} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card id="tasks-heading" title="Разбор заданий" hint="Время — от прихода на предыдущую точку до прохождения этой.">
        {tasks.length === 0 ? (
          <Empty>В этой гонке не было заданий — чекпоинты проходились кнопкой.</Empty>
        ) : (
          <ol className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {tasks.map((task) => (
              <TaskAnalysis key={task.position} task={task} />
            ))}
          </ol>
        )}
      </Card>

      <Card id="students-heading" title="Ученики" hint="Ответы, которые ученик отправил за свою команду.">
        {participants.length === 0 ? (
          <Empty>Ученики не подключались.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="text-xs text-ink-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-3 font-bold">
                    Ученик
                  </th>
                  <th scope="col" className="py-2 pr-3 font-bold">
                    Команда
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-bold">
                    Ответов
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-bold">
                    Верных
                  </th>
                  <th scope="col" className="py-2 text-right font-bold">
                    Точность
                  </th>
                </tr>
              </thead>
              <tbody>
                {participants.map((student) => {
                  const share = percent(student.correct, student.answers);
                  return (
                    <tr key={student.id} className="border-b border-line last:border-0">
                      <td className="max-w-48 truncate py-2 pr-3 font-bold" title={student.displayName}>
                        {student.displayName}
                      </td>
                      <td className="max-w-40 truncate py-2 pr-3 text-ink-muted">{student.teamName ?? "без команды"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{student.answers}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{student.correct}</td>
                      <td className="py-2 text-right tabular-nums">{share === null ? "—" : `${share}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        id="timeline-heading"
        title="Хронология"
        hint={
          events.length > TIMELINE_LIMIT
            ? `Последние ${TIMELINE_LIMIT} событий из ${events.length}, сначала новые. Все ответы — в CSV.`
            : "Сначала новые события."
        }
      >
        {shown.length === 0 ? (
          <Empty>Гонка ещё не начиналась.</Empty>
        ) : (
          <ol className="max-h-[32rem] space-y-1.5 overflow-y-auto pr-1 text-sm">
            {shown.map((event, index) => (
              <li key={`${event.at}-${index}`} className="flex min-w-0 gap-3">
                <span className="w-16 shrink-0 font-mono text-xs leading-5 text-ink-muted tabular-nums">
                  <LocalTime iso={event.at} />
                </span>
                <span className="min-w-0 flex-1 break-words">
                  <EventLine event={event} />
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
