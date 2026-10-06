import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanUp, expectLobbySignal, isConfigured, listen, rpc, rpcError, signInStudent, signInTeacher } from "./support";

/*
 * Stage 3 end-to-end: checkpoint tasks, server-side answer checks, secrecy of
 * the correct answers through the public API, and Realtime updates.
 * Same setup as lobby.test.ts; 2 anonymous students per run.
 */

const RUN_ID = randomUUID().slice(0, 8);
const SECRET = `Ответ-${RUN_ID}`;
const TASKS = [
  { type: "single_choice", question: "2 + 2 = ?", options: ["3", "4", "5"], correctOption: 1 },
  { type: "short_answer", question: "Секретное слово?", correctAnswer: SECRET },
];

type Lobby = {
  race: { code: string };
  currentTask: { id: string; checkpointPosition: number; options: string[] | null } | null;
  teams: { id: string; position: number; stats: { correct: number; wrong: number; finishedAt: string | null } | null }[];
  participants: { id: string; displayName: string }[];
};
type Answer = { correct: boolean | null; moved: boolean; alreadyPassed: boolean; position: number; finished: boolean };

describe.skipIf(!isConfigured)("Supabase integration: checkpoint tasks", () => {
  let teacher: SupabaseClient | undefined;
  let alphaStudent: SupabaseClient;
  let betaStudent: SupabaseClient;
  let raceId: string | undefined;
  let alpha: string;
  let beta: string;
  let taskIds: string[] = [];
  const clients: SupabaseClient[] = [];

  const lobbyFor = (client: SupabaseClient) => rpc<Lobby>(client, "get_lobby", { p_race_id: raceId });
  const submit = (client: SupabaseClient, team: string, task: string, answer: string) =>
    rpc<Answer>(client, "submit_answer", { p_team_id: team, p_task_id: task, p_answer: answer });

  beforeAll(async () => {
    teacher = await signInTeacher();
    clients.push(teacher);
    [alphaStudent, betaStudent] = await Promise.all([signInStudent(), signInStudent()]);
    clients.push(alphaStudent, betaStudent);

    raceId = await rpc<string>(teacher, "create_race", {
      p_title: `Задания ${RUN_ID}`,
      p_description: null,
      p_checkpoints: ["Арифметика", "Слово"],
      p_tasks: TASKS,
    });
    const { race } = await lobbyFor(teacher);
    await rpc(alphaStudent, "join_race", { p_code: race.code, p_display_name: "Эрнис" });
    await rpc(betaStudent, "join_race", { p_code: race.code, p_display_name: "Алина" });
    alpha = await rpc<string>(teacher, "create_team", { p_race_id: raceId, p_name: "Альфа" });
    beta = await rpc<string>(teacher, "create_team", { p_race_id: raceId, p_name: "Бета" });
    const { participants } = await lobbyFor(teacher);
    const seat = (name: string) => participants.find((participant) => participant.displayName === name)!.id;
    await rpc(teacher, "assign_participant", { p_participant_id: seat("Эрнис"), p_team_id: alpha });
    await rpc(teacher, "assign_participant", { p_participant_id: seat("Алина"), p_team_id: beta });
  });

  afterAll(() => cleanUp(teacher, raceId, clients));

  it("shows the current task only once the race is running", async () => {
    expect((await lobbyFor(alphaStudent)).currentTask).toBeNull();
    await rpc(teacher!, "start_race", { p_race_id: raceId });
    const task = (await lobbyFor(alphaStudent)).currentTask;
    expect(task).toMatchObject({ checkpointPosition: 1, options: ["3", "4", "5"] });
    taskIds = [task!.id];
  });

  it("never exposes the correct answers through the public API", async () => {
    for (const client of [alphaStudent, teacher!]) {
      const json = JSON.stringify(await lobbyFor(client));
      expect(json).not.toContain(SECRET);
      expect(json).not.toMatch(/correct(Option|Answer)|correct_option|correct_answer/);
    }
    const direct = await alphaStudent.from("checkpoint_tasks").select("*");
    expect(direct.error).toBeNull();
    expect(direct.data).toEqual([]);
    for (const client of [alphaStudent, teacher!]) {
      const keys = await client.schema("private").from("checkpoint_task_keys").select("*");
      expect(keys.data).toBeNull();
      expect(keys.error).not.toBeNull();
    }
    const submissions = await alphaStudent.from("task_submissions").select("answer");
    expect(submissions.data ?? []).toEqual([]);
  });

  it("a wrong answer keeps the team in place and reaches the teacher over Realtime", async () => {
    const subscription = await listen(betaStudent, raceId!);
    expect(subscription.status).toBe("SUBSCRIBED");
    const signal = subscription.waitForTable("task_submissions");
    expect(await submit(alphaStudent, alpha, taskIds[0], "0")).toMatchObject({ correct: false, moved: false, position: 0 });
    expectLobbySignal(await signal, { table: "task_submissions", op: "insert" }, [raceId!, alpha, beta, taskIds[0]]);
  });

  it("blocks skipping, button moves and answering for another team", async () => {
    expect(await rpcError(alphaStudent, "advance_team", { p_team_id: alpha, p_to_position: 1 })).toBe("task_required");
    expect(await rpcError(betaStudent, "submit_answer", { p_team_id: alpha, p_task_id: taskIds[0], p_answer: "1" })).toBe(
      "team_not_found",
    );
    const update = await alphaStudent.from("teams").update({ current_position: 2 }).eq("id", alpha);
    expect(update.error?.code).toBe("42501");
  });

  it("a correct answer moves the team once and other clients see it", async () => {
    const subscription = await listen(betaStudent, raceId!);
    const moved = subscription.waitForTable("teams");
    expect(await submit(alphaStudent, alpha, taskIds[0], "1")).toMatchObject({ correct: true, moved: true, position: 1 });
    expectLobbySignal(await moved, { table: "teams", op: "update" }, [raceId!, alpha, beta]);
    expect((await lobbyFor(betaStudent)).teams.find((team) => team.id === alpha)!.position).toBe(1);

    expect(await submit(alphaStudent, alpha, taskIds[0], "1")).toMatchObject({ alreadyPassed: true, moved: false, position: 1 });
    const next = (await lobbyFor(alphaStudent)).currentTask!;
    expect(next.checkpointPosition).toBe(2);
    taskIds.push(next.id);
    // The next team cannot jump to the second task either.
    expect(await rpcError(betaStudent, "submit_answer", { p_team_id: beta, p_task_id: next.id, p_answer: SECRET })).toBe(
      "task_not_current",
    );
  });

  it("reaches FINISH only with the last answer; the teacher sees the statistics", async () => {
    expect(await submit(alphaStudent, alpha, taskIds[1], `  ${SECRET.toUpperCase()} `)).toMatchObject({
      correct: true,
      position: 3,
      finished: true,
    });
    const stats = (await lobbyFor(teacher!)).teams.find((team) => team.id === alpha)!.stats!;
    expect(stats).toMatchObject({ correct: 2, wrong: 1 });
    expect(stats.finishedAt).not.toBeNull();
  });

  it("a finished race takes no more answers", async () => {
    await rpc(teacher!, "finish_race", { p_race_id: raceId });
    expect(await rpcError(betaStudent, "submit_answer", { p_team_id: beta, p_task_id: taskIds[0], p_answer: "1" })).toBe(
      "race_finished",
    );
    expect((await lobbyFor(teacher!)).teams.find((team) => team.id === beta)!.position).toBe(0);
  });
});
