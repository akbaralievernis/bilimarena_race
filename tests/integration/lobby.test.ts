import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanUp, expectLobbySignal, isConfigured, listen, rpc, rpcError, signInStudent, signInTeacher } from "./support";

/*
 * End-to-end checks against a real Supabase project with the migrations
 * applied: auth, trusted RPCs, RLS through the Data API and Realtime delivery.
 *
 *   npm run test:integration
 *
 * Configuration (loaded by vitest.integration.config.mts):
 *   .env.local       NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *   .env.test.local  TEST_TEACHER_EMAIL, TEST_TEACHER_PASSWORD (see .env.test.example)
 *
 * Test users — no e-mails are sent:
 *   * Teacher: one pre-created, pre-confirmed account, signed in with a password.
 *     sign-up is avoided on purpose: with "Confirm email" on, every sign-up sends
 *     a confirmation e-mail (tight rate limit, bounces from fake addresses) and
 *     returns no session anyway.
 *   * Students: 3 anonymous users per run, created once in beforeAll.
 * Isolation comes from a fresh race per run. Auth errors are reported, never
 * retried — a rate limit means "wait", not "try harder". Helpers: ./support.ts.
 */

const RUN_ID = randomUUID().slice(0, 8);

describe.skipIf(!isConfigured)("Supabase integration: rooms, teams, lobby", () => {
  let teacher: SupabaseClient | undefined;
  let student: SupabaseClient;
  let classmate: SupabaseClient;
  // Never joins the race: used for "not a member" checks and, at the end, as
  // the late joiner of a finished race — no extra anonymous user needed.
  let outsider: SupabaseClient;
  let raceId: string | undefined;
  let code: string;
  let studentParticipantId: string;
  let teamId: string;
  const clients: SupabaseClient[] = [];

  beforeAll(async () => {
    teacher = await signInTeacher();
    clients.push(teacher);
    [student, classmate, outsider] = await Promise.all([signInStudent(), signInStudent(), signInStudent()]);
    clients.push(student, classmate, outsider);

    raceId = await rpc<string>(teacher, "create_race", {
      p_title: `Интеграционный тест ${RUN_ID}`,
      p_description: null,
    });
    const lobby = await rpc<{ race: { code: string; status: string } }>(teacher, "get_lobby", { p_race_id: raceId });
    code = lobby.race.code;
    expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
    expect(lobby.race.status).toBe("lobby");
  });

  // The teacher account is reused across runs: close this run's race even if
  // a test failed midway, so open races never pile up (limit: 50 per teacher).
  afterAll(() => cleanUp(teacher, raceId, clients));

  it("a student joins by code (any case) and re-joining does not duplicate", async () => {
    expect(await rpc(student, "join_race", { p_code: code.toLowerCase(), p_display_name: "Эрнис" })).toBe(raceId);
    expect(await rpc(student, "join_race", { p_code: code, p_display_name: "Эрнис" })).toBe(raceId);
    await rpc(classmate, "join_race", { p_code: code, p_display_name: "Алина" });

    const lobby = await rpc<{ participants: { id: string; displayName: string }[]; studentCount: number }>(
      teacher!,
      "get_lobby",
      { p_race_id: raceId },
    );
    expect(lobby.studentCount).toBe(2);
    studentParticipantId = lobby.participants.find((p) => p.displayName === "Эрнис")!.id;
  });

  it("rejects unknown codes and taken names", async () => {
    expect(await rpcError(outsider, "join_race", { p_code: "ZZZZZZ", p_display_name: "Гость" })).toBe("race_not_found");
    expect(await rpcError(outsider, "join_race", { p_code: code, p_display_name: "эрнис" })).toBe("display_name_taken");
  });

  it("delivers lobby changes to the student over Realtime", async () => {
    const subscription = await listen(student, raceId!);
    expect(subscription.status).toBe("SUBSCRIBED");

    const created = subscription.nextEvent();
    teamId = await rpc<string>(teacher!, "create_team", { p_race_id: raceId, p_name: "Альфа" });
    expectLobbySignal(await created, { table: "teams", op: "insert" }, [raceId!, teamId]);

    const assigned = subscription.nextEvent();
    await rpc(teacher!, "assign_participant", { p_participant_id: studentParticipantId, p_team_id: teamId });
    expectLobbySignal(await assigned, { table: "participants", op: "update" }, [
      raceId!,
      teamId,
      studentParticipantId,
    ]);

    const view = await rpc<{ viewer: { teamId: string } }>(student, "get_lobby", { p_race_id: raceId });
    expect(view.viewer.teamId).toBe(teamId);
  });

  it("refuses the race channel to outsiders", async () => {
    const subscription = await listen(outsider, raceId!);
    expect(subscription.status).not.toBe("SUBSCRIBED");
  });

  it("blocks direct writes and foreign reads through the Data API", async () => {
    const statusUpdate = await student.from("races").update({ status: "running" }).eq("id", raceId!);
    expect(statusUpdate.error?.code).toBe("42501");

    const rename = await student.from("participants").update({ display_name: "Хакер" }).eq("race_id", raceId!);
    expect(rename.error?.code).toBe("42501");

    const selfAssign = await classmate.rpc("assign_participant", {
      p_participant_id: studentParticipantId,
      p_team_id: null,
    });
    expect(selfAssign.error?.message).toBe("participant_not_found");

    const foreign = await outsider.from("races").select("id").eq("id", raceId!);
    expect(foreign.error).toBeNull();
    expect(foreign.data).toEqual([]);

    expect(await rpcError(student, "start_race", { p_race_id: raceId })).toBe("race_not_found");
  });

  it("broadcasts the start and then refuses joins once finished", async () => {
    const subscription = await listen(classmate, raceId!);
    const started = subscription.nextEvent();
    await rpc(teacher!, "start_race", { p_race_id: raceId });
    expectLobbySignal(await started, { table: "races", op: "update" }, [raceId!]);

    await rpc(teacher!, "finish_race", { p_race_id: raceId });
    expect(await rpcError(outsider, "join_race", { p_code: code, p_display_name: "Опоздавший" })).toBe("race_finished");
  });
});
