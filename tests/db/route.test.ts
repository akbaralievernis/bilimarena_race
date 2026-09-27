import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb, type TestUser } from "./harness";

const PERMISSION_DENIED = "42501";

type RoutePoint = { position: number; title: string; type: string };
type Move = { teamId: string; position: number; finished: boolean; moved: boolean };

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

async function routeOf(raceId: string) {
  return t.admin<RoutePoint>(
    "select position, title, type::text from public.checkpoints where race_id = $1 order by position",
    [raceId],
  );
}

async function positionOf(teamId: string) {
  const [row] = await t.admin<{ current_position: number }>(
    "select current_position from public.teams where id = $1",
    [teamId],
  );
  return row.current_position;
}

/** A running race with route [A, B, C] and two teams with one student each. */
async function runningRace() {
  const teacher = await t.createUser({ displayName: "Учитель" });
  const raceId = await t.rpc<string>(teacher, "create_race", ["Маршрутная гонка", null, ["A", "B", "C"]]);
  const [{ code }] = await t.admin<{ code: string }>("select code from public.races where id = $1", [raceId]);
  const alpha = await t.rpc<string>(teacher, "create_team", [raceId, "Альфа"]);
  const beta = await t.rpc<string>(teacher, "create_team", [raceId, "Бета"]);

  const seat = async (name: string, teamId: string) => {
    const user = await t.createUser({ anonymous: true });
    await t.rpc(user, "join_race", [code, name]);
    const [{ id }] = await t.admin<{ id: string }>("select id from public.participants where user_id = $1", [
      user.id,
    ]);
    await t.rpc(teacher, "assign_participant", [id, teamId]);
    return user;
  };
  const alphaStudent = await seat("Эрнис", alpha);
  const betaStudent = await seat("Алина", beta);
  await t.rpc(teacher, "start_race", [raceId]);
  return { teacher, raceId, code, alpha, beta, alphaStudent, betaStudent };
}

describe("route creation", () => {
  it("stores START, the checkpoints in the given order and FINISH", async () => {
    const teacher = await t.createUser();
    const raceId = await t.rpc<string>(teacher, "create_race", [
      "Математика",
      null,
      ["  Дроби ", "Проценты", "Уравнения"],
    ]);

    expect(await routeOf(raceId)).toEqual([
      { position: 0, title: "Старт", type: "start" },
      { position: 1, title: "Дроби", type: "checkpoint" },
      { position: 2, title: "Проценты", type: "checkpoint" },
      { position: 3, title: "Уравнения", type: "checkpoint" },
      { position: 4, title: "Финиш", type: "finish" },
    ]);
  });

  it("accepts 1 and 20 checkpoints", async () => {
    const teacher = await t.createUser();
    const one = await t.rpc<string>(teacher, "create_race", ["Одна точка", null, ["Единственная"]]);
    expect((await routeOf(one)).map((point) => point.type)).toEqual(["start", "checkpoint", "finish"]);

    const titles = Array.from({ length: 20 }, (_, index) => `Точка ${index + 1}`);
    const twenty = await t.rpc<string>(teacher, "create_race", ["Двадцать точек", null, titles]);
    expect(await routeOf(twenty)).toHaveLength(22);
  });

  it("rejects an empty route and more than 20 checkpoints", async () => {
    const teacher = await t.createUser();
    await expectDbError(t.rpc(teacher, "create_race", ["Пусто", null, []]), "invalid_route");
    const tooMany = Array.from({ length: 21 }, (_, index) => `Точка ${index + 1}`);
    await expectDbError(t.rpc(teacher, "create_race", ["Много", null, tooMany]), "invalid_route");
  });

  it("rejects empty, blank, null and too long checkpoint titles", async () => {
    const teacher = await t.createUser();
    for (const titles of [[""], ["   "], ["A", null], ["x".repeat(61)], ["Точка\u0007"]]) {
      await expectDbError(t.rpc(teacher, "create_race", ["Плохой маршрут", null, titles]), "invalid_checkpoint_title");
    }
    const [{ count }] = await t.admin<{ count: number }>(
      "select count(*)::int as count from public.races where title = 'Плохой маршрут'",
    );
    expect(count).toBe(0);
  });

  it("keeps the Stage 1 call working with a default route", async () => {
    const teacher = await t.createUser();
    const raceId = await t.rpc<string>(teacher, "create_race", ["Без маршрута", null]);
    expect((await routeOf(raceId)).map((point) => point.title)).toEqual([
      "Старт",
      "Чекпоинт 1",
      "Чекпоинт 2",
      "Чекпоинт 3",
      "Финиш",
    ]);
  });

  it("rejects duplicate positions in a race", async () => {
    const teacher = await t.createUser();
    const raceId = await t.rpc<string>(teacher, "create_race", ["Дубли", null, ["A"]]);
    await expectDbError(
      t.admin("insert into public.checkpoints (race_id, position, title, type) values ($1, 1, 'Клон', 'checkpoint')", [
        raceId,
      ]),
      "23505",
    );
  });

  it("keeps the route whole even for privileged writes", async () => {
    const teacher = await t.createUser();
    const raceId = await t.rpc<string>(teacher, "create_race", ["Целостность", null, ["A", "B"]]);

    // A gap in the middle.
    await expectDbError(t.admin("delete from public.checkpoints where race_id = $1 and position = 1", [raceId]), "invalid_route");
    // A point after FINISH.
    await expectDbError(
      t.admin("insert into public.checkpoints (race_id, position, title, type) values ($1, 4, 'После финиша', 'checkpoint')", [
        raceId,
      ]),
      "invalid_route",
    );
    // A race without a route.
    await expectDbError(
      t.admin("insert into public.races (code, title, created_by) values ('ZZZZZZ', 'Без маршрута', $1)", [teacher.id]),
      "invalid_route",
    );
    expect(await routeOf(raceId)).toHaveLength(4);
  });
});

