import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect } from "vitest";

/*
 * Shared helpers for the integration suites (see lobby.test.ts for the setup).
 * Test users: one pre-created, pre-confirmed teacher (TEST_TEACHER_EMAIL /
 * TEST_TEACHER_PASSWORD in .env.test.local) and anonymous students. No e-mails
 * are sent and auth errors are reported, never retried.
 */

export const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  teacherEmail: process.env.TEST_TEACHER_EMAIL?.trim(),
  teacherPassword: process.env.TEST_TEACHER_PASSWORD,
};

export const isConfigured = Boolean(env.url && env.key);

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

export async function signInTeacher() {
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

export async function signInStudent() {
  const client = newClient();
  const { error } = await client.auth.signInAnonymously();
  if (error) throw authFailure("Анонимный вход студента", error);
  return client;
}

export async function rpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export async function rpcError(client: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { error } = await client.rpc(fn, args);
  return error?.message ?? null;
}

/**
 * Our triggers send only { table, op }. Supabase Realtime adds its own message
 * `id` to database broadcasts; nothing else may travel, and that id must not be
 * one of our row ids (no domain data over the socket).
 */
export function expectLobbySignal(received: unknown, expected: { table: string; op: string }, domainIds: string[]) {
  expect(received).toMatchObject(expected);
  const signal = received as Record<string, unknown>;
  expect(Object.keys(signal).filter((key) => !["table", "op", "id"].includes(key))).toEqual([]);
  if (signal.id !== undefined) expect(domainIds).not.toContain(signal.id);
}

/** Subscribes to the private race channel and exposes a "wait for next event" helper. */
export async function listen(client: SupabaseClient, raceId: string) {
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

  /** Call before triggering the change; resolves with the first signal from `table` (or null). */
  function waitForTable(table: string, timeoutMs = 10_000) {
    const seen = events.length;
    return new Promise<unknown>((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      onEvent = () => {
        const match = events.slice(seen).find((event) => (event as { table?: string })?.table === table);
        if (match) {
          clearTimeout(timer);
          resolve(match);
        }
      };
    });
  }

  /**
   * A freshly joined private channel on the free tier sometimes misses the
   * first few seconds of messages. Before a test relies on a signal, cause a
   * harmless change (`poke`) until one actually arrives, at most three times.
   */
  async function warmUp(table: string, poke: () => Promise<unknown>) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const seen = waitForTable(table, 5_000);
      await poke();
      if (await seen) return true;
    }
    return false;
  }

  return { channel, status, nextEvent, waitForTable, warmUp };
}

/** Closes a reused teacher's race even after a failed test, then signs everyone out locally. */
export async function cleanUp(teacher: SupabaseClient | undefined, raceId: string | undefined, clients: SupabaseClient[]) {
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
}
