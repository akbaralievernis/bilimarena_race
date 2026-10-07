import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb, type TestUser } from "./harness";

/*
 * Stage 4: points, the pause after a wrong answer, finish bonuses and places —
 * all decided by the database (submit_answer, private.team_standings).
 */

const PERMISSION_DENIED = "42501";

type Answer = { correct: boolean | null; moved: boolean; position: number; finished: boolean; points: number; cooldownSeconds: number };
type Team = { id: string; name: string; position: number; score: number; place: number; finishOrder: number | null; stats: unknown };
type Lobby = { teams: Team[]; currentTask: { id: string; cooldownSeconds: number } | null };

// Every checkpoint: "2 + 2 = ?" with the right option at index 1.
const QUESTION = { type: "single_choice", question: "2 + 2 = ?", options: ["3", "4", "5"], correctOption: 1 };
const RIGHT = "1";
const WRONG = "0";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

/** A race with `checkpoints` task checkpoints and one student per team. */
async function scoringRace(teamNames: string[], options: { checkpoints?: number; tasks?: boolean } = {}) {
  const count = options.checkpoints ?? 2;
  const titles = Array.from({ length: count }, (_, index) => `Ч${index + 1}`);
  const teacher = await t.createUser({ displayName: "Учитель" });
  const tasks = options.tasks === false ? null : JSON.stringify(titles.map(() => QUESTION));
  const raceId = await t.rpc<string>(teacher, "create_race", ["Очки", null, titles, tasks]);
  const [{ code }] = await t.admin<{ code: string }>("select code from public.races where id = $1", [raceId]);

  const teams: { id: string; name: string; student: TestUser; mate: TestUser }[] = [];
  for (const [index, name] of teamNames.entries()) {
    const id = await t.rpc<string>(teacher, "create_team", [raceId, name]);
    const seat = async (displayName: string) => {
      const user = await t.createUser({ anonymous: true });
      await t.rpc(user, "join_race", [code, displayName]);
      const [{ id: participantId }] = await t.admin<{ id: string }>("select id from public.participants where user_id = $1", [
        user.id,
      ]);
      await t.rpc(teacher, "assign_participant", [participantId, id]);
      return user;
    };
    teams.push({ id, name, student: await seat(`Ученик ${index + 1}`), mate: await seat(`Напарник ${index + 1}`) });
  }
  await t.rpc(teacher, "start_race", [raceId]);
  return { teacher, raceId, teams };
}

type Race = Awaited<ReturnType<typeof scoringRace>>;

const lobby = (user: TestUser, raceId: string) => t.rpc<Lobby>(user, "get_lobby", [raceId]);

async function currentTaskId(race: Race, team: Race["teams"][number]) {
  const view = await lobby(team.student, race.raceId);
  return view.currentTask!.id;
}

async function answer(race: Race, team: Race["teams"][number], value: string, user: TestUser = team.student) {
  return t.rpc<Answer>(user, "submit_answer", [team.id, await currentTaskId(race, team), value]);
}

/** Moves the team's wrong answers 11 s into the past: the pause is over. */
const endPause = (teamId: string) =>
  t.admin("update public.task_submissions set submitted_at = submitted_at - interval '11 seconds' where team_id = $1 and not is_correct", [
    teamId,
  ]);

/** Pretends the team has been standing on its current point for `seconds`. */
async function thinkFor(race: Race, teamId: string, seconds: number) {
  await t.admin("update public.races set started_at = now() - make_interval(secs => $2) where id = $1", [race.raceId, seconds]);
  await t.admin("update public.team_passes set passed_at = now() - make_interval(secs => $2) where team_id = $1", [teamId, seconds]);
}

async function teamsOf(race: Race, viewer: TestUser = race.teacher) {
  const view = await lobby(viewer, race.raceId);
  return Object.fromEntries(view.teams.map((team) => [team.name, team]));
}

