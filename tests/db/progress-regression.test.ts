import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb, type TestUser } from "./harness";

/*
 * Regression: race EGRN3D, team "альфа" reached FINISH "without passing any
 * checkpoint". Timeline from realtime.messages:
 *   09:40:18 race started (no team yet)
 *   09:41:00 team created at START, 09:41:04 student assigned
 *   09:41:10 / :14 / :16 / :18 four advance_team calls, 0 → 1 → 2 → 3 → 4 (FINISH)
 * Nothing was skipped and the start position was right: in Stage 2 a
 * checkpoint was "passed" by pressing a button, so repeated presses walked the
 * team through the whole route. Stage 3 puts a task on every checkpoint and
 * only a correct answer, checked by the server, moves the team.
 */

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

const TASKS = [
  { type: "short_answer", question: "2 + 2 = ?", correctAnswer: "4" },
  { type: "single_choice", question: "Столица Кыргызстана?", options: ["Ош", "Бишкек", "Каракол"], correctOption: 1 },
  { type: "short_answer", question: "Сколько сторон у треугольника?", correctAnswer: "три" },
];

/** Reproduces the incident setup: the race is started before its team exists. */
async function incidentRace(tasks: unknown[] | null) {
  const teacher = await t.createUser({ displayName: "Учитель" });
  const args: unknown[] = ["ауб", null, ["1", "2", "3"]];
  if (tasks) args.push(JSON.stringify(tasks));
  const raceId = await t.rpc<string>(teacher, "create_race", args);
  const [{ code }] = await t.admin<{ code: string }>("select code from public.races where id = $1", [raceId]);

  const student: TestUser = await t.createUser({ anonymous: true });
  await t.rpc(student, "join_race", [code, "Ernis"]);
  await t.rpc(teacher, "start_race", [raceId]);

  const teamId = await t.rpc<string>(teacher, "create_team", [raceId, "альфа"]);
  const [{ id }] = await t.admin<{ id: string }>("select id from public.participants where user_id = $1", [student.id]);
  await t.rpc(teacher, "assign_participant", [id, teamId]);
  return { teacher, raceId, student, teamId };
}

async function positionOf(teamId: string) {
  const [row] = await t.admin<{ current_position: number }>("select current_position from public.teams where id = $1", [
    teamId,
  ]);
  return row.current_position;
}

describe("regression EGRN3D: team at FINISH without passing checkpoints", () => {
  it("A. a team created mid-race starts at START; in a task-less (Stage 2) race each press moves one point", async () => {
    const { student, teamId } = await incidentRace(null);
    expect(await positionOf(teamId)).toBe(0);

    // The four presses from the incident: every move is a legal N → N+1.
    for (const to of [1, 2, 3, 4]) await t.rpc(student, "advance_team", [teamId, to]);
    expect(await positionOf(teamId)).toBe(4);
  });

  it("B. with checkpoint tasks the same four presses move nothing; FINISH needs every correct answer", async () => {
    const { student, teamId, raceId } = await incidentRace(TASKS);
    expect(await positionOf(teamId)).toBe(0);

    for (const to of [1, 2, 3, 4]) {
      await expectDbError(t.rpc(student, "advance_team", [teamId, to]), to === 1 ? "task_required" : "invalid_move");
    }
    expect(await positionOf(teamId)).toBe(0);

    const tasks = await t.admin<{ id: string; position: number }>(
      `select k.id, c.position from public.checkpoint_tasks k
       join public.checkpoints c on c.id = k.checkpoint_id
       where k.race_id = $1 order by c.position`,
      [raceId],
    );
    const answers = ["4", "1", "Три"];
    for (const [index, task] of tasks.entries()) {
      const result = await t.rpc<{ position: number; finished: boolean }>(student, "submit_answer", [
        teamId,
        task.id,
        answers[index],
      ]);
      // FINISH is reached only together with the last checkpoint.
      expect(result.finished).toBe(index === tasks.length - 1);
    }
    expect(await positionOf(teamId)).toBe(4);
  });
});