describe("team movement", () => {
  let race: Awaited<ReturnType<typeof runningRace>>;

  beforeAll(async () => {
    race = await runningRace();
  });

  it("teams start at START", async () => {
    expect(await positionOf(race.alpha)).toBe(0);
    expect(await positionOf(race.beta)).toBe(0);
  });

  it("moves 0 → 1 → 2 one point at a time", async () => {
    expect(await t.rpc<Move>(race.alphaStudent, "advance_team", [race.alpha, 1])).toEqual({
      teamId: race.alpha,
      position: 1,
      finished: false,
      moved: true,
    });
    expect(await t.rpc<Move>(race.alphaStudent, "advance_team", [race.alpha, 2])).toMatchObject({ position: 2 });
    expect(await positionOf(race.alpha)).toBe(2);
  });

  it("refuses to skip a point or go back", async () => {
    await expectDbError(t.rpc(race.betaStudent, "advance_team", [race.beta, 2]), "invalid_move"); // 0 → 2
    await expectDbError(t.rpc(race.alphaStudent, "advance_team", [race.alpha, 1]), "invalid_move"); // 2 → 1
    await expectDbError(t.rpc(race.alphaStudent, "advance_team", [race.alpha, -1]), "invalid_move");
    await expectDbError(t.rpc(race.alphaStudent, "advance_team", [race.alpha, null]), "invalid_move");
    expect(await positionOf(race.beta)).toBe(0);
    expect(await positionOf(race.alpha)).toBe(2);
  });

  it("treats a repeated request as a no-op, so a double click never skips", async () => {
    await t.rpc(race.betaStudent, "advance_team", [race.beta, 1]);
    expect(await t.rpc<Move>(race.betaStudent, "advance_team", [race.beta, 1])).toMatchObject({
      position: 1,
      moved: false,
    });
    expect(await positionOf(race.beta)).toBe(1);
  });

  it("reaches FINISH and then stops", async () => {
    await t.rpc(race.alphaStudent, "advance_team", [race.alpha, 3]);
    expect(await t.rpc<Move>(race.alphaStudent, "advance_team", [race.alpha, 4])).toMatchObject({
      position: 4,
      finished: true,
      moved: true,
    });
    await expectDbError(t.rpc(race.alphaStudent, "advance_team", [race.alpha, 5]), "team_finished");
    expect(await positionOf(race.alpha)).toBe(4);
  });

  it("a student cannot move another team", async () => {
    await expectDbError(t.rpc(race.alphaStudent, "advance_team", [race.beta, 2]), "team_not_found");
    expect(await positionOf(race.beta)).toBe(1);
  });

  it("the teacher, outsiders and students without a team cannot move teams", async () => {
    await expectDbError(t.rpc(race.teacher, "advance_team", [race.beta, 2]), "team_not_found");
    const outsider = await t.createUser({ anonymous: true });
    await expectDbError(t.rpc(outsider, "advance_team", [race.beta, 2]), "team_not_found");
    const unassigned = await t.createUser({ anonymous: true });
    await t.rpc(unassigned, "join_race", [race.code, "Без команды"]);
    await expectDbError(t.rpc(unassigned, "advance_team", [race.beta, 2]), "team_not_found");
    expect(await positionOf(race.beta)).toBe(1);
  });

  it("follows a student to their new team", async () => {
    const [{ id }] = await t.admin<{ id: string }>("select id from public.participants where user_id = $1", [
      race.betaStudent.id,
    ]);
    await t.rpc(race.teacher, "assign_participant", [id, race.alpha]);
    await expectDbError(t.rpc(race.betaStudent, "advance_team", [race.beta, 2]), "team_not_found");
    await t.rpc(race.teacher, "assign_participant", [id, race.beta]);
  });

  it("is allowed only while the race is running", async () => {
    const lobbyTeacher = await t.createUser();
    const lobbyRace = await t.rpc<string>(lobbyTeacher, "create_race", ["Ещё не начата", null, ["A"]]);
    const [{ code }] = await t.admin<{ code: string }>("select code from public.races where id = $1", [lobbyRace]);
    const team = await t.rpc<string>(lobbyTeacher, "create_team", [lobbyRace, "Команда"]);
    const student = await t.createUser({ anonymous: true });
    await t.rpc(student, "join_race", [code, "Эрнис"]);
    const [{ id }] = await t.admin<{ id: string }>("select id from public.participants where user_id = $1", [
      student.id,
    ]);
    await t.rpc(lobbyTeacher, "assign_participant", [id, team]);

    await expectDbError(t.rpc(student, "advance_team", [team, 1]), "race_not_started");
    await t.rpc(lobbyTeacher, "start_race", [lobbyRace]);
    await t.rpc(student, "advance_team", [team, 1]);
    await t.rpc(lobbyTeacher, "finish_race", [lobbyRace]);
    await expectDbError(t.rpc(student, "advance_team", [team, 2]), "race_finished");
    expect(await positionOf(team)).toBe(1);
  });
});

