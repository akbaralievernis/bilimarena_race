import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb } from "./harness";

/*
 * Stage 7: the race timer. The limit is the teacher's; once the time is up
 * the database refuses answers and moves, and any member may close the race.
 */

const TASKS = [
  { type: "single_choice", question: "2 + 2 = ?", options: ["3", "4", "5"], correctOption: 1 },
  { type: "short_answer", question: "Столица?", correctAnswer: "Бишкек" },
];

type Clock = { status: string; timeLimitSeconds: number | null; endsAt: string | null; remainingSeconds: number | null };
type Lobby = { race: Clock & { id: string }; teams: { id: string; position: number }[] };

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

async function timedRace(tasks: object[] | null = TASKS) {
  const teacher = await t.createUser({ displayName: "Учитель" });
  const raceId = await t.rpc<string>(teacher, "create_race", ["Таймер", null, ["A", "B"], tasks ? JSON.stringify(tasks) : null]);
  const [{ code }] = await t.admin<{ code: string }>("select code from public.races where id = $1", [raceId]);
  const team = await t.rpc<string>(teacher, "create_team", [raceId, "Альфа"]);
  const student = await t.createUser({ anonymous: true });
  await t.rpc(student, "join_race", [code, "Эрнис"]);
  const [{ id }] = await t.admin<{ id: string }>("select id from public.participants where user_id = $1", [student.id]);
  await t.rpc(teacher, "assign_participant", [id, team]);
  const taskIds = (
    await t.admin<{ id: string }>(
      `select k.id from public.checkpoint_tasks k join public.checkpoints c on c.id = k.checkpoint_id
       where k.race_id = $1 order by c.position`,
      [raceId],
    )
  ).map((row) => row.id);
  const lobby = (user = teacher) => t.rpc<Lobby>(user, "get_lobby", [raceId]);
  /** Moves the end into the past, as if the time had run out. */
  const timeUp = () =>
    t.admin("update public.races set started_at = now() - interval '2 hours', ends_at = now() - interval '1 second' where id = $1", [raceId]);
  return { teacher, student, raceId, team, taskIds, lobby, timeUp };
}

describe("setting the limit", () => {
  it("only the owner sets it, 1 to 120 minutes, and it shows in the lobby", async () => {
    const race = await timedRace();
    expect((await race.lobby()).race).toMatchObject({ timeLimitSeconds: null, endsAt: null, remainingSeconds: null });

    await t.rpc(race.teacher, "set_race_time_limit", [race.raceId, 600]);
    expect((await race.lobby(race.student)).race).toMatchObject({ timeLimitSeconds: 600, endsAt: null, remainingSeconds: null });

    for (const seconds of [59, 7201, 0, -60]) {
      await expectDbError(t.rpc(race.teacher, "set_race_time_limit", [race.raceId, seconds]), "invalid_time_limit");
    }
    await expectDbError(t.rpc(race.student, "set_race_time_limit", [race.raceId, 300]), "race_not_found");
    const stranger = await t.createUser();
    await expectDbError(t.rpc(stranger, "set_race_time_limit", [race.raceId, 300]), "race_not_found");

    await t.rpc(race.teacher, "set_race_time_limit", [race.raceId, null]);
    expect((await race.lobby()).race.timeLimitSeconds).toBeNull();
  });

  it("starts the clock with the race and counts down on the server's clock", async () => {
    const race = await timedRace();
    await t.rpc(race.teacher, "set_race_time_limit", [race.raceId, 900]);
    await t.rpc(race.teacher, "start_race", [race.raceId]);
    const { race: clock } = await race.lobby(race.student);
    expect(clock.status).toBe("running");
    expect(clock.remainingSeconds).toBeGreaterThan(890);
    expect(clock.remainingSeconds).toBeLessThanOrEqual(900);
    const [{ started_at, ends_at }] = await t.admin<{ started_at: Date; ends_at: Date }>(
      "select started_at, ends_at from public.races where id = $1",
      [race.raceId],
    );
    expect(ends_at.getTime() - started_at.getTime()).toBe(900_000);
  });

  it("can be extended or removed while running, but not set to a time already over", async () => {
    const race = await timedRace();
    await t.rpc(race.teacher, "set_race_time_limit", [race.raceId, 300]);
    await t.rpc(race.teacher, "start_race", [race.raceId]);
    await t.rpc(race.teacher, "set_race_time_limit", [race.raceId, 600]);
    expect((await race.lobby()).race.remainingSeconds).toBeGreaterThan(590);

    await t.admin("update public.races set started_at = now() - interval '20 minutes', ends_at = now() + interval '1 minute' where id = $1", [
      race.raceId,
    ]);
    await expectDbError(t.rpc(race.teacher, "set_race_time_limit", [race.raceId, 900]), "invalid_time_limit");

    await t.rpc(race.teacher, "set_race_time_limit", [race.raceId, null]);
    expect((await race.lobby()).race).toMatchObject({ timeLimitSeconds: null, endsAt: null, remainingSeconds: null });
  });

  it("cannot be changed after the race", async () => {
    const race = await timedRace();
    await t.rpc(race.teacher, "start_race", [race.raceId]);
    await t.rpc(race.teacher, "finish_race", [race.raceId]);
    await expectDbError(t.rpc(race.teacher, "set_race_time_limit", [race.raceId, 600]), "race_finished");
  });
});

