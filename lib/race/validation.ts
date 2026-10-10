/*
 * Input rules shared by forms and Server Actions. The database enforces the
 * same limits again (see supabase/migrations) — this layer exists for
 * friendly messages, not for security.
 */

import { ru, type Messages } from "@/lib/i18n/messages/ru";

export const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 6;

export const LIMITS = {
  displayName: { min: 2, max: 30 },
  raceTitle: { min: 3, max: 80 },
  raceDescription: { max: 500 },
  teamName: { min: 1, max: 40 },
  checkpointTitle: { min: 1, max: 60 },
  route: { min: 1, max: 20 },
} as const;

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

// Students often type the code on a Russian keyboard layout.
const CYRILLIC_LOOKALIKES: Record<string, string> = {
  а: "A", А: "A", в: "B", В: "B", е: "E", Е: "E", к: "K", К: "K",
  м: "M", М: "M", н: "H", Н: "H", о: "O", О: "O", р: "P", Р: "P",
  с: "C", С: "C", т: "T", Т: "T", х: "X", Х: "X", у: "Y", У: "Y",
};

export type Validation<T = string> = { ok: true; value: T } | { ok: false; error: string };

/** Same normalization as private.normalize_room_code() in the database. */
export function normalizeRoomCode(input: string): string {
  return input
    .replace(/[аАвВеЕкКмМнНоОрРсСтТхХуУ]/g, (char) => CYRILLIC_LOOKALIKES[char])
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
}

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_PATTERN.test(code);
}

/** "A7K9Q2" → "A7K 9Q2" for reading aloud. */
export function formatRoomCode(code: string): string {
  return code.length === ROOM_CODE_LENGTH ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

export function validateRoomCode(input: string, m: Messages = ru): Validation {
  const value = normalizeRoomCode(input);
  if (value === "") return { ok: false, error: m.validation.codeEmpty };
  if (value.length !== ROOM_CODE_LENGTH) {
    return { ok: false, error: m.validation.codeLength };
  }
  if (!isValidRoomCode(value)) {
    return { ok: false, error: m.validation.codeChars };
  }
  return { ok: true, value };
}

/** Collapses inner whitespace and trims, like private.clean_text(). */
export function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function length(value: string): number {
  return [...value].length;
}

export function validateDisplayName(input: string, m: Messages = ru): Validation {
  const value = cleanText(input);
  const { min, max } = LIMITS.displayName;
  if (length(value) < min) return { ok: false, error: m.validation.nameShort };
  if (length(value) > max) return { ok: false, error: m.validation.nameLong(max) };
  if (!/^[\p{L}\p{M}\p{N} .'’-]+$/u.test(value)) {
    return { ok: false, error: m.validation.nameChars };
  }
  if (!/\p{L}/u.test(value)) return { ok: false, error: m.validation.nameLetter };
  return { ok: true, value };
}

export function validateRaceTitle(input: string, m: Messages = ru): Validation {
  const value = cleanText(input);
  const { min, max } = LIMITS.raceTitle;
  if (length(value) < min) return { ok: false, error: m.validation.titleShort(min) };
  if (length(value) > max) return { ok: false, error: m.validation.titleLong(max) };
  return { ok: true, value };
}

export function validateRaceDescription(input: string, m: Messages = ru): Validation<string | null> {
  const value = input.trim();
  if (value === "") return { ok: true, value: null };
  const { max } = LIMITS.raceDescription;
  if (length(value) > max) return { ok: false, error: m.validation.descriptionLong(max) };
  return { ok: true, value };
}

export function validateTeamName(input: string, m: Messages = ru): Validation {
  const value = cleanText(input);
  const { min, max } = LIMITS.teamName;
  if (length(value) < min) return { ok: false, error: m.validation.teamEmpty };
  if (length(value) > max) return { ok: false, error: m.validation.teamLong(max) };
  return { ok: true, value };
}

export function validateCheckpointTitle(input: string, m: Messages = ru): Validation {
  const value = cleanText(input);
  const { min, max } = LIMITS.checkpointTitle;
  if (length(value) < min) return { ok: false, error: m.validation.checkpointEmpty };
  if (length(value) > max) return { ok: false, error: m.validation.checkpointLong(max) };
  return { ok: true, value };
}

export type RouteValidation =
  | { ok: true; value: string[] }
  | { ok: false; error?: string; itemErrors: Record<number, string> };

/** Checkpoint titles in route order. Positions are assigned by the database. */
export function validateRoute(titles: string[], m: Messages = ru): RouteValidation {
  const { min, max } = LIMITS.route;
  if (titles.length < min) return { ok: false, error: m.validation.routeEmpty, itemErrors: {} };
  if (titles.length > max) return { ok: false, error: m.validation.routeMax(max), itemErrors: {} };

  const itemErrors: Record<number, string> = {};
  const value = titles.map((title, index) => {
    const checked = validateCheckpointTitle(title, m);
    if (!checked.ok) itemErrors[index] = checked.error;
    return checked.ok ? checked.value : "";
  });
  return Object.keys(itemErrors).length > 0 ? { ok: false, itemErrors } : { ok: true, value };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
