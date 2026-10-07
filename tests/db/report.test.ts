import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb, type TestUser } from "./harness";

/*
 * Stage 5: get_race_report() — owner-only history and analytics. It must count
 * correctly and must never reveal a correct answer.
 */

const PERMISSION_DENIED = "42501";
const SECRET = "Бишкек-секрет";
const TASKS = [
  { type: "single_choice", question: "2 + 2 = ?", options: ["3", "4", "5"], correctOption: 1 },
  { type: "short_answer", question: "Столица?", correctAnswer: SECRET },
];

type TaskReport = {
  position: number;
  title: string;
  type: string;
  question: string;
  options: string[] | null;
  attempts: number;
  correct: number;
  wrong: number;
  teamsTried: number;
  teamsPassed: number;
  firstTryCorrect: number;
  avgSolveSeconds: number | null;
  topWrong: { answer: string; count: number }[];
};
type Report = {
  race: { id: string; status: string; startedAt: string | null; finishedAt: string | null };
  teams: { name: string; place: number; score: number; finishOrder: number | null; correct: number; wrong: number; memberCount: number }[];
  tasks: TaskReport[];
  participants: { displayName: string; teamName: string | null; answers: number; correct: number }[];
  timeline: { at: string; kind: string; teamName?: string; participantName?: string | null; correct?: boolean; points?: number; finishOrder?: number }[];
};

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

async function reportRace() {
  const teacher = await t.createUser({ displayName: "Учитель" });
  const raceId = await t.rpc<string>(teacher, "create_race", ["Отчёт", null, ["Арифметика", "География"], JSON.stringify(TASKS)]);
  const [{ code }] = await t.admin<{ code: string }>("select code from public.races where id = $1", [raceId]);
  const seat = async (name: string, teamId: string) => {
    const user = await t.createUser({ anonymous: true });
    await t.rpc(user, "join_race", [code, name]);
    const [{ id }] = await t.admin<{ id: string }>("select id from public.participants where user_id = $1", [user.id]);
    await t.rpc(teacher, "assign_participant", [id, teamId]);
    return user;
  };
  const alpha = await t.rpc<string>(teacher, "create_team", [raceId, "Альфа"]);
  const beta = await t.rpc<string>(teacher, "create_team", [raceId, "Бета"]);
  const erni = await seat("Эрнис", alpha);
  const alina = await seat("Алина", alpha);
  const bek = await seat("Бекзат", beta);
  const idle = await t.createUser({ anonymous: true });
  await t.rpc(idle, "join_race", [code, "Без команды"]);
  await t.rpc(teacher, "start_race", [raceId]);
  const tasks = await t.admin<{ id: string }>(
    `select k.id from public.checkpoint_tasks k join public.checkpoints c on c.id = k.checkpoint_id
     where k.race_id = $1 order by c.position`,
    [raceId],
  );
  return { teacher, raceId, alpha, beta, erni, alina, bek, idle, taskIds: tasks.map((task) => task.id) };
}

const endPause = (teamId: string) =>
  t.admin("update public.task_submissions set submitted_at = submitted_at - interval '11 seconds' where team_id = $1 and not is_correct", [
    teamId,
  ]);

describe("who can read the report", () => {
  it("only the race owner; others get race_not_found, anonymous requests no access at all", async () => {
    const race = await reportRace();
    const stranger = await t.createUser({ displayName: "Другой учитель" });
    await expect(t.rpc<Report>(race.teacher, "get_race_report", [race.raceId])).resolves.toMatchObject({ race: { id: race.raceId } });
    for (const user of [race.erni, race.bek, race.idle, stranger]) {
      await expectDbError(t.rpc(user, "get_race_report", [race.raceId]), "race_not_found");
    }
    await expectDbError(t.asAnon("select public.get_race_report($1)", [race.raceId]), PERMISSION_DENIED);
  });
});

