import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanUp, isConfigured, rpc, rpcError, signInStudent, signInTeacher } from "./support";

/*
 * Stage 7 end-to-end: the race timer on the real project. The expiry itself
 * (refused answers, finish_expired_race) needs a moved clock and is covered by
 * tests/db/timer.test.ts; here: the limit, the server's countdown, "+5 минут"
 * and who may change it. 1 anonymous student per run.
 */

const RUN_ID = randomUUID().slice(0, 8);

type Clock = { status: string; timeLimitSeconds: number | null; endsAt: string | null; remainingSeconds: number | null };

describe.skipIf(!isConfigured)("Supabase integration: race timer", () => {
  let teacher: SupabaseClient | undefined;
  let student: SupabaseClient;
  let raceId: string | undefined;
  const clients: SupabaseClient[] = [];

  const clock = async (client: SupabaseClient) => (await rpc<{ race: Clock }>(client, "get_lobby", { p_race_id: raceId })).race;

  beforeAll(async () => {
    teacher = await signInTeacher();
    student = await signInStudent();
    clients.push(teacher, student);
    raceId = await rpc<string>(teacher, "create_race", {
      p_title: `Таймер ${RUN_ID}`,
      p_description: null,
      p_checkpoints: ["A"],
      p_tasks: [{ type: "short_answer", question: "?", correctAnswer: "да" }],
    });
    const { race } = await rpc<{ race: { code: string } }>(teacher, "get_lobby", { p_race_id: raceId });
    await rpc(student, "join_race", { p_code: race.code, p_display_name: "Эрнис" });
  });

  afterAll(() => cleanUp(teacher, raceId, clients));

  it("the teacher sets a limit that everyone sees; a student cannot change it", async () => {
    await rpc(teacher!, "set_race_time_limit", { p_race_id: raceId, p_seconds: 600 });
    expect(await clock(student)).toMatchObject({ timeLimitSeconds: 600, endsAt: null, remainingSeconds: null });
    expect(await rpcError(student, "set_race_time_limit", { p_race_id: raceId, p_seconds: 60 })).toBe("race_not_found");
    expect(await rpcError(teacher!, "set_race_time_limit", { p_race_id: raceId, p_seconds: 30 })).toBe("invalid_time_limit");
  });

  it("the start fixes the end; the countdown uses the server's clock", async () => {
    await rpc(teacher!, "start_race", { p_race_id: raceId });
    const race = await clock(student);
    expect(race.status).toBe("running");
    expect(race.endsAt).not.toBeNull();
    expect(race.remainingSeconds).toBeGreaterThan(580);
    expect(race.remainingSeconds).toBeLessThanOrEqual(600);
    // Not over yet: nobody can close it early through the timer.
    expect(await rpc<boolean>(student, "finish_expired_race", { p_race_id: raceId })).toBe(false);
  });

  it("«+5 минут» extends the running race", async () => {
    await rpc(teacher!, "set_race_time_limit", { p_race_id: raceId, p_seconds: 900 });
    const race = await clock(teacher!);
    expect(race.timeLimitSeconds).toBe(900);
    expect(race.remainingSeconds).toBeGreaterThan(880);
  });
});
