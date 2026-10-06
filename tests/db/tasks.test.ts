import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb, type TestUser } from "./harness";

const PERMISSION_DENIED = "42501";

type Answer = { correct: boolean | null; moved: boolean; alreadyPassed: boolean; position: number; finished: boolean };

const SHORT_SECRET = "Секретный ответ Ыё";
const TASKS = [
  { type: "single_choice", question: "2 + 2 = ?", options: ["3", "4", "5"], correctOption: 1 },
  { type: "short_answer", question: "Столица Кыргызстана?", correctAnswer: "Бишкек" },
  { type: "short_answer", question: "Секретный вопрос", correctAnswer: SHORT_SECRET },
];

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

async function positionOf(teamId: string) {
  const [row] = await t.admin<{ current_position: number }>("select current_position from public.teams where id = $1", [
    teamId,
  ]);
  return row.current_position;
}

/** Running race [A, B, C] with TASKS, team Альфа (2 students) and team Бета (1 student). */
async function taskRace(options: { start?: boolean } = {}) {
  const teacher = await t.createUser({ displayName: "Учитель" });
  const raceId = await t.rpc<string>(teacher, "create_race", ["Задания", null, ["A", "B", "C"], JSON.stringify(TASKS)]);
  const [{ code }] = await t.admin<{ code: string }>("select code from public.races where id = $1", [raceId]);
  const alpha = await t.rpc<string>(teacher, "create_team", [raceId, "Альфа"]);
  const beta = await t.rpc<string>(teacher, "create_team", [raceId, "Бета"]);

  const seat = async (name: string, teamId: string) => {
    const user = await t.createUser({ anonymous: true });
    await t.rpc(user, "join_race", [code, name]);
    const [{ id }] = await t.admin<{ id: string }>("select id from public.participants where user_id = $1", [user.id]);
    await t.rpc(teacher, "assign_participant", [id, teamId]);
    return user;
  };
  const alice = await seat("Эрнис", alpha);
  const alicesMate = await seat("Алина", alpha);
  const bob = await seat("Бекзат", beta);
  if (options.start !== false) await t.rpc(teacher, "start_race", [raceId]);

  const tasks = await t.admin<{ id: string; position: number }>(
    `select k.id, c.position from public.checkpoint_tasks k
     join public.checkpoints c on c.id = k.checkpoint_id where k.race_id = $1 order by c.position`,
    [raceId],
  );
  return { teacher, raceId, code, alpha, beta, alice, alicesMate, bob, taskIds: tasks.map((task) => task.id) };
}

const submit = (user: TestUser, teamId: string, taskId: string, answer: string) =>
  t.rpc<Answer>(user, "submit_answer", [teamId, taskId, answer]);

describe("creating tasks", () => {
  it("stores one task per checkpoint and keeps the answers in the private schema", async () => {
    const { raceId } = await taskRace({ start: false });
    const rows = await t.admin<{ position: number; type: string; question: string; options: string[] | null }>(
      `select c.position, k.type::text, k.question, k.options from public.checkpoint_tasks k
       join public.checkpoints c on c.id = k.checkpoint_id where k.race_id = $1 order by c.position`,
      [raceId],
    );
    expect(rows).toEqual([
      { position: 1, type: "single_choice", question: "2 + 2 = ?", options: ["3", "4", "5"] },
      { position: 2, type: "short_answer", question: "Столица Кыргызстана?", options: null },
      { position: 3, type: "short_answer", question: "Секретный вопрос", options: null },
    ]);
    const keys = await t.admin<{ correct_option: number | null; correct_answer: string | null }>(
      `select k.correct_option, k.correct_answer from private.checkpoint_task_keys k
       join public.checkpoint_tasks x on x.id = k.task_id where x.race_id = $1 order by x.created_at`,
      [raceId],
    );
    expect(keys).toHaveLength(3);
  });

  it("rejects malformed tasks and partially tasked routes", async () => {
    const teacher = await t.createUser();
    const create = (tasks: unknown, titles = ["A"]) =>
      t.rpc(teacher, "create_race", ["Плохие задания", null, titles, JSON.stringify(tasks)]);
    const choice = (extra: object) => ({ type: "single_choice", question: "Вопрос?", options: ["a", "b"], correctOption: 0, ...extra });
    const short = (extra: object) => ({ type: "short_answer", question: "Вопрос?", correctAnswer: "да", ...extra });

    await expectDbError(create([]), "invalid_tasks"); // fewer tasks than checkpoints
    await expectDbError(create([short({})], ["A", "B"]), "invalid_tasks");
    await expectDbError(create({ not: "an array" }), "invalid_tasks");
    for (const bad of [
      "just text",
      { type: "essay", question: "?" },
      short({ question: "" }),
      short({ question: "x".repeat(501) }),
      short({ correctAnswer: "" }),
      short({ correctAnswer: "   " }),
      short({ correctAnswer: null }),
      choice({ options: ["только один"] }),
      choice({ options: ["1", "2", "3", "4", "5", "6", "7"] }),
      choice({ options: ["a", ""] }),
      choice({ options: ["a", "x".repeat(201)] }),
      choice({ options: ["Да", "да"] }),
      choice({ options: ["a", 2] }),
      choice({ correctOption: 2 }),
      choice({ correctOption: -1 }),
      choice({ correctOption: "0" }),
      choice({ correctOption: null }),
    ]) {
      await expectDbError(create([bad]), "invalid_task");
    }
    const [{ count }] = await t.admin<{ count: number }>(
      "select count(*)::int as count from public.races where title = 'Плохие задания'",
    );
    expect(count).toBe(0);
  });

  it("still creates task-less races for Stage 1/2 callers", async () => {
    const teacher = await t.createUser();
    const raceId = await t.rpc<string>(teacher, "create_race", ["Без заданий", null, ["A"]]);
    const [{ count }] = await t.admin<{ count: number }>(
      "select count(*)::int as count from public.checkpoint_tasks where race_id = $1",
      [raceId],
    );
    expect(count).toBe(0);
  });
});

