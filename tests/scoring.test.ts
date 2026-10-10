import { describe, expect, it } from "vitest";
import { parseLobby, type LobbyTeam } from "@/lib/race/lobby";
import { SCORING, accuracy, formatPoints, pointsWord, rulesSummary, standings } from "@/lib/race/scoring";

const team = (name: string, extra: Partial<LobbyTeam> = {}): LobbyTeam => ({
  id: name,
  name,
  memberCount: 1,
  position: 0,
  score: 0,
  place: null,
  finishOrder: null,
  stats: null,
  ...extra,
});

describe("standings", () => {
  it("orders by place, equal places by name", () => {
    const teams = [team("Гамма", { place: 2 }), team("Бета", { place: 1 }), team("Альфа", { place: 2 })];
    expect(standings(teams).map((item) => item.name)).toEqual(["Бета", "Альфа", "Гамма"]);
  });

  it("without places (database before Stage 4) falls back to position, then score", () => {
    const teams = [team("Альфа", { position: 1, score: 10 }), team("Бета", { position: 2 }), team("Гамма", { position: 1, score: 50 })];
    expect(standings(teams).map((item) => item.name)).toEqual(["Бета", "Гамма", "Альфа"]);
  });

  it("does not change the original array", () => {
    const teams = [team("Б", { place: 2 }), team("А", { place: 1 })];
    standings(teams);
    expect(teams.map((item) => item.name)).toEqual(["Б", "А"]);
  });
});

describe("formatting", () => {
  it("shows points with a sign and a real minus", () => {
    expect([formatPoints(150), formatPoints(-20), formatPoints(0)]).toEqual(["+150", "−20", "0"]);
  });

  it("declines the word «очко»", () => {
    expect([1, 2, 5, 11, 21, 22, 112, 150, -20].map((n) => pointsWord(n))).toEqual([
      "очко",
      "очка",
      "очков",
      "очков",
      "очко",
      "очка",
      "очков",
      "очков",
      "очков",
    ]);
  });

  it("computes accuracy only after the first answer", () => {
    expect(accuracy(null)).toBeNull();
    expect(accuracy({ correct: 0, wrong: 0, finishedAt: null })).toBeNull();
    expect(accuracy({ correct: 2, wrong: 1, finishedAt: null })).toBe(67);
  });

  it("explains the same numbers the database uses", () => {
    expect(SCORING).toMatchObject({ correct: 100, speedBonusMax: 50, wrong: -20, pauseSeconds: 10, finishBonus: [100, 60, 30] });
    expect(rulesSummary()).toContain("пауза 10 секунд");
  });
});

describe("parseLobby with Stage 4 fields", () => {
  const base = {
    race: { id: "r", code: "A7K9Q2", title: "Гонка", description: null, status: "running", startedAt: null, finishedAt: null },
    viewer: { role: "student", participantId: "p", displayName: "Эрнис", teamId: "t" },
    route: [
      { position: 0, title: "Старт", type: "start", hasTask: false, task: null },
      { position: 1, title: "Дроби", type: "checkpoint", hasTask: true, task: null },
      { position: 2, title: "Финиш", type: "finish", hasTask: false, task: null },
    ],
    currentTask: { id: "k", checkpointPosition: 1, type: "short_answer", question: "?", options: null, cooldownSeconds: 7 },
    teams: [{ id: "t", name: "Альфа", memberCount: 1, position: 2, score: 230, place: 1, finishOrder: 1, stats: null }],
    participants: [],
    studentCount: 1,
  };

  it("keeps score, place, finish order and the pause", () => {
    const lobby = parseLobby(base);
    expect(lobby.teams[0]).toMatchObject({ score: 230, place: 1, finishOrder: 1 });
    expect(lobby.currentTask?.cooldownSeconds).toBe(7);
  });

  it("reads a Stage 3 payload without scoring as zero points and no place", () => {
    const stage3 = {
      ...base,
      currentTask: { id: "k", checkpointPosition: 1, type: "short_answer", question: "?", options: null },
      teams: [{ id: "t", name: "Альфа", memberCount: 1, position: 0, stats: null }],
    };
    const lobby = parseLobby(stage3);
    expect(lobby.teams[0]).toMatchObject({ score: 0, place: null, finishOrder: null });
    expect(lobby.currentTask?.cooldownSeconds).toBe(0);
  });

  it("rejects impossible values", () => {
    const withTeam = (extra: object) => ({ ...base, teams: [{ ...base.teams[0], ...extra }] });
    expect(() => parseLobby(withTeam({ score: -5 }))).toThrow();
    expect(() => parseLobby(withTeam({ place: 0 }))).toThrow();
    expect(() => parseLobby(withTeam({ finishOrder: 1.5 }))).toThrow();
    expect(() => parseLobby({ ...base, currentTask: { ...base.currentTask, cooldownSeconds: -1 } })).toThrow();
  });
});
