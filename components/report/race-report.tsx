import type { ReactNode } from "react";
import { StatusBadge } from "@/components/lobby/status-badge";
import { PlaceBadge } from "@/components/race/leaderboard";
import { ButtonLink } from "@/components/ui/button-link";
import type { Messages } from "@/lib/i18n/config";
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

function WrongAnswers({ task, m }: { task: ReportTask; m: Messages }) {
  if (task.topWrong.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-bold text-ink-muted">{m.report.commonWrong}</p>
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

function TaskAnalysis({ task, m }: { task: ReportTask; m: Messages }) {
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
            <p className="mt-1 text-xs break-words text-ink-muted">{m.report.options(task.options.join(" · "))}</p>
          )}
        </div>
      </div>

      {task.teamsTried === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">{m.report.notReached}</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Meter value={firstTry} label={m.report.firstTry} />
            <Meter value={percent(task.correct, task.attempts)} label={m.report.correctAnswers} />
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            {m.report.taskStats(task.teamsPassed, task.teamsTried, task.attempts, task.wrong)}
            {task.avgSolveSeconds !== null && m.report.average(formatDuration(task.avgSolveSeconds, m))}
          </p>
          <WrongAnswers task={task} m={m} />
        </>
      )}
    </li>
  );
}

function EventLine({ event, m }: { event: ReportEvent; m: Messages }) {
  switch (event.kind) {
    case "start":
      return <span className="font-bold">{m.report.events.start}</span>;
    case "race_finish":
      return <span className="font-bold">{m.report.events.end}</span>;
    case "finish":
      return (
        <span>
          <span className="font-bold">{event.teamName}</span> {m.report.events.finished(event.finishOrder)}
        </span>
      );
    case "answer":
      return (
        <span>
          <span className="font-bold">{event.teamName}</span>
          {event.participantName && <span className="text-ink-muted"> ({event.participantName})</span>}
          {" · "}
          {m.report.events.checkpoint(event.position, event.checkpointTitle)} —{" "}
          <span className={event.correct ? "font-bold text-teal-strong" : "font-bold text-danger"}>
            {event.correct ? m.report.events.correct : m.report.events.wrong}, {formatPoints(event.points)}
          </span>
        </span>
      );
  }
}

const TIMELINE_LIMIT = 300;

/** The teacher's report: summary, standings, task analysis, students and the timeline. */
export function RaceReportView({ report, m }: { report: RaceReport; m: Messages }) {
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
            {m.report.raceMap}
          </ButtonLink>
        </div>
        <p className="mt-4 text-sm font-bold text-teal-strong">{m.report.eyebrow}</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight break-words sm:text-3xl">{race.title}</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {race.startedAt ? (
            <>
              {m.report.started}: <LocalTime iso={race.startedAt} date />
              {race.finishedAt && (
                <>
                  {" · "}
                  {m.report.ended}: <LocalTime iso={race.finishedAt} date />
                </>
              )}
            </>
          ) : (
            <>
              {m.report.created} <LocalTime iso={race.createdAt} date /> · {m.report.notStarted}
            </>
          )}
        </p>
        {race.status === "running" && (
          <p className="mt-3 rounded-2xl bg-sun-soft px-4 py-3 text-sm">
            {m.report.runningNote}
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label={m.report.tiles.teams} value={String(summary.teams)} note={m.report.tiles.finished(summary.finishedTeams)} />
          <Tile label={m.report.tiles.students} value={String(summary.students)} />
          <Tile
            label={m.report.tiles.answers}
            value={String(summary.answers)}
            note={summary.accuracy === null ? undefined : m.report.tiles.correctShare(summary.accuracy)}
          />
          <Tile
            label={m.report.tiles.duration}
            value={summary.durationSeconds === null ? "—" : formatDuration(summary.durationSeconds, m)}
          />
        </div>

        <div className="mt-6 border-t border-line pt-6">
          <p className="mb-3 text-sm text-ink-muted">{m.report.csvIntro}</p>
          <CsvDownload report={report} />
        </div>
      </section>

      <Card id="standings-heading" title={m.report.standings} hint={m.report.standingsHint}>
        {teams.length === 0 ? (
          <Empty>{m.report.noTeams}</Empty>
        ) : (
          <ol className="space-y-2" aria-label={m.leaderboard.aria}>
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
                      {team.finishOrder ? m.leaderboard.finishOrder(team.finishOrder) : m.report.atCheckpoint(team.position)}
                      {" · "}
                      {m.report.members(team.memberCount)}
                      {" · "}
                      <span className="text-teal-strong">{m.leaderboard.correct(team.correct)}</span>
                      {" · "}
                      <span className="text-danger">{m.leaderboard.wrong(team.wrong)}</span>
                      {share !== null && ` · ${m.leaderboard.accuracy(share)}`}
                    </p>
                  </div>
                  <p className="shrink-0 text-right">
                    <span className="block font-display text-lg leading-none font-bold tabular-nums">{team.score}</span>
                    <span className="text-xs text-ink-muted">{pointsWord(team.score, m)}</span>
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
          title={m.report.hardest}
          hint={m.report.hardestHint}
        >
          <ul className="space-y-3">
            {hardest.map((task) => (
              <li key={task.position} className="rounded-2xl bg-sun-soft p-4">
                <p className="font-bold break-words">
                  {task.position}. {m.report.firstTryOf(task.title, firstTryRate(task) ?? 0)}
                </p>
                <p className="mt-0.5 text-sm break-words text-ink-muted">{task.question}</p>
                <WrongAnswers task={task} m={m} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card id="tasks-heading" title={m.report.tasks} hint={m.report.tasksHint}>
        {tasks.length === 0 ? (
          <Empty>{m.report.noTasks}</Empty>
        ) : (
          <ol className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {tasks.map((task) => (
              <TaskAnalysis key={task.position} task={task} m={m} />
            ))}
          </ol>
        )}
      </Card>

      <Card id="students-heading" title={m.report.students} hint={m.report.studentsHint}>
        {participants.length === 0 ? (
          <Empty>{m.report.noStudents}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="text-xs text-ink-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-3 font-bold">
                    {m.report.columns.student}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-bold">
                    {m.report.columns.team}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-bold">
                    {m.report.columns.answers}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-bold">
                    {m.report.columns.correct}
                  </th>
                  <th scope="col" className="py-2 text-right font-bold">
                    {m.report.columns.accuracy}
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
                      <td className="max-w-40 truncate py-2 pr-3 text-ink-muted">{student.teamName ?? m.report.noTeam}</td>
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
        title={m.report.timeline}
        hint={
          events.length > TIMELINE_LIMIT
            ? m.report.timelineLimited(TIMELINE_LIMIT, events.length)
            : m.report.timelineHint
        }
      >
        {shown.length === 0 ? (
          <Empty>{m.report.timelineEmpty}</Empty>
        ) : (
          <ol className="max-h-[32rem] space-y-1.5 overflow-y-auto pr-1 text-sm">
            {shown.map((event, index) => (
              <li key={`${event.at}-${index}`} className="flex min-w-0 gap-3">
                <span className="w-16 shrink-0 font-mono text-xs leading-5 text-ink-muted tabular-nums">
                  <LocalTime iso={event.at} />
                </span>
                <span className="min-w-0 flex-1 break-words">
                  <EventLine event={event} m={m} />
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
