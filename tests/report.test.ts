import { describe, expect, it } from "vitest";
import {
  answersCsv,
  firstTryRate,
  formatDuration,
  hardestTasks,
  parseReport,
  standingsCsv,
  summarize,
  type ReportTask,
} from "@/lib/race/report";

const task = (position: number, extra: Partial<ReportTask> = {}): ReportTask => ({
  position,
  title: `Задание ${position}`,
  type: "short_answer",
  question: "?",
  options: null,
  attempts: 0,
  correct: 0,
  wrong: 0,
  teamsTried: 0,
  teamsPassed: 0,
  firstTryCorrect: 0,
  avgSolveSeconds: null,
  topWrong: [],
  ...extra,
});

const payload = {
  race: {
    id: "r",
    code: "A7K9Q2",
    title: "Гонка",
    status: "finished",
    createdAt: "2026-10-07T08:00:00Z",
    startedAt: "2026-10-07T09:00:00Z",
    finishedAt: "2026-10-07T09:12:30Z",
  },
  teams: [
    { id: "a", name: "Альфа", place: 1, score: 290, finishOrder: 1, finishedAt: "2026-10-07T09:10:00Z", position: 3, memberCount: 2, correct: 2, wrong: 4 },
    { id: "b", name: "=Бета; \"лучшие\"", place: 2, score: 0, finishOrder: null, finishedAt: null, position: 1, memberCount: 1, correct: 1, wrong: 0 },
  ],
  tasks: [
    task(1, { type: "single_choice", options: ["3", "4"], attempts: 3, correct: 2, wrong: 1, teamsTried: 2, teamsPassed: 2, firstTryCorrect: 1, avgSolveSeconds: 30, topWrong: [{ answer: "3", count: 1 }] }),
    task(2, { attempts: 4, correct: 1, wrong: 3, teamsTried: 1, teamsPassed: 1, firstTryCorrect: 0, avgSolveSeconds: 60 }),
  ],
  participants: [{ id: "p", displayName: "Эрнис", teamName: "Альфа", answers: 5, correct: 1 }],
  timeline: [
    { at: "2026-10-07T09:00:00Z", kind: "start" },
    { at: "2026-10-07T09:00:05Z", kind: "answer", teamName: "Альфа", participantName: "Эрнис", position: 1, checkpointTitle: "Дроби", correct: false, points: -20 },
    { at: "2026-10-07T09:00:30Z", kind: "answer", teamName: "Альфа", participantName: null, position: 1, checkpointTitle: "Дроби", correct: true, points: 140 },
    { at: "2026-10-07T09:10:00Z", kind: "finish", teamName: "Альфа", finishOrder: 1 },
    { at: "2026-10-07T09:12:30Z", kind: "race_finish" },
  ],
};

describe("parseReport", () => {
  it("reads a full report", () => {
    const report = parseReport(payload);
    expect(report.teams.map((team) => team.name)).toEqual(["Альфа", "=Бета; \"лучшие\""]);
    expect(report.tasks[0]).toMatchObject({ options: ["3", "4"], topWrong: [{ answer: "3", count: 1 }] });
    expect(report.timeline.map((event) => event.kind)).toEqual(["start", "answer", "answer", "finish", "race_finish"]);
  });

  it("rejects broken payloads instead of rendering half of them", () => {
    expect(() => parseReport(null)).toThrow();
    expect(() => parseReport({ ...payload, race: { ...payload.race, status: "paused" } })).toThrow();
    expect(() => parseReport({ ...payload, teams: [{ ...payload.teams[0], place: 0 }] })).toThrow();
    expect(() => parseReport({ ...payload, tasks: [{ ...payload.tasks[0], type: "essay" }] })).toThrow();
    expect(() => parseReport({ ...payload, tasks: [{ ...payload.tasks[0], topWrong: [{ answer: "3", count: 0 }] }] })).toThrow();
    expect(() => parseReport({ ...payload, timeline: [{ at: "x", kind: "teleport" }] })).toThrow();
    expect(() => parseReport({ ...payload, timeline: [{ ...payload.timeline[1], points: 1.5 }] })).toThrow();
  });
});

describe("figures", () => {
  it("summarizes the race", () => {
    expect(summarize(parseReport(payload))).toEqual({
      teams: 2,
      students: 1,
      answers: 7,
      accuracy: 43,
      durationSeconds: 750,
      finishedTeams: 1,
    });
  });

  it("has no accuracy or duration before the race has data", () => {
    const report = parseReport({ ...payload, race: { ...payload.race, status: "lobby", startedAt: null, finishedAt: null }, tasks: [task(1)] });
    expect(summarize(report)).toMatchObject({ answers: 0, accuracy: null, durationSeconds: null });
  });

  it("finds the tasks to discuss: first-try rate below 60 %, hardest first", () => {
    const tasks = [
      task(1, { teamsTried: 4, firstTryCorrect: 3 }), // 75 %
      task(2, { teamsTried: 4, firstTryCorrect: 2, wrong: 3 }), // 50 %
      task(3, { teamsTried: 4, firstTryCorrect: 0 }), // 0 %
      task(4, { teamsTried: 4, firstTryCorrect: 2, wrong: 7 }), // 50 %, more mistakes
      task(5), // nobody tried
    ];
    expect(firstTryRate(tasks[4])).toBeNull();
    expect(hardestTasks(tasks).map((item) => item.position)).toEqual([3, 4, 2]);
    expect(hardestTasks(tasks, 1).map((item) => item.position)).toEqual([3]);
  });

  it("formats durations", () => {
    expect([45, 60, 185, 3720].map((n) => formatDuration(n))).toEqual(["45 с", "1 мин 00 с", "3 мин 05 с", "1 ч 02 мин"]);
  });
});

describe("CSV", () => {
  const report = parseReport(payload);
  const lines = (csv: string) => csv.replace(/^﻿/, "").trimEnd().split("\r\n");

  it("starts with a BOM and uses «;» so Excel opens Cyrillic correctly", () => {
    const csv = standingsCsv(report);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(lines(csv)[0]).toBe("Место;Команда;Очки;Финиш;Верно;Неверно;Учеников");
  });

  it("quotes separators and quotes, and defuses formulas in names", () => {
    expect(lines(standingsCsv(report))).toEqual([
      "Место;Команда;Очки;Финиш;Верно;Неверно;Учеников",
      "1;Альфа;290;1;2;4;2",
      "2;\"'=Бета; \"\"лучшие\"\"\";0;;1;0;1",
    ]);
  });

  it("lists only answers, with negative points as numbers", () => {
    expect(lines(answersCsv(report, (iso) => iso.slice(11, 19)))).toEqual([
      "Время;Команда;Ученик;Чекпоинт;Название;Результат;Очки",
      "09:00:05;Альфа;Эрнис;1;Дроби;неверно;-20",
      "09:00:30;Альфа;;1;Дроби;верно;140",
    ]);
  });
});
