import { isRaceStatus, type RaceStatus } from "@/lib/race/status";
import type { TaskType } from "@/lib/race/lobby";

/*
 * Stage 5: the teacher's race report from public.get_race_report(). Owner only;
 * it never contains the text of a correct answer — only counts, the most
 * common WRONG answers and "right / wrong" in the timeline.
 */

export type ReportRace = {
  id: string;
  code: string;
  title: string;
  status: RaceStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type ReportTeam = {
  id: string;
  name: string;
  place: number;
  score: number;
  finishOrder: number | null;
  finishedAt: string | null;
  position: number;
  memberCount: number;
  correct: number;
  wrong: number;
};

export type ReportTask = {
  position: number;
  title: string;
  type: TaskType;
  question: string;
  options: string[] | null;
  attempts: number;
  correct: number;
  wrong: number;
  teamsTried: number;
  teamsPassed: number;
  /** Teams whose very first answer to this task was right. */
  firstTryCorrect: number;
  /** Average time from reaching the previous point to passing this one; null if nobody passed. */
  avgSolveSeconds: number | null;
  topWrong: { answer: string; count: number }[];
};

export type ReportParticipant = {
  id: string;
  displayName: string;
  teamName: string | null;
  answers: number;
  correct: number;
};

export type ReportEvent =
  | { kind: "start"; at: string }
  | {
      kind: "answer";
      at: string;
      teamName: string;
      participantName: string | null;
      position: number;
      checkpointTitle: string;
      correct: boolean;
      points: number;
    }
  | { kind: "finish"; at: string; teamName: string; finishOrder: number }
  | { kind: "race_finish"; at: string };

export type RaceReport = {
  race: ReportRace;
  teams: ReportTeam[];
  tasks: ReportTask[];
  participants: ReportParticipant[];
  timeline: ReportEvent[];
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNullableString = (value: unknown): value is string | null => value === null || isString(value);
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const isRank = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1;
const isPoints = (value: unknown): value is number => Number.isInteger(value);

function invalid(): never {
  throw new Error("invalid_report_payload");
}

function parseTeam(value: unknown): ReportTeam {
  if (
    !isObject(value) ||
    !isString(value.id) ||
    !isString(value.name) ||
    !isRank(value.place) ||
    !isCount(value.score) ||
    !(value.finishOrder === null || isRank(value.finishOrder)) ||
    !isNullableString(value.finishedAt) ||
    !isCount(value.position) ||
    !isCount(value.memberCount) ||
    !isCount(value.correct) ||
    !isCount(value.wrong)
  ) {
    invalid();
  }
  return {
    id: value.id,
    name: value.name,
    place: value.place,
    score: value.score,
    finishOrder: value.finishOrder,
    finishedAt: value.finishedAt,
    position: value.position,
    memberCount: value.memberCount,
    correct: value.correct,
    wrong: value.wrong,
  };
}

function parseTask(value: unknown): ReportTask {
  if (
    !isObject(value) ||
    !isCount(value.position) ||
    !isString(value.title) ||
    (value.type !== "single_choice" && value.type !== "short_answer") ||
    !isString(value.question) ||
    !(value.options === null || (Array.isArray(value.options) && value.options.every(isString))) ||
    !isCount(value.attempts) ||
    !isCount(value.correct) ||
    !isCount(value.wrong) ||
    !isCount(value.teamsTried) ||
    !isCount(value.teamsPassed) ||
    !isCount(value.firstTryCorrect) ||
    !(value.avgSolveSeconds === null || isCount(value.avgSolveSeconds)) ||
    !Array.isArray(value.topWrong)
  ) {
    invalid();
  }
  const topWrong = value.topWrong.map((item) => {
    if (!isObject(item) || !isString(item.answer) || !isRank(item.count)) invalid();
    return { answer: item.answer, count: item.count };
  });
  return {
    position: value.position,
    title: value.title,
    type: value.type,
    question: value.question,
    options: value.options === null ? null : [...(value.options as string[])],
    attempts: value.attempts,
    correct: value.correct,
    wrong: value.wrong,
    teamsTried: value.teamsTried,
    teamsPassed: value.teamsPassed,
    firstTryCorrect: value.firstTryCorrect,
    avgSolveSeconds: value.avgSolveSeconds,
    topWrong,
  };
}

function parseParticipant(value: unknown): ReportParticipant {
  if (
    !isObject(value) ||
    !isString(value.id) ||
    !isString(value.displayName) ||
    !isNullableString(value.teamName) ||
    !isCount(value.answers) ||
    !isCount(value.correct)
  ) {
    invalid();
  }
  return { id: value.id, displayName: value.displayName, teamName: value.teamName, answers: value.answers, correct: value.correct };
}

function parseEvent(value: unknown): ReportEvent {
  if (!isObject(value) || !isString(value.at)) invalid();
  switch (value.kind) {
    case "start":
    case "race_finish":
      return { kind: value.kind, at: value.at };
    case "finish":
      if (!isString(value.teamName) || !isRank(value.finishOrder)) invalid();
      return { kind: "finish", at: value.at, teamName: value.teamName, finishOrder: value.finishOrder };
    case "answer":
      if (
        !isString(value.teamName) ||
        !isNullableString(value.participantName ?? null) ||
        !isCount(value.position) ||
        !isString(value.checkpointTitle) ||
        typeof value.correct !== "boolean" ||
        !isPoints(value.points)
      ) {
        invalid();
      }
      return {
        kind: "answer",
        at: value.at,
        teamName: value.teamName,
        participantName: isString(value.participantName) ? value.participantName : null,
        position: value.position,
        checkpointTitle: value.checkpointTitle,
        correct: value.correct,
        points: value.points,
      };
    default:
      invalid();
  }
}

/** Validates the RPC payload so the page never renders half-shaped data. */
export function parseReport(data: unknown): RaceReport {
  if (!isObject(data) || !isObject(data.race)) invalid();
  const { race } = data;
  if (
    !isString(race.id) ||
    !isString(race.code) ||
    !isString(race.title) ||
    !isRaceStatus(race.status) ||
    !isString(race.createdAt) ||
    !isNullableString(race.startedAt) ||
    !isNullableString(race.finishedAt) ||
    !Array.isArray(data.teams) ||
    !Array.isArray(data.tasks) ||
    !Array.isArray(data.participants) ||
    !Array.isArray(data.timeline)
  ) {
    invalid();
  }
  return {
    race: {
      id: race.id,
      code: race.code,
      title: race.title,
      status: race.status,
      createdAt: race.createdAt,
      startedAt: race.startedAt,
      finishedAt: race.finishedAt,
    },
    teams: data.teams.map(parseTeam),
    tasks: data.tasks.map(parseTask),
    participants: data.participants.map(parseParticipant),
    timeline: data.timeline.map(parseEvent),
  };
}

// ---------------------------------------------------------------------------
// Derived figures for the page
// ---------------------------------------------------------------------------

export type ReportSummary = {
  teams: number;
  students: number;
  answers: number;
  /** Share of right answers in percent, null before the first answer. */
  accuracy: number | null;
  /** From start to end; null until the race has finished. */
  durationSeconds: number | null;
  finishedTeams: number;
};

export function summarize(report: RaceReport): ReportSummary {
  const answers = report.tasks.reduce((sum, task) => sum + task.attempts, 0);
  const correct = report.tasks.reduce((sum, task) => sum + task.correct, 0);
  const { startedAt, finishedAt } = report.race;
  return {
    teams: report.teams.length,
    students: report.participants.length,
    answers,
    accuracy: answers === 0 ? null : Math.round((correct / answers) * 100),
    durationSeconds:
      startedAt && finishedAt ? Math.max(0, Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000)) : null,
    finishedTeams: report.teams.filter((team) => team.finishOrder !== null).length,
  };
}

/** Share of teams that solved the task with their first answer, in percent; null if nobody tried. */
export function firstTryRate(task: ReportTask): number | null {
  return task.teamsTried === 0 ? null : Math.round((task.firstTryCorrect / task.teamsTried) * 100);
}

/**
 * Tasks worth discussing in class: tried by somebody, solved with the first
 * answer by fewer than 60 % of the teams — the hardest first.
 */
export function hardestTasks(tasks: ReportTask[], limit = 3): ReportTask[] {
  return tasks
    .filter((task) => {
      const rate = firstTryRate(task);
      return rate !== null && rate < 60;
    })
    .sort((a, b) => (firstTryRate(a) ?? 0) - (firstTryRate(b) ?? 0) || b.wrong - a.wrong)
    .slice(0, limit);
}

/** "45 с", "3 мин 05 с", "1 ч 02 мин". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} с`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} мин ${String(seconds % 60).padStart(2, "0")} с`;
  return `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, "0")} мин`;
}

// ---------------------------------------------------------------------------
// CSV export (Excel-friendly: «;» separator, UTF-8 BOM, quoted text)
// ---------------------------------------------------------------------------

function cell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  // Spreadsheet formula injection: a cell must not start with = + - @.
  const safe = /^[=+\-@]/.test(text) && typeof value === "string" ? `'${text}` : text;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const row = (values: (string | number | null)[]) => values.map(cell).join(";");

const BOM = String.fromCharCode(0xfeff); // UTF-8 BOM: Excel then reads Cyrillic correctly
const csvFile = (lines: string[]) => `${BOM}${lines.join("\r\n")}\r\n`;

/** Final table: one team per line. */
export function standingsCsv(report: RaceReport): string {
  const lines = [row(["Место", "Команда", "Очки", "Финиш", "Верно", "Неверно", "Учеников"])];
  for (const team of report.teams) {
    lines.push(
      row([team.place, team.name, team.score, team.finishOrder, team.correct, team.wrong, team.memberCount]),
    );
  }
  return csvFile(lines);
}

/** Every answer of the race, one per line — for Excel or Google Sheets. */
export function answersCsv(report: RaceReport, formatTime: (iso: string) => string): string {
  const lines = [row(["Время", "Команда", "Ученик", "Чекпоинт", "Название", "Результат", "Очки"])];
  for (const event of report.timeline) {
    if (event.kind !== "answer") continue;
    lines.push(
      row([
        formatTime(event.at),
        event.teamName,
        event.participantName,
        event.position,
        event.checkpointTitle,
        event.correct ? "верно" : "неверно",
        event.points,
      ]),
    );
  }
  return csvFile(lines);
}