describe("route and position security", () => {
  let race: Awaited<ReturnType<typeof runningRace>>;
  let outsider: TestUser;

  beforeAll(async () => {
    race = await runningRace();
    outsider = await t.createUser({ anonymous: true });
  });

  it("blocks direct UPDATE of a team position, even for the owner", async () => {
    for (const user of [race.alphaStudent, race.teacher]) {
      await expectDbError(
        t.as(user, "update public.teams set current_position = 3 where id = $1", [race.alpha]),
        PERMISSION_DENIED,
      );
    }
    expect(await positionOf(race.alpha)).toBe(0);
  });

  it("blocks direct writes to the route", async () => {
    for (const user of [race.teacher, race.alphaStudent, outsider]) {
      await expectDbError(
        t.as(user, "insert into public.checkpoints (race_id, position, title, type) values ($1, 9, 'X', 'checkpoint')", [
          race.raceId,
        ]),
        PERMISSION_DENIED,
      );
      await expectDbError(
        t.as(user, "update public.checkpoints set title = 'Взлом' where race_id = $1", [race.raceId]),
        PERMISSION_DENIED,
      );
      await expectDbError(t.as(user, "delete from public.checkpoints where race_id = $1", [race.raceId]), PERMISSION_DENIED);
    }
  });

  it("another teacher cannot touch this race", async () => {
    const stranger = await t.createUser();
    await expectDbError(t.rpc(stranger, "start_race", [race.raceId]), "race_not_found");
    await expectDbError(t.rpc(stranger, "finish_race", [race.raceId]), "race_not_found");
    await expectDbError(t.rpc(stranger, "advance_team", [race.alpha, 1]), "team_not_found");
    expect(await t.as(stranger, "select id from public.checkpoints where race_id = $1", [race.raceId])).toEqual([]);
  });

  it("only race members can read the route", async () => {
    expect(await t.as(outsider, "select id from public.checkpoints")).toEqual([]);
    expect(await t.as(race.alphaStudent, "select id from public.checkpoints where race_id = $1", [race.raceId])).toHaveLength(5);
    expect(await t.as(race.teacher, "select id from public.checkpoints where race_id = $1", [race.raceId])).toHaveLength(5);
    await expectDbError(t.asAnon("select id from public.checkpoints"), PERMISSION_DENIED);
  });

  it("get_lobby shows the route and every team position to members only", async () => {
    await t.rpc(race.betaStudent, "advance_team", [race.beta, 1]);

    type Lobby = { route: RoutePoint[]; teams: { name: string; position: number }[] };
    const view = await t.rpc<Lobby>(race.alphaStudent, "get_lobby", [race.raceId]);
    expect(view.route.map((point) => point.title)).toEqual(["Старт", "A", "B", "C", "Финиш"]);
    expect(view.teams.map((team) => [team.name, team.position])).toEqual([
      ["Альфа", 0],
      ["Бета", 1],
    ]);
    await expectDbError(t.rpc(outsider, "get_lobby", [race.raceId]), "race_not_found");
  });

  it("announces a move on the race channel without data", async () => {
    await t.admin("delete from realtime.messages");
    await t.rpc(race.alphaStudent, "advance_team", [race.alpha, 1]);
    const messages = await t.admin<{ topic: string; payload: unknown }>("select topic, payload from realtime.messages");
    expect(messages).toEqual([{ topic: `race:${race.raceId}`, payload: { table: "teams", op: "update" } }]);
  });

  it("a finished race can no longer change", async () => {
    await t.rpc(race.teacher, "finish_race", [race.raceId]);
    await expectDbError(t.rpc(race.alphaStudent, "advance_team", [race.alpha, 2]), "race_finished");
    await expectDbError(t.rpc(race.teacher, "create_team", [race.raceId, "Поздняя"]), "race_finished");
    await expectDbError(t.rpc(race.teacher, "start_race", [race.raceId]), "invalid_status_transition");
  });
});

describe("migrating a project with Stage 1 data", () => {
  it("gives existing races the default route and teams position 0", async () => {
    const legacy = await createTestDb({ until: "20260927100200" });
    const teacher = await legacy.createUser();
    const raceId = await legacy.rpc<string>(teacher, "create_race", ["Старая гонка"]);
    const teamId = await legacy.rpc<string>(teacher, "create_team", [raceId, "Старая команда"]);

    await legacy.applyPendingMigrations();

    const route = await legacy.admin<RoutePoint>(
      "select position, title, type::text from public.checkpoints where race_id = $1 order by position",
      [raceId],
    );
    expect(route.map((point) => point.type)).toEqual(["start", "checkpoint", "checkpoint", "checkpoint", "finish"]);
    const [team] = await legacy.admin<{ current_position: number }>(
      "select current_position from public.teams where id = $1",
      [teamId],
    );
    expect(team.current_position).toBe(0);
  });
});
