import { describe, expect, it } from "vitest";
import { parseLobby } from "@/lib/race/lobby";
import { EXTEND_SECONDS, TIME_LIMIT_MAX_SECONDS, extendedLimit, formatClock, minutesLabel } from "@/lib/race/timer";

describe("timer formatting", () => {
  it("shows minutes and seconds, hours only when needed", () => {
    expect([0, 9, 75, 600, 3599, 3725, -5].map(formatClock)).toEqual(["0:00", "0:09", "1:15", "10:00", "59:59", "1:02:05", "0:00"]);
  });

  it("declines «минута»", () => {
    expect([60, 120, 300, 660, 1260, 1320, 5400].map(minutesLabel)).toEqual([
      "1 минута",
      "2 минуты",
      "5 минут",
      "11 минут",
      "21 минута",
      "22 минуты",
      "90 минут",
    ]);
  });

  it("adds five minutes up to the maximum the database accepts", () => {
    expect(extendedLimit(600)).toBe(600 + EXTEND_SECONDS);
    expect(extendedLimit(TIME_LIMIT_MAX_SECONDS - EXTEND_SECONDS)).toBe(TIME_LIMIT_MAX_SECONDS);
    expect(extendedLimit(TIME_LIMIT_MAX_SECONDS - 60)).toBeNull();
  });
});

describe("parseLobby with the Stage 7 clock", () => {
  const base = {
    race: { id: "r", code: "A7K9Q2", title: "Гонка", description: null, status: "running", startedAt: null, finishedAt: null },
    viewer: { role: "student", participantId: "p", displayName: "Эрнис", teamId: null },
    route: [],
    currentTask: null,
    teams: [],
    participants: [],
    studentCount: 1,
  };
  const withClock = (clock: object) => ({ ...base, race: { ...base.race, ...clock } });

  it("reads the limit, the end and the time left", () => {
    const lobby = parseLobby(withClock({ timeLimitSeconds: 900, endsAt: "2026-10-10T09:15:00Z", remainingSeconds: 412 }));
    expect(lobby.race).toMatchObject({ timeLimitSeconds: 900, endsAt: "2026-10-10T09:15:00Z", remainingSeconds: 412 });
  });

  it("an older database without a timer means no timer", () => {
    expect(parseLobby(base).race).toMatchObject({ timeLimitSeconds: null, endsAt: null, remainingSeconds: null });
  });

  it("rejects impossible values", () => {
    expect(() => parseLobby(withClock({ timeLimitSeconds: 0 }))).toThrow();
    expect(() => parseLobby(withClock({ remainingSeconds: -1 }))).toThrow();
    expect(() => parseLobby(withClock({ endsAt: 5 }))).toThrow();
  });
});
