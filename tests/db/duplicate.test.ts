import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb } from "./harness";

/*
 * Stage 9: duplicate_race() — the owner runs a race again for another class.
 */

const TASKS = [
  { type: "single_choice", question: "2 + 2 = ?", options: ["3", "4", "5"], correctOption: 1 },
  { type: "short_answer", question: "Столица?", correctAnswer: "Бишкек" },
];

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

async function playedRace() {
  const teacher = await t.createUser({ displayName: "Учитель" });
  const raceId = await t.rpc<string>(teacher, "create_race", ["Бөлчөктөр — 6А", "Тема: бөлчөктөр", ["Арифметика", "География"], JSON.stringify(TASKS)]);
  const [{ code }] = await t.admin<{ code: string }>("select code from public.races where id = $1", [raceId]);
  await t.rpc(teacher, "set_race_time_limit", [raceId, 900]);
  const alpha = await t.rpc<string>(teacher, "create_team", [raceId, "Альфа"]);
  await t.rpc(teacher, "create_team", [raceId, "Бета"]);
  const student = await t.createUser({ anonymous: true });
  await t.rpc(student, "join_race", [code, "Эрнис"]);
  const [{ id }] = await t.admin<{ id: string }>("select id from public.participants where user_id = $1", [student.id]);
  await t.rpc(teacher, "assign_participant", [id, alpha]);
  await t.rpc(teacher, "start_race", [raceId]);
  const [task] = await t.admin<{ id: string }>(
    "select k.id from public.checkpoint_tasks k join public.checkpoints c on c.id = k.checkpoint_id where k.race_id = $1 order by c.position",
    [raceId],
  );
  await t.rpc(student, "submit_answer", [alpha, task.id, "1"]);
  await t.rpc(teacher, "finish_race", [raceId]);
  return { teacher, student, raceId, code };
}

describe("duplicate_race", () => {
  it("creates a fresh race in the lobby with a new code and the same content", async () => {
    const race = await playedRace();
    const copyId = await t.rpc<string>(race.teacher, "duplicate_race", [race.raceId]);
    expect(copyId).not.toBe(race.raceId);

    const [copy] = await t.admin<{ code: string; title: string; description: string; status: string; time_limit_seconds: number; started_at: Date | null }>(
      "select code, title, description, status, time_limit_seconds, started_at from public.races where id = $1",
      [copyId],
    );
    expect(copy).toMatchObject({ title: "Бөлчөктөр — 6А", description: "Тема: бөлчөктөр", status: "lobby", time_limit_seconds: 900, started_at: null });
    expect(copy.code).not.toBe(race.code);

    const route = await t.admin<{ position: number; title: string; type: string }>(
      "select position, title, type from public.checkpoints where race_id = $1 order by position",
      [copyId],
    );
    expect(route.map((point) => point.title)).toEqual(["Старт", "Арифметика", "География", "Финиш"]);

    const teams = await t.admin<{ name: string; current_position: number }>(
      "select name, current_position from public.teams where race_id = $1 order by created_at",
      [copyId],
    );
    expect(teams).toEqual([
      { name: "Альфа", current_position: 0 },
      { name: "Бета", current_position: 0 },
    ]);
  });

  it("copies tasks with their correct answers, but no students, answers or results", async () => {
    const race = await playedRace();
    const copyId = await t.rpc<string>(race.teacher, "duplicate_race", [race.raceId]);
    const keys = await t.admin<{ type: string; question: string; options: string[] | null; correct_option: number | null; correct_answer: string | null }>(
      `select k.type, k.question, k.options, key.correct_option, key.correct_answer
       from public.checkpoint_tasks k
       join public.checkpoints c on c.id = k.checkpoint_id
       join private.checkpoint_task_keys key on key.task_id = k.id
       where k.race_id = $1 order by c.position`,
      [copyId],
    );
    expect(keys).toEqual([
      { type: "single_choice", question: "2 + 2 = ?", options: ["3", "4", "5"], correct_option: 1, correct_answer: null },
      { type: "short_answer", question: "Столица?", options: null, correct_option: null, correct_answer: "Бишкек" },
    ]);
    const [{ students, answers, passes }] = await t.admin<{ students: number; answers: number; passes: number }>(
      `select (select count(*)::int from public.participants where race_id = $1 and role = 'student') as students,
              (select count(*)::int from public.task_submissions where race_id = $1) as answers,
              (select count(*)::int from public.team_passes where race_id = $1) as passes`,
      [copyId],
    );
    expect({ students, answers, passes }).toEqual({ students: 0, answers: 0, passes: 0 });
  });

  it("copies a race without tasks as a route only", async () => {
    const teacher = await t.createUser();
    const raceId = await t.rpc<string>(teacher, "create_race", ["Кнопки", null, ["A", "B"]]);
    const copyId = await t.rpc<string>(teacher, "duplicate_race", [raceId]);
    const [{ tasks, checkpoints }] = await t.admin<{ tasks: number; checkpoints: number }>(
      `select (select count(*)::int from public.checkpoint_tasks where race_id = $1) as tasks,
              (select count(*)::int from public.checkpoints where race_id = $1 and type = 'checkpoint') as checkpoints`,
      [copyId],
    );
    expect({ tasks, checkpoints }).toEqual({ tasks: 0, checkpoints: 2 });
  });

  it("only the owner can copy; the answers stay secret from everyone else", async () => {
    const race = await playedRace();
    const stranger = await t.createUser();
    await expectDbError(t.rpc(stranger, "duplicate_race", [race.raceId]), "race_not_found");
    await expectDbError(t.rpc(race.student, "duplicate_race", [race.raceId]), "race_not_found");
    await expectDbError(t.asAnon("select public.duplicate_race($1)", [race.raceId]), "42501");
    // A student of the copy cannot read the keys either.
    const copyId = await t.rpc<string>(race.teacher, "duplicate_race", [race.raceId]);
    const lobby = await t.rpc<Record<string, unknown>>(race.teacher, "get_lobby", [copyId]);
    expect(JSON.stringify(lobby)).not.toContain("Бишкек");
  });
});