describe("points for answers", () => {
  it("a fast correct answer earns 100 + the full speed bonus of 50", async () => {
    const race = await scoringRace(["Альфа"]);
    expect(await answer(race, race.teams[0], RIGHT)).toMatchObject({ correct: true, points: 150, cooldownSeconds: 0 });
    expect((await teamsOf(race)).Альфа.score).toBe(150);
  });

  it("the speed bonus shrinks by one point every 3 seconds and never goes below 0", async () => {
    const race = await scoringRace(["Альфа"], { checkpoints: 3 });
    const [alpha] = race.teams;
    await thinkFor(race, alpha.id, 60);
    expect((await answer(race, alpha, RIGHT)).points).toBe(130);
    // The bonus restarts from the moment the team reached the new checkpoint.
    await thinkFor(race, alpha.id, 30);
    expect((await answer(race, alpha, RIGHT)).points).toBe(140);
    await thinkFor(race, alpha.id, 600);
    expect((await answer(race, alpha, RIGHT)).points).toBe(100);
  });

  it("a wrong answer costs 20, but the score never drops below zero", async () => {
    const race = await scoringRace(["Альфа"]);
    const [alpha] = race.teams;
    expect(await answer(race, alpha, WRONG)).toMatchObject({ correct: false, points: -20, cooldownSeconds: 10 });
    expect((await teamsOf(race)).Альфа.score).toBe(0);
    await endPause(alpha.id);
    expect((await answer(race, alpha, RIGHT)).points).toBe(150);
    expect((await teamsOf(race)).Альфа.score).toBe(130);
  });

  it("a repeated answer on a passed checkpoint earns nothing", async () => {
    const race = await scoringRace(["Альфа"]);
    const [alpha] = race.teams;
    const taskId = await currentTaskId(race, alpha);
    await t.rpc(alpha.student, "submit_answer", [alpha.id, taskId, RIGHT]);
    expect(await t.rpc<Answer>(alpha.mate, "submit_answer", [alpha.id, taskId, RIGHT])).toMatchObject({ points: 0, moved: false });
    expect((await teamsOf(race)).Альфа.score).toBe(150);
  });
});

describe("pause after a wrong answer", () => {
  it("blocks the whole team for 10 seconds and does not record the refused try", async () => {
    const race = await scoringRace(["Альфа", "Бета"]);
    const [alpha, beta] = race.teams;
    await answer(race, alpha, WRONG);

    await expectDbError(answer(race, alpha, RIGHT), "answer_cooldown");
    await expectDbError(answer(race, alpha, RIGHT, alpha.mate), "answer_cooldown");
    const [{ count }] = await t.admin<{ count: number }>(
      "select count(*)::int as count from public.task_submissions where team_id = $1",
      [alpha.id],
    );
    expect(count).toBe(1);

    // Another team is not affected.
    expect(await answer(race, beta, RIGHT)).toMatchObject({ correct: true });

    await endPause(alpha.id);
    expect(await answer(race, alpha, RIGHT)).toMatchObject({ correct: true, position: 1 });
  });

  it("guessing all options in a row is impossible", async () => {
    const race = await scoringRace(["Альфа"]);
    const [alpha] = race.teams;
    await answer(race, alpha, "2");
    for (const option of ["0", "1"]) await expectDbError(answer(race, alpha, option), "answer_cooldown");
    expect((await teamsOf(race)).Альфа.position).toBe(0);
  });

  it("students see the seconds left; the pause ends with the time and on the next task", async () => {
    const race = await scoringRace(["Альфа"], { checkpoints: 3 });
    const [alpha] = race.teams;
    await answer(race, alpha, WRONG);
    expect((await lobby(alpha.mate, race.raceId)).currentTask!.cooldownSeconds).toBe(10);

    await endPause(alpha.id);
    expect((await lobby(alpha.student, race.raceId)).currentTask!.cooldownSeconds).toBe(0);
    await answer(race, alpha, RIGHT);
    // A fresh wrong answer on checkpoint 2 starts its own pause; checkpoint 1's is gone.
    expect((await lobby(alpha.student, race.raceId)).currentTask!.cooldownSeconds).toBe(0);
  });
});

describe("finish and places", () => {
  /** Walks a team through every checkpoint with right answers. */
  async function finish(race: Race, team: Race["teams"][number]) {
    for (let step = 0; step < 2; step++) await answer(race, team, RIGHT);
  }

  it("the first three teams get 100, 60 and 30; places follow the finish order", async () => {
    const race = await scoringRace(["Альфа", "Бета", "Гамма", "Дельта", "Эпсилон"]);
    const [alpha, beta, gamma, delta, epsilon] = race.teams;
    for (const team of [gamma, alpha, delta, beta]) await finish(race, team);
    await answer(race, epsilon, RIGHT);

    const teams = await teamsOf(race);
    // 2 fast answers = 300 points; then the finish bonus.
    expect([teams.Гамма, teams.Альфа, teams.Дельта, teams.Бета].map((team) => [team.finishOrder, team.score, team.place])).toEqual([
      [1, 400, 1],
      [2, 360, 2],
      [3, 330, 3],
      [4, 300, 4],
    ]);
    expect(teams.Эпсилон).toMatchObject({ finishOrder: null, score: 150, place: 5, position: 1 });
  });

  it("unfinished teams are ranked by position, then by score; equal teams share a place", async () => {
    const race = await scoringRace(["Альфа", "Бета", "Гамма", "Дельта"], { checkpoints: 3 });
    const [alpha, beta, gamma] = race.teams;
    await thinkFor(race, alpha.id, 300);
    await answer(race, alpha, RIGHT); // position 1, 100 points
    // The race start is shared by all teams on START: Бета answers right away.
    await thinkFor(race, beta.id, 0);
    await answer(race, beta, RIGHT); // position 1, 150 points
    await answer(race, gamma, RIGHT);
    await answer(race, gamma, RIGHT); // position 2: ahead of everyone, despite the score
    // Дельта stays on START.

    const teams = await teamsOf(race);
    expect(teams.Гамма.place).toBe(1);
    expect(teams.Бета.place).toBe(2);
    expect(teams.Альфа.place).toBe(3);
    expect(teams.Дельта.place).toBe(4);

    const fresh = await scoringRace(["Альфа", "Бета"]);
    const tied = await teamsOf(fresh);
    expect([tied.Альфа.place, tied.Бета.place]).toEqual([1, 1]);
  });

  it("two teams reaching FINISH at the same moment never share a finish bonus", async () => {
    const race = await scoringRace(["Альфа", "Бета"]);
    for (const team of race.teams) await finish(race, team);
    await t.admin("update public.team_passes set passed_at = '2026-10-07 12:00:00+00' where race_id = $1 and position = 3", [race.raceId]);

    const teams = Object.values(await teamsOf(race));
    expect(teams.map((team) => team.finishOrder).sort()).toEqual([1, 2]);
    expect(teams.map((team) => team.score).sort()).toEqual([360, 400]);
  });

  it("races without tasks still rank by finish and give the finish bonus", async () => {
    const race = await scoringRace(["Альфа", "Бета"], { tasks: false });
    const [alpha, beta] = race.teams;
    for (const position of [1, 2, 3]) await t.rpc(beta.student, "advance_team", [beta.id, position]);
    await t.rpc(alpha.student, "advance_team", [alpha.id, 1]);

    const teams = await teamsOf(race);
    expect(teams.Бета).toMatchObject({ score: 100, place: 1, finishOrder: 1 });
    expect(teams.Альфа).toMatchObject({ score: 0, place: 2, finishOrder: null });
  });
});

