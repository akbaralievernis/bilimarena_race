/*
 * Database functions raise stable snake_case codes (SQLSTATE P0001, message =
 * code). This module turns them — and network/auth failures — into texts for
 * the UI. Unknown errors never leak raw database messages to users.
 */

import { ru, type Messages, type RaceErrorCode } from "@/lib/i18n/messages/ru";

export type { RaceErrorCode };

// PostgREST / Postgres codes for "function or table does not exist" — the
// project is reachable but the migrations have not been applied.
const DATABASE_NOT_READY_CODES = new Set(["PGRST202", "PGRST205", "42883", "42P01"]);

type ErrorLike = { message?: unknown; code?: unknown; name?: unknown };

function asErrorLike(error: unknown): ErrorLike {
  return typeof error === "object" && error !== null ? (error as ErrorLike) : {};
}

export function raceErrorCode(error: unknown): RaceErrorCode | null {
  const { message } = asErrorLike(error);
  return typeof message === "string" && Object.hasOwn(ru.errors.race, message)
    ? (message as RaceErrorCode)
    : null;
}

export function isNetworkError(error: unknown): boolean {
  const { message, name } = asErrorLike(error);
  if (name === "AuthRetryableFetchError") return true;
  const text = typeof message === "string" ? message : "";
  return /fetch failed|failed to fetch|networkerror|network request failed|load failed|econnrefused|enotfound|etimedout/i.test(
    text,
  );
}

/** The project answers, but a function or table is missing: migrations not applied. */
export function isDatabaseNotReady(error: unknown): boolean {
  const { code } = asErrorLike(error);
  return typeof code === "string" && DATABASE_NOT_READY_CODES.has(code);
}

/**
 * UI text for an error from a race RPC, in the viewer's language (`m`, from
 * getI18n() or useI18n()). `overrides` adapts texts to the screen.
 */
export function raceErrorMessage(
  error: unknown,
  overrides: Partial<Record<RaceErrorCode, string>> = {},
  m: Messages = ru,
): string {
  if (isNetworkError(error)) return m.errors.network;
  const code = raceErrorCode(error);
  if (code) return overrides[code] ?? m.errors.race[code];
  if (isDatabaseNotReady(error)) return m.errors.databaseNotReady;
  return m.errors.unknown;
}

export function authErrorMessage(error: unknown, m: Messages = ru): string {
  if (isNetworkError(error)) return m.errors.network;
  const { code } = asErrorLike(error);
  return (typeof code === "string" && m.errors.auth[code]) || m.errors.unknown;
}

/** "No connection" or "something went wrong" for an exception on the client. */
export function clientErrorMessage(error: unknown, m: Messages = ru): string {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return offline || isNetworkError(error) ? m.errors.network : m.errors.unknown;
}
