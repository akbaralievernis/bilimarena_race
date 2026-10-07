import { describe, expect, it } from "vitest";
import type { LobbyTeam, RoutePoint } from "@/lib/race/lobby";
import { checkpointCount, pointLabel, pointName, teamProgress, teamsAt } from "@/lib/race/route";
import { validateCheckpointTitle, validateRoute } from "@/lib/race/validation";

const route: RoutePoint[] = [
  { position: 0, title: "Старт", type: "start", hasTask: false, task: null },
  { position: 1, title: "Дроби", type: "checkpoint", hasTask: false, task: null },
  { position: 2, title: "Проценты", type: "checkpoint", hasTask: false, task: null },
  { position: 3, title: "Финиш", type: "finish", hasTask: false, task: null },
];

const team = (id: string, position: number): LobbyTeam => ({
  id,
  name: id,
  memberCount: 1,
  position,
  score: 0,
  place: null,
  finishOrder: null,
  stats: null,
});

describe("route labels", () => {
  it("names START, checkpoints and FINISH", () => {
    expect(route.map(pointLabel)).toEqual(["Старт", "Чекпоинт 1", "Чекпоинт 2", "Финиш"]);
    expect(pointName(route[2])).toBe("Чекпоинт 2 · Проценты");
    expect(pointName(route[3])).toBe("Финиш");
    expect(checkpointCount(route)).toBe(2);
  });
});

describe("teamProgress", () => {
  it("starts at START with the first checkpoint next", () => {
    expect(teamProgress(route, 0)).toEqual({ current: route[0], next: route[1], finished: false, ratio: 0 });
  });

  it("offers exactly the next point", () => {
    expect(teamProgress(route, 1)?.next).toEqual(route[2]);
    expect(teamProgress(route, 2)?.next).toEqual(route[3]);
  });

  it("stops at FINISH", () => {
    expect(teamProgress(route, 3)).toEqual({ current: route[3], next: null, finished: true, ratio: 1 });
  });

  it("returns null for a position outside the route", () => {
    expect(teamProgress(route, 4)).toBeNull();
    expect(teamProgress(route, -1)).toBeNull();
  });

  it("groups teams by point", () => {
    const teams = [team("Альфа", 2), team("Бета", 1), team("Гамма", 2)];
    expect(teamsAt(teams, 2).map((t) => t.id)).toEqual(["Альфа", "Гамма"]);
    expect(teamsAt(teams, 0)).toEqual([]);
  });
});

describe("route validation", () => {
  it("accepts 1 to 20 checkpoints and cleans titles", () => {
    expect(validateRoute(["  Дроби ", "Проценты"])).toEqual({ ok: true, value: ["Дроби", "Проценты"] });
    expect(validateRoute(Array.from({ length: 20 }, (_, i) => `Точка ${i}`)).ok).toBe(true);
  });

  it("rejects an empty route and more than 20 checkpoints", () => {
    expect(validateRoute([])).toMatchObject({ ok: false, error: "Добавьте хотя бы один чекпоинт." });
    expect(validateRoute(Array.from({ length: 21 }, (_, i) => `Точка ${i}`))).toMatchObject({
      ok: false,
      error: "Максимум 20 чекпоинтов.",
    });
  });

  it("points at every empty or too long title", () => {
    expect(validateRoute(["Дроби", "  ", "x".repeat(61)])).toEqual({
      ok: false,
      itemErrors: { 1: "Введите название чекпоинта.", 2: "Название чекпоинта — максимум 60 символов." },
    });
  });

  it("counts characters, not UTF-16 units", () => {
    expect(validateCheckpointTitle("ү".repeat(60)).ok).toBe(true);
  });
});
