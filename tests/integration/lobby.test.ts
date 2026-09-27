import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
 * retried — a rate limit means "wait", not "try harder".
 */

const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  teacherEmail: process.env.TEST_TEACHER_EMAIL?.trim(),
  teacherPassword: process.env.TEST_TEACHER_PASSWORD,
};

const RUN_ID = randomUUID().slice(0, 8);

const AUTH_HINTS: Record<string, string> = {
  invalid_credentials: "TEST_TEACHER_EMAIL / TEST_TEACHER_PASSWORD не подходят — проверьте .env.test.local.",
  email_not_confirmed:
    "тестовый учитель не подтверждён — создайте его через Dashboard → Authentication → Add user с «Auto Confirm User».",
  anonymous_provider_disabled: "включите Authentication → Sign In / Providers → Anonymous Sign-Ins.",
  over_request_rate_limit:
    "сработал rate limit Supabase Auth (вход / анонимный вход по IP). Подождите и запустите снова — тесты не повторяют запросы.",
};

function authFailure(step: string, error: { code?: string; message: string }) {
  const hint = (error.code && AUTH_HINTS[error.code]) || error.message;
  return new Error(`${step}: ${hint} [${error.code ?? "no code"}]`);
}

function newClient() {
  return createClient(env.url!, env.key!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signInTeacher() {
  if (!env.teacherEmail || !env.teacherPassword) {
    throw new Error(
      "Нет TEST_TEACHER_EMAIL / TEST_TEACHER_PASSWORD. Создайте .env.test.local по образцу .env.test.example.",
    );
  }
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: env.teacherEmail,
    password: env.teacherPassword,
  });
  if (error) throw authFailure("Вход тестового учителя", error);
  if (data.user.is_anonymous) throw new Error("Тестовый учитель не должен быть анонимным пользователем.");
  return client;
}

async function signInStudent() {
  const client = newClient();
  const { error } = await client.auth.signInAnonymously();
  if (error) throw authFailure("Анонимный вход студента", error);
  return client;
}

async function rpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

async function rpcError(client: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { error } = await client.rpc(fn, args);
  return error?.message ?? null;
}

/**
 * Our triggers send only { table, op }. Supabase Realtime adds its own message
 * `id` to database broadcasts; nothing else may travel, and that id must not be
 * one of our row ids (no domain data over the socket).
 */
function expectLobbySignal(received: unknown, expected: { table: string; op: string }, domainIds: string[]) {
  expect(received).toMatchObject(expected);
  const signal = received as Record<string, unknown>;
  expect(Object.keys(signal).filter((key) => !["table", "op", "id"].includes(key))).toEqual([]);
  if (signal.id !== undefined) expect(domainIds).not.toContain(signal.id);
}

/** Subscribes to the private race channel and exposes a "wait for next event" helper. */
async function listen(client: SupabaseClient, raceId: string) {
  await client.realtime.setAuth();
  const events: unknown[] = [];
  let onEvent: (() => void) | null = null;

  const channel = client
    .channel(`race:${raceId}`, { config: { private: true } })
    .on("broadcast", { event: "lobby_changed" }, (message) => {
      events.push(message.payload);
      onEvent?.();
    });

  const status = await new Promise<string>((resolve) => {
    const timer = setTimeout(() => resolve("TIMEOUT"), 10_000);
    channel.subscribe((next) => {
      if (next === "CLOSED") return;
      clearTimeout(timer);
      resolve(next);
    });
  });

  /** Call before triggering the change; resolves with the payload or null. */
  function nextEvent(timeoutMs = 10_000) {
    const seen = events.length;
    return new Promise<unknown>((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      onEvent = () => {
        if (events.length > seen) {
          clearTimeout(timer);
          resolve(events[events.length - 1]);
        }
      };
    });
  }

  return { channel, status, nextEvent };
}

describe.skipIf(!env.url || !env.key)("Supabase integration: rooms, teams, lobby", () => {
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

  afterAll(async () => {
    // The teacher account is reused across runs: close this run's race even if
    // a test failed midway, so open races never pile up (limit: 50 per teacher).
    if (teacher && raceId) {
      const { error } = await teacher.rpc("finish_race", { p_race_id: raceId });
      if (error && error.message !== "invalid_status_transition") {
        console.warn(`Не удалось завершить тестовую гонку ${raceId}: ${error.message}`);
      }
    }
    for (const client of clients) {
      await client.removeAllChannels();
      // Local scope: do not end the teacher's other sessions (e.g. in a browser).
      await client.auth.signOut({ scope: "local" });
    }
  });

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