describe("answering", () => {
  let race: Awaited<ReturnType<typeof taskRace>>;

  beforeAll(async () => {
    race = await taskRace();
  });

  it("new teams start at START", async () => {
    expect(await positionOf(race.alpha)).toBe(0);
    expect(await positionOf(race.beta)).toBe(0);
  });

  it("a wrong answer keeps the team in place and is recorded", async () => {
    expect(await submit(race.alice, race.alpha, race.taskIds[0], "0")).toEqual({
      correct: false,
      moved: false,
      alreadyPassed: false,
      position: 0,
      finished: false,
    });
    expect(await positionOf(race.alpha)).toBe(0);
    const [row] = await t.admin<{ answer: string; is_correct: boolean }>(
      "select answer, is_correct from public.task_submissions where team_id = $1",
      [race.alpha],
    );
    expect(row).toEqual({ answer: "0", is_correct: false });
  });

  it("a correct answer moves the team to the checkpoint and records the pass", async () => {
    expect(await submit(race.alice, race.alpha, race.taskIds[0], "1")).toMatchObject({
      correct: true,
      moved: true,
      position: 1,
      finished: false,
    });
    const passes = await t.admin<{ position: number }>("select position from public.team_passes where team_id = $1", [
      race.alpha,
    ]);
    expect(passes).toEqual([{ position: 1 }]);
  });

  it("a repeated answer, even from a teammate, never moves twice", async () => {
    for (const user of [race.alice, race.alicesMate, race.alice]) {
      expect(await submit(user, race.alpha, race.taskIds[0], "1")).toMatchObject({
        correct: null,
        moved: false,
        alreadyPassed: true,
        position: 1,
      });
    }
    expect(await positionOf(race.alpha)).toBe(1);
    const [{ count }] = await t.admin<{ count: number }>(
      "select count(*)::int as count from public.team_passes where team_id = $1",
      [race.alpha],
    );
    expect(count).toBe(1);
  });

  it("refuses the task of a future checkpoint and cannot skip", async () => {
    await expectDbError(submit(race.bob, race.beta, race.taskIds[1], "Бишкек"), "task_not_current");
    await expectDbError(submit(race.bob, race.beta, race.taskIds[2], SHORT_SECRET), "task_not_current");
    await expectDbError(t.rpc(race.bob, "advance_team", [race.beta, 1]), "task_required");
    await expectDbError(t.rpc(race.bob, "advance_team", [race.beta, 2]), "invalid_move");
    expect(await positionOf(race.beta)).toBe(0);
  });

  it("a student cannot answer for another team; the teacher cannot answer", async () => {
    await expectDbError(submit(race.bob, race.alpha, race.taskIds[1], "Бишкек"), "team_not_found");
    await expectDbError(submit(race.teacher, race.alpha, race.taskIds[1], "Бишкек"), "team_not_found");
    const outsider = await t.createUser({ anonymous: true });
    await expectDbError(submit(outsider, race.alpha, race.taskIds[1], "Бишкек"), "team_not_found");
    expect(await positionOf(race.alpha)).toBe(1);
  });

  it("validates the answer format", async () => {
    await expectDbError(submit(race.bob, race.beta, race.taskIds[0], "7"), "invalid_answer");
    await expectDbError(submit(race.bob, race.beta, race.taskIds[0], "a"), "invalid_answer");
    await expectDbError(submit(race.bob, race.beta, race.taskIds[0], "  "), "invalid_answer");
    await expectDbError(submit(race.alice, race.alpha, race.taskIds[1], "x".repeat(201)), "invalid_answer");
  });

  it("compares short answers ignoring case, spaces and ё", async () => {
    expect(await submit(race.alice, race.alpha, race.taskIds[1], "  бИШКЕК ")).toMatchObject({ correct: true, position: 2 });
  });

  it("reaches FINISH only together with the last checkpoint", async () => {
    expect(await submit(race.alicesMate, race.alpha, race.taskIds[2], "секретный   ответ ые")).toMatchObject({
      correct: true,
      position: 4,
      finished: true,
    });
    const passes = await t.admin<{ position: number }>(
      "select position from public.team_passes where team_id = $1 order by position",
      [race.alpha],
    );
    expect(passes.map((pass) => pass.position)).toEqual([1, 2, 3, 4]);
    expect(await submit(race.alice, race.alpha, race.taskIds[2], SHORT_SECRET)).toMatchObject({
      alreadyPassed: true,
      finished: true,
    });
    await expectDbError(t.rpc(race.alice, "advance_team", [race.alpha, 5]), "team_finished");
  });

  it("accepts answers only while the race is running", async () => {
    const waiting = await taskRace({ start: false });
    await expectDbError(submit(waiting.alice, waiting.alpha, waiting.taskIds[0], "1"), "race_not_started");
    await t.rpc(waiting.teacher, "finish_race", [waiting.raceId]);
    await expectDbError(submit(waiting.alice, waiting.alpha, waiting.taskIds[0], "1"), "race_finished");
    expect(await positionOf(waiting.alpha)).toBe(0);
  });
});

