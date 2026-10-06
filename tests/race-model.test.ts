import { describe, expect, it } from "vitest";
import { plural, PARTICIPANT_FORMS } from "@/lib/format";
import {
  DATABASE_NOT_READY_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  UNKNOWN_ERROR_MESSAGE,
  authErrorMessage,
  isNetworkError,
  raceErrorCode,
  raceErrorMessage,
} from "@/lib/race/errors";
import { parseLobby } from "@/lib/race/lobby";
import { RACE_STATUSES, canTransition, isJoinable, isRaceStatus } from "@/lib/race/status";
import { safeNextPath } from "@/lib/safe-redirect";

describe("race status transitions", () => {
  it("matches the database rule private.can_transition()", () => {
    const allowed = RACE_STATUSES.flatMap((from) =>
      RACE_STATUSES.filter((to) => canTransition(from, to)).map((to) => `${from}→${to}`),
    );
    // Same list is asserted against the SQL function in tests/db/races.test.ts.
    expect(allowed.sort()).toEqual(["draft→lobby", "lobby→finished", "lobby→running", "running→finished"]);
  });

  it("never allows going back or skipping the lobby", () => {
    expect(canTransition("running", "lobby")).toBe(false);
    expect(canTransition("finished", "running")).toBe(false);
    expect(canTransition("draft", "running")).toBe(false);
  });

  it("knows which races accept new students", () => {
    expect(RACE_STATUSES.filter(isJoinable)).toEqual(["lobby", "running"]);
    expect(isRaceStatus("paused")).toBe(false);
  });
});

describe("error messages", () => {
  it("maps database codes to UI texts", () => {
    const error = { code: "P0001", message: "race_not_found" };
    expect(raceErrorCode(error)).toBe("race_not_found");
    expect(raceErrorMessage(error)).toBe("Гонка с таким кодом не найдена.");
    expect(raceErrorMessage({ message: "race_finished" })).toBe("Эта гонка уже завершена.");
  });

  it("supports screen-specific overrides", () => {
    expect(raceErrorMessage({ message: "race_not_found" }, { race_not_found: "Нет доступа" })).toBe("Нет доступа");
  });

  it("never shows raw database errors", () => {
    const raw = { code: "42501", message: 'permission denied for table "races"' };
    expect(raceErrorCode(raw)).toBeNull();
    expect(raceErrorMessage(raw)).toBe(UNKNOWN_ERROR_MESSAGE);
    expect(raceErrorMessage(null)).toBe(UNKNOWN_ERROR_MESSAGE);
  });

  it("explains a project without applied migrations", () => {
    const missingFunction = { code: "PGRST202", message: "Could not find the function public.get_lobby(p_race_id)" };
    expect(raceErrorMessage(missingFunction)).toBe(DATABASE_NOT_READY_MESSAGE);
    expect(raceErrorMessage({ code: "PGRST205", message: "Could not find the table 'public.races'" })).toBe(
      DATABASE_NOT_READY_MESSAGE,
    );
  });

  it("recognizes network failures from fetch and supabase-js", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError({ message: "TypeError: fetch failed" })).toBe(true);
    expect(isNetworkError({ name: "AuthRetryableFetchError", message: "" })).toBe(true);
    expect(raceErrorMessage({ message: "fetch failed" })).toBe(NETWORK_ERROR_MESSAGE);
    expect(isNetworkError({ message: "race_not_found" })).toBe(false);
  });

  it("maps auth error codes", () => {
    expect(authErrorMessage({ code: "invalid_credentials" })).toBe("Неверный email или пароль.");
    expect(authErrorMessage({ code: "something_new" })).toBe(UNKNOWN_ERROR_MESSAGE);
  });
});

describe("parseLobby", () => {
  const valid = {
    race: {
      id: "r1",
      code: "A7K9Q2",
      title: "Гонка",
      description: null,
      status: "lobby",
      startedAt: null,
      finishedAt: null,
    },
    viewer: { role: "student", participantId: "p1", displayName: "Эрнис", teamId: null },
    // Stage 2: get_lobby() also returns the route and every team position.
    // Stage 3: points carry hasTask/task, teams carry teacher-only stats.
    route: [
      { position: 0, title: "Старт", type: "start", hasTask: false, task: null },
      { position: 1, title: "Дроби", type: "checkpoint", hasTask: true, task: null },
      { position: 2, title: "Финиш", type: "finish", hasTask: false, task: null },
    ],
    currentTask: null,
    teams: [{ id: "t1", name: "Альфа", memberCount: 0, position: 0, stats: null }],
    participants: [{ id: "p1", displayName: "Эрнис", teamId: null }],
    studentCount: 1,
  };

  it("accepts the get_lobby() payload", () => {
    expect(parseLobby(valid)).toEqual(valid);
  });

  it("drops unexpected fields instead of passing them to the UI", () => {
    const withExtra = { ...valid, participants: [{ ...valid.participants[0], userId: "secret" }] };
    expect(parseLobby(withExtra).participants[0]).not.toHaveProperty("userId");
  });

  it("rejects malformed payloads", () => {
    expect(() => parseLobby(null)).toThrow("invalid_lobby_payload");
    expect(() => parseLobby({ ...valid, race: { ...valid.race, status: "paused" } })).toThrow();
    expect(() => parseLobby({ ...valid, viewer: { ...valid.viewer, role: "admin" } })).toThrow();
    expect(() => parseLobby({ ...valid, teams: [{ id: 1 }] })).toThrow();
  });

  it("rejects a route out of order or with unknown point types", () => {
    const [start, checkpoint, finish] = valid.route;
    expect(() => parseLobby({ ...valid, route: [start, finish, checkpoint] })).toThrow("invalid_lobby_payload");
    expect(() => parseLobby({ ...valid, route: [start, { ...checkpoint, type: "bonus" }, finish] })).toThrow();
    expect(() => parseLobby({ ...valid, route: undefined })).toThrow();
  });

  it("rejects negative or fractional team positions", () => {
    expect(() => parseLobby({ ...valid, teams: [{ ...valid.teams[0], position: -1 }] })).toThrow();
    expect(() => parseLobby({ ...valid, teams: [{ ...valid.teams[0], position: 1.5 }] })).toThrow();
  });
});

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/create")).toBe("/create");
    expect(safeNextPath("/race/abc/lobby")).toBe("/race/abc/lobby");
  });

  it("rejects open redirects", () => {
    for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null]) {
      expect(safeNextPath(value)).toBe("/create");
    }
  });
});

describe("plural", () => {
  it("picks Russian plural forms", () => {
    expect([1, 2, 5, 11, 21, 22, 25, 111].map((n) => `${n} ${plural(n, PARTICIPANT_FORMS)}`)).toEqual([
      "1 участник",
      "2 участника",
      "5 участников",
      "11 участников",
      "21 участник",
      "22 участника",
      "25 участников",
      "111 участников",
    ]);
  });
});
