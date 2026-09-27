/*
 * Input rules shared by forms and Server Actions. The database enforces the
 * same limits again (see supabase/migrations) — this layer exists for
 * friendly messages, not for security.
 */

export const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 6;

export const LIMITS = {
  displayName: { min: 2, max: 30 },
  raceTitle: { min: 3, max: 80 },
  raceDescription: { max: 500 },
  teamName: { min: 1, max: 40 },
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

export function validateRoomCode(input: string): Validation {
  const value = normalizeRoomCode(input);
  if (value === "") return { ok: false, error: "Введите код гонки." };
  if (value.length !== ROOM_CODE_LENGTH) {
    return { ok: false, error: "Код гонки состоит из 6 символов." };
  }
  if (!isValidRoomCode(value)) {
    return { ok: false, error: "В кодах нет символов 0, 1, O и I — проверьте код." };
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

export function validateDisplayName(input: string): Validation {
  const value = cleanText(input);
  const { min, max } = LIMITS.displayName;
  if (length(value) < min) return { ok: false, error: "Введите имя — хотя бы 2 символа." };
  if (length(value) > max) return { ok: false, error: `Имя слишком длинное — максимум ${max} символов.` };
  if (!/^[\p{L}\p{M}\p{N} .'’-]+$/u.test(value)) {
    return { ok: false, error: "Используйте буквы, цифры, пробел, точку, дефис или апостроф." };
  }
  if (!/\p{L}/u.test(value)) return { ok: false, error: "Имя должно содержать хотя бы одну букву." };
  return { ok: true, value };
}

export function validateRaceTitle(input: string): Validation {
  const value = cleanText(input);
  const { min, max } = LIMITS.raceTitle;
  if (length(value) < min) return { ok: false, error: `Название — хотя бы ${min} символа.` };
  if (length(value) > max) return { ok: false, error: `Название слишком длинное — максимум ${max} символов.` };
  return { ok: true, value };
}

export function validateRaceDescription(input: string): Validation<string | null> {
  const value = input.trim();
  if (value === "") return { ok: true, value: null };
  const { max } = LIMITS.raceDescription;
  if (length(value) > max) return { ok: false, error: `Описание слишком длинное — максимум ${max} символов.` };
  return { ok: true, value };
}

export function validateTeamName(input: string): Validation {
  const value = cleanText(input);
  const { min, max } = LIMITS.teamName;
  if (length(value) < min) return { ok: false, error: "Введите название команды." };
  if (length(value) > max) return { ok: false, error: `Название команды — максимум ${max} символов.` };
  return { ok: true, value };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
