import { ru, type Messages } from "@/lib/i18n/messages/ru";

/*
 * Stage 7: race timer. The database owns the clock (ends_at, remainingSeconds
 * by the server's time); these helpers only format and offer choices.
 */

/** Choices for the teacher, in minutes; null = no limit. */
export const TIME_LIMIT_MINUTES = [5, 10, 15, 20, 30, 45, 60, 90] as const;

/** "+5 минут" while the race is running. */
export const EXTEND_SECONDS = 5 * 60;

export const TIME_LIMIT_MIN_SECONDS = 60;
export const TIME_LIMIT_MAX_SECONDS = 120 * 60;

/** The last minute is shown as urgent. */
export const URGENT_SECONDS = 60;

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

/** 600 → "10 минут" / "10 мүнөт". */
export function minutesLabel(seconds: number, m: Messages = ru): string {
  return m.timer.minutes(seconds);
}

/** The limit after "+5 минут", or null when it would exceed the maximum. */
export function extendedLimit(current: number): number | null {
  const next = current + EXTEND_SECONDS;
  return next <= TIME_LIMIT_MAX_SECONDS ? next : null;
}
