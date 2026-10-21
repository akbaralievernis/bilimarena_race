import { describe, expect, it } from "vitest";
import { ky } from "@/lib/i18n/messages/ky";
import { ru } from "@/lib/i18n/messages/ru";
import { diffRace, gaps } from "@/lib/race/events";
import type { LobbyTeam, RoutePoint } from "@/lib/race/lobby";
import { fanOffsets, layoutTrack, segmentPaths, smoothPath } from "@/lib/race/track";

const route: RoutePoint[] = [
  { position: 0, title: "Старт", type: "start", hasTask: false, task: null },
  { position: 1, title: "Дроби", type: "checkpoint", hasTask: true, task: null },
  { position: 2, title: "Проценты", type: "checkpoint", hasTask: true, task: null },
  { position: 3, title: "Финиш", type: "finish", hasTask: false, task: null },
];

const team = (id: string, position: number, score: number, place: number | null, finishOrder: number | null = null): LobbyTeam => ({
  id,
  name: id.toUpperCase(),
  memberCount: 2,
  position,
  score,
  place,
  finishOrder,
  stats: null,
});

describe("live race events", () => {
  it("reports nothing on the first snapshot or when nothing changed", () => {
    const teams = [team("a", 1, 100, 1), team("b", 0, 0, 2)];
    expect(diffRace([], teams, route)).toEqual([]);
    expect(diffRace(teams, teams, route)).toEqual([]);
  });

  it("reports a move, an overtake and a new leader", () => {
    const before = [team("a", 1, 120, 1), team("b", 1, 100, 2)];
    const after = [team("a", 1, 120, 2), team("b", 2, 230, 1)];
    expect(diffRace(before, after, route)).toEqual([
      { kind: "advance", teamId: "b", team: "B", position: 2 },
      { kind: "overtake", teamId: "b", team: "B", otherId: "a", other: "A" },
      { kind: "lead", teamId: "b", team: "B" },
    ]);
  });

  it("reports the finish with the order instead of a move", () => {
    const before = [team("a", 2, 200, 1)];
    const after = [team("a", 3, 400, 1, 1)];
    expect(diffRace(before, after, route)).toEqual([{ kind: "finish", teamId: "a", team: "A", order: 1 }]);
  });

  it("does not crown a leader on a tie", () => {
    const before = [team("a", 0, 0, 1), team("b", 0, 0, 1)];
    const after = [team("a", 1, 100, 1), team("b", 1, 100, 1)];
    expect(diffRace(before, after, route).some((event) => event.kind === "lead")).toBe(false);
  });

  it("counts the points to the team above and the lead over the team below", () => {
    const teams = [team("a", 2, 300, 1), team("b", 1, 250, 2), team("c", 1, 100, 3)];
    expect(gaps(teams, "a")).toEqual({ toAbove: null, overBelow: 50 });
    expect(gaps(teams, "b")).toEqual({ toAbove: 50, overBelow: 150 });
    expect(gaps(teams, "c")).toEqual({ toAbove: 150, overBelow: null });
    expect(gaps(teams, "x")).toEqual({ toAbove: null, overBelow: null });
  });

  it("speaks both languages", () => {
    expect(ru.live.advanced("Бүркүт", 2)).toBe("«Бүркүт» прошла чекпоинт 2");
    expect(ky.live.advanced("Бүркүт", 2)).toBe("«Бүркүт» 2-чекпоинттен өттү");
    expect(ru.live.leftToFinish(1)).toBe("До финиша: 1 чекпоинт");
    expect(ru.live.leftToFinish(3)).toBe("До финиша: 3 чекпоинта");
    expect(ru.live.toAbove(5)).toBe("До следующего места: 5 очков");
  });
});

describe("race track layout", () => {
  it("snakes row by row and stays inside the picture", () => {
    const layout = layoutTrack(10, 4);
    expect(layout.points).toHaveLength(10);
    expect(layout.segments).toHaveLength(9);
    // Row 1 runs right→left
    expect(layout.points[4].x).toBeGreaterThan(layout.points[7].x);
    for (const p of layout.points) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(layout.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(layout.height);
    }
  });

  it("builds the same road whole and in segments", () => {
    const points = layoutTrack(5, 3).points;
    const whole = smoothPath(points);
    const parts = segmentPaths(points);
    expect(whole.startsWith(`M${points[0].x} ${points[0].y}`)).toBe(true);
    for (const part of parts) expect(whole).toContain(part.slice(part.indexOf("C")));
  });

  it("fans out tokens that share a point", () => {
    expect(fanOffsets(1)).toEqual([{ x: 0, y: 0 }]);
    const fan = fanOffsets(3);
    expect(new Set(fan.map((p) => `${p.x},${p.y}`)).size).toBe(3);
  });
});