describe("correct answers stay secret", () => {
  let race: Awaited<ReturnType<typeof taskRace>>;

  beforeAll(async () => {
    race = await taskRace();
  });

  it("clients cannot read the answer keys", async () => {
    for (const user of [race.alice, race.teacher]) {
      await expectDbError(t.as(user, "select * from private.checkpoint_task_keys"), PERMISSION_DENIED);
    }
    await expectDbError(t.asAnon("select * from private.checkpoint_task_keys"), PERMISSION_DENIED);
  });

  it("students cannot read tasks or answers directly; owners read questions only", async () => {
    expect(await t.as(race.alice, "select id from public.checkpoint_tasks")).toEqual([]);
    expect(await t.as(race.alice, "select id from public.task_submissions")).toEqual([]);
    expect(await t.as(race.teacher, "select question from public.checkpoint_tasks where race_id = $1", [race.raceId])).toHaveLength(3);
  });

  it("get_lobby never contains an answer, and students see only the current task", async () => {
    type Lobby = {
      route: { position: number; hasTask: boolean; task: unknown }[];
      currentTask: { id: string; checkpointPosition: number; type: string; options: string[] | null } | null;
      teams: { stats: unknown }[];
    };
    const studentView = await t.rpc<Lobby>(race.alice, "get_lobby", [race.raceId]);
    const teacherView = await t.rpc<Lobby>(race.teacher, "get_lobby", [race.raceId]);

    for (const view of [studentView, teacherView]) {
      const json = JSON.stringify(view);
      expect(json).not.toContain(SHORT_SECRET);
      expect(json).not.toContain("Бишкек");
      expect(json).not.toMatch(/correct(Option|Answer)|correct_option|correct_answer/);
    }
    expect(studentView.currentTask).toMatchObject({ id: race.taskIds[0], checkpointPosition: 1, options: ["3", "4", "5"] });
    expect(studentView.route.map((point) => [point.hasTask, point.task])).toEqual([
      [false, null],
      [true, null],
      [true, null],
      [true, null],
      [false, null],
    ]);
    expect(studentView.teams.every((team) => team.stats === null)).toBe(true);
    expect(teacherView.currentTask).toBeNull();
    expect(teacherView.route[2].task).toEqual({ type: "short_answer", question: "Столица Кыргызстана?" });
  });

  it("the task of a race that has not started is not shown", async () => {
    const waiting = await taskRace({ start: false });
    const view = await t.rpc<{ currentTask: unknown }>(waiting.alice, "get_lobby", [waiting.raceId]);
    expect(view.currentTask).toBeNull();
  });

  it("the submit answer response never reveals the right answer", async () => {
    const result = await submit(race.bob, race.beta, race.taskIds[0], "2");
    expect(Object.keys(result).sort()).toEqual(["alreadyPassed", "correct", "finished", "moved", "position"]);
  });
});