describe("analytics", () => {
  let race: Awaited<ReturnType<typeof reportRace>>;
  let report: Report;

  beforeAll(async () => {
    race = await reportRace();
    const [arith, geo] = race.taskIds;
    // Альфа: wrong ("3"), then right; then two wrong spellings of one answer, a third wrong one, then right → FINISH.
    await t.rpc(race.erni, "submit_answer", [race.alpha, arith, "0"]);
    await endPause(race.alpha);
    await t.rpc(race.alina, "submit_answer", [race.alpha, arith, "1"]);
    for (const wrong of ["москва", "  Москва ", "Ош"]) {
      await t.rpc(race.erni, "submit_answer", [race.alpha, geo, wrong]);
      await endPause(race.alpha);
    }
    await t.rpc(race.erni, "submit_answer", [race.alpha, geo, SECRET]);
    // Бета: right at once on the first task.
    await t.rpc(race.bek, "submit_answer", [race.beta, arith, "1"]);
    await t.rpc(race.teacher, "finish_race", [race.raceId]);

    // Clock for the time analysis: start an hour ago (T0), checkpoint 1 at T0 + 40 s (Альфа)
    // and T0 + 20 s (Бета), checkpoint 2 and FINISH at T0 + 100 s (Альфа).
    await t.admin("update public.races set started_at = now() - interval '1 hour' where id = $1", [race.raceId]);
    const passAt = (teamId: string, positions: number[], seconds: number) =>
      t.admin(
        `update public.team_passes tp set passed_at = r.started_at + make_interval(secs => $3)
         from public.races r where r.id = tp.race_id and tp.team_id = $1 and tp.position = any($2)`,
        [teamId, positions, seconds],
      );
    await passAt(race.alpha, [1], 40);
    await passAt(race.beta, [1], 20);
    await passAt(race.alpha, [2, 3], 100);

    report = await t.rpc<Report>(race.teacher, "get_race_report", [race.raceId]);
  });

  it("counts attempts, first-try solutions and solving time per task", () => {
    const [arith, geo] = report.tasks;
    expect(arith).toMatchObject({
      position: 1,
      title: "Арифметика",
      type: "single_choice",
      question: "2 + 2 = ?",
      options: ["3", "4", "5"],
      attempts: 3,
      correct: 2,
      wrong: 1,
      teamsTried: 2,
      teamsPassed: 2,
      firstTryCorrect: 1,
      avgSolveSeconds: 30,
    });
    expect(geo).toMatchObject({ position: 2, attempts: 4, correct: 1, wrong: 3, teamsTried: 1, teamsPassed: 1, firstTryCorrect: 0, avgSolveSeconds: 60 });
  });

  it("lists the most common wrong answers: option text for choices, grouped text otherwise", () => {
    const [arith, geo] = report.tasks;
    expect(arith.topWrong).toEqual([{ answer: "3", count: 1 }]);
    expect(geo.topWrong).toEqual([
      { answer: "Москва", count: 2 },
      { answer: "Ош", count: 1 },
    ]);
  });

  it("never contains a correct answer", () => {
    const json = JSON.stringify(report);
    expect(json).not.toContain(SECRET);
    expect(json).not.toMatch(/correct(Option|Answer)|correct_option|correct_answer/);
    // The right option "4" appears only as one of the options, never as an answer.
    expect(report.tasks[0].topWrong.map((item) => item.answer)).not.toContain("4");
  });

  it("has the final standings with each team's answers", () => {
    expect(report.teams.map((team) => [team.name, team.place, team.finishOrder, team.correct, team.wrong, team.memberCount])).toEqual([
      ["Альфа", 1, 1, 2, 4, 2],
      ["Бета", 2, null, 1, 0, 1],
    ]);
    expect(report.race.status).toBe("finished");
  });

  it("shows how actively every student answered, including students without a team", () => {
    expect(report.participants).toEqual([
      expect.objectContaining({ displayName: "Алина", teamName: "Альфа", answers: 1, correct: 1 }),
      expect.objectContaining({ displayName: "Без команды", teamName: null, answers: 0, correct: 0 }),
      expect.objectContaining({ displayName: "Бекзат", teamName: "Бета", answers: 1, correct: 1 }),
      expect.objectContaining({ displayName: "Эрнис", teamName: "Альфа", answers: 5, correct: 1 }),
    ]);
  });

  it("tells the story in order: start, answers with points, finish, end of the race", () => {
    const kinds = report.timeline.map((event) => event.kind);
    expect(kinds[0]).toBe("start");
    expect(kinds.at(-1)).toBe("race_finish");
    expect(kinds.filter((kind) => kind === "answer")).toHaveLength(7);
    expect(report.timeline.filter((event) => event.kind === "finish")).toEqual([
      expect.objectContaining({ teamName: "Альфа", finishOrder: 1 }),
    ]);
    const times = report.timeline.map((event) => Date.parse(event.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    const firstAnswer = report.timeline.find((event) => event.kind === "answer")!;
    expect(firstAnswer).toMatchObject({ teamName: "Альфа", participantName: "Эрнис", correct: false, points: -20 });
    // The timeline says right or wrong, but never what was answered.
    expect(report.timeline.every((event) => !("answer" in event))).toBe(true);
  });
});

describe("empty and running races", () => {
  it("a race that has not started has an empty story and zero counts", async () => {
    const teacher = await t.createUser();
    const raceId = await t.rpc<string>(teacher, "create_race", ["Пусто", null, ["A"], JSON.stringify([TASKS[0]])]);
    const report = await t.rpc<Report>(teacher, "get_race_report", [raceId]);
    expect(report.timeline).toEqual([]);
    expect(report.teams).toEqual([]);
    expect(report.tasks[0]).toMatchObject({ attempts: 0, teamsTried: 0, firstTryCorrect: 0, avgSolveSeconds: null, topWrong: [] });
  });

  it("a race without tasks still reports its standings", async () => {
    const teacher: TestUser = await t.createUser();
    const raceId = await t.rpc<string>(teacher, "create_race", ["Кнопки", null, ["A"]]);
    await t.rpc(teacher, "create_team", [raceId, "Команда"]);
    const report = await t.rpc<Report>(teacher, "get_race_report", [raceId]);
    expect(report.tasks).toEqual([]);
    expect(report.teams).toEqual([expect.objectContaining({ name: "Команда", place: 1, score: 0 })]);
  });
});