describe("who sees what", () => {
  it("every member sees the leaderboard; statistics stay with the teacher", async () => {
    const race = await scoringRace(["Альфа", "Бета"]);
    await answer(race, race.teams[0], RIGHT);
    const studentView = await teamsOf(race, race.teams[1].student);
    expect(studentView.Альфа).toMatchObject({ score: 150, place: 1 });
    expect(studentView.Альфа.stats).toBeNull();
    expect((await teamsOf(race)).Альфа.stats).toMatchObject({ correct: 1, wrong: 0 });
  });

  it("clients cannot change points or bypass the pause by writing directly", async () => {
    const race = await scoringRace(["Альфа"]);
    const [alpha] = race.teams;
    await answer(race, alpha, WRONG);
    for (const user of [alpha.student, race.teacher]) {
      await expectDbError(t.as(user, "update public.task_submissions set points = 150 where team_id = $1", [alpha.id]), PERMISSION_DENIED);
      await expectDbError(
        t.as(user, "update public.task_submissions set submitted_at = now() - interval '1 hour' where team_id = $1", [alpha.id]),
        PERMISSION_DENIED,
      );
      await expectDbError(t.as(user, "select private.team_standings($1)", [race.raceId]), PERMISSION_DENIED);
    }
    await expectDbError(answer(race, alpha, RIGHT), "answer_cooldown");
  });
});

describe("upgrade from Stage 3", () => {
  it("answers given before Stage 4 get base points: 100 for right, −20 for wrong", async () => {
    const legacy = await createTestDb({ until: "20260929100100" });
    const teacher = await legacy.createUser();
    const raceId = await legacy.rpc<string>(teacher, "create_race", ["Старая", null, ["A"], JSON.stringify([QUESTION])]);
    const [{ code }] = await legacy.admin<{ code: string }>("select code from public.races where id = $1", [raceId]);
    const team = await legacy.rpc<string>(teacher, "create_team", [raceId, "Команда"]);
    const student = await legacy.createUser({ anonymous: true });
    await legacy.rpc(student, "join_race", [code, "Эрнис"]);
    const [{ id }] = await legacy.admin<{ id: string }>("select id from public.participants where user_id = $1", [student.id]);
    await legacy.rpc(teacher, "assign_participant", [id, team]);
    await legacy.rpc(teacher, "start_race", [raceId]);
    const [{ id: taskId }] = await legacy.admin<{ id: string }>("select id from public.checkpoint_tasks where race_id = $1", [raceId]);
    await legacy.rpc(student, "submit_answer", [team, taskId, WRONG]);
    await legacy.rpc(student, "submit_answer", [team, taskId, RIGHT]);

    await legacy.applyPendingMigrations();

    const points = await legacy.admin<{ points: number }>("select points from public.task_submissions order by submitted_at, is_correct");
    expect(points.map((row) => row.points)).toEqual([-20, 100]);
    const view = await legacy.rpc<Lobby>(teacher, "get_lobby", [raceId]);
    // 100 − 20 for the answers + 100 for finishing first.
    expect(view.teams[0]).toMatchObject({ score: 180, place: 1, finishOrder: 1 });
  });
});