describe("when the time is up", () => {
  it("answers and moves are refused and nothing is recorded", async () => {
    const race = await timedRace();
    await t.rpc(race.teacher, "set_race_time_limit", [race.raceId, 600]);
    await t.rpc(race.teacher, "start_race", [race.raceId]);
    await race.timeUp();

    await expectDbError(t.rpc(race.student, "submit_answer", [race.team, race.taskIds[0], "1"]), "race_time_over");
    await expectDbError(t.rpc(race.student, "submit_answer", [race.team, race.taskIds[0], "0"]), "race_time_over");
    const [{ count }] = await t.admin<{ count: number }>("select count(*)::int as count from public.task_submissions where race_id = $1", [
      race.raceId,
    ]);
    expect(count).toBe(0);
    expect((await race.lobby()).race.remainingSeconds).toBe(0);
    expect((await race.lobby()).teams[0].position).toBe(0);
  });

  it("button moves on a race without tasks are refused too", async () => {
    const race = await timedRace(null);
    await t.rpc(race.teacher, "set_race_time_limit", [race.raceId, 600]);
    await t.rpc(race.teacher, "start_race", [race.raceId]);
    await t.rpc(race.student, "advance_team", [race.team, 1]);
    await race.timeUp();
    await expectDbError(t.rpc(race.student, "advance_team", [race.team, 2]), "race_time_over");
  });

  it("any member closes the race once; finished_at is the planned end", async () => {
    const race = await timedRace();
    await t.rpc(race.teacher, "set_race_time_limit", [race.raceId, 600]);
    await t.rpc(race.teacher, "start_race", [race.raceId]);

    // Not yet: nothing happens.
    expect(await t.rpc<boolean>(race.student, "finish_expired_race", [race.raceId])).toBe(false);

    await race.timeUp();
    const stranger = await t.createUser();
    await expectDbError(t.rpc(stranger, "finish_expired_race", [race.raceId]), "race_not_found");
    await expectDbError(t.asAnon("select public.finish_expired_race($1)", [race.raceId]), "42501");

    expect(await t.rpc<boolean>(race.student, "finish_expired_race", [race.raceId])).toBe(true);
    expect(await t.rpc<boolean>(race.teacher, "finish_expired_race", [race.raceId])).toBe(false);

    const [{ status, finished_at, ends_at }] = await t.admin<{ status: string; finished_at: Date; ends_at: Date }>(
      "select status, finished_at, ends_at from public.races where id = $1",
      [race.raceId],
    );
    expect(status).toBe("finished");
    expect(finished_at.getTime()).toBe(ends_at.getTime());
    // A finished race says "finished", not "time over".
    await expectDbError(t.rpc(race.student, "submit_answer", [race.team, race.taskIds[0], "1"]), "race_finished");
  });

  it("a race without a limit never expires", async () => {
    const race = await timedRace();
    await t.rpc(race.teacher, "start_race", [race.raceId]);
    expect((await race.lobby()).race.remainingSeconds).toBeNull();
    expect(await t.rpc<boolean>(race.teacher, "finish_expired_race", [race.raceId])).toBe(false);
    await t.rpc(race.student, "submit_answer", [race.team, race.taskIds[0], "1"]);
    expect((await race.lobby()).teams[0].position).toBe(1);
  });
});

describe("the lobby snapshot keeps everything else", () => {
  it("get_lobby still checks access and returns the Stage 4 fields", async () => {
    const race = await timedRace();
    const stranger = await t.createUser();
    await expectDbError(t.rpc(stranger, "get_lobby", [race.raceId]), "race_not_found");
    const lobby = await t.rpc<Record<string, unknown>>(race.teacher, "get_lobby", [race.raceId]);
    expect(Object.keys(lobby).sort()).toEqual(["currentTask", "participants", "race", "route", "studentCount", "teams", "viewer"]);
    // The old function is not callable from outside.
    await expectDbError(t.rpc(race.teacher, "get_lobby_v4", [race.raceId]), "42883");
  });
});