describe("statistics and realtime", () => {
  it("the teacher sees correct and wrong answers per team and the finish time", async () => {
    const race = await taskRace();
    await submit(race.alice, race.alpha, race.taskIds[0], "0");
    await submit(race.alice, race.alpha, race.taskIds[0], "2");
    await submit(race.alice, race.alpha, race.taskIds[0], "1");

    type Stats = { correct: number; wrong: number; finishedAt: string | null };
    const view = await t.rpc<{ teams: { name: string; position: number; stats: Stats }[] }>(race.teacher, "get_lobby", [
      race.raceId,
    ]);
    const alpha = view.teams.find((team) => team.name === "Альфа")!;
    expect(alpha).toMatchObject({ position: 1, stats: { correct: 1, wrong: 2, finishedAt: null } });
  });

  it("answers are announced on the race channel without their content", async () => {
    const race = await taskRace();
    await t.admin("delete from realtime.messages");
    await submit(race.alice, race.alpha, race.taskIds[0], "0");
    await submit(race.alice, race.alpha, race.taskIds[0], "1");

    const messages = await t.admin<{ topic: string; payload: Record<string, string> }>(
      "select topic, payload from realtime.messages order by id",
    );
    expect(messages.map((message) => message.payload)).toEqual([
      { table: "task_submissions", op: "insert" },
      { table: "task_submissions", op: "insert" },
      { table: "teams", op: "update" },
    ]);
    expect(messages.every((message) => message.topic === `race:${race.raceId}`)).toBe(true);
  });
});

describe("no direct writes", () => {
  it("clients cannot write tasks, submissions or passes", async () => {
    const race = await taskRace();
    const attempts = [
      ["insert into public.checkpoint_tasks (race_id, checkpoint_id, type, question) select race_id, id, 'short_answer', 'x' from public.checkpoints where race_id = $1 limit 1", [race.raceId]],
      ["update public.checkpoint_tasks set question = 'взлом' where race_id = $1", [race.raceId]],
      ["insert into public.task_submissions (race_id, team_id, task_id, answer, is_correct) values ($1, $2, $3, '1', true)", [race.raceId, race.alpha, race.taskIds[0]]],
      ["insert into public.team_passes (team_id, race_id, position) values ($1, $2, 1)", [race.alpha, race.raceId]],
      ["insert into private.checkpoint_task_keys (task_id, correct_answer) values ($1, 'x')", [race.taskIds[1]]],
    ] as const;
    for (const user of [race.alice, race.teacher]) {
      for (const [sql, params] of attempts) {
        await expectDbError(t.as(user, sql, [...params]), PERMISSION_DENIED);
      }
    }
    expect(await positionOf(race.alpha)).toBe(0);
  });
});

describe("Stage 2 races keep working", () => {
  it("a race migrated from Stage 2 still moves with the button and has no tasks", async () => {
    const legacy = await createTestDb({ until: "20260928100100" });
    const teacher = await legacy.createUser();
    const raceId = await legacy.rpc<string>(teacher, "create_race", ["Старая гонка", null, ["A", "B"]]);
    const [{ code }] = await legacy.admin<{ code: string }>("select code from public.races where id = $1", [raceId]);
    const team = await legacy.rpc<string>(teacher, "create_team", [raceId, "Команда"]);
    const student = await legacy.createUser({ anonymous: true });
    await legacy.rpc(student, "join_race", [code, "Эрнис"]);
    const [{ id }] = await legacy.admin<{ id: string }>("select id from public.participants where user_id = $1", [student.id]);
    await legacy.rpc(teacher, "assign_participant", [id, team]);
    await legacy.rpc(teacher, "start_race", [raceId]);
    await legacy.rpc(student, "advance_team", [team, 1]);

    await legacy.applyPendingMigrations();

    await legacy.rpc(student, "advance_team", [team, 2]);
    const result = await legacy.rpc<{ position: number; finished: boolean }>(student, "advance_team", [team, 3]);
    expect(result).toMatchObject({ position: 3, finished: true });
    const view = await legacy.rpc<{ route: { hasTask: boolean }[]; currentTask: unknown }>(student, "get_lobby", [raceId]);
    expect(view.route.every((point) => !point.hasTask)).toBe(true);
    expect(view.currentTask).toBeNull();
  });
});
