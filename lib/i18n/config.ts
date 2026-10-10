import { ky } from "./messages/ky";
import { ru, type Messages } from "./messages/ru";

/*
 * Stage 8: the interface is in Kyrgyz (the default, like the main Bilim Arena
 * site) or Russian. The choice lives in a cookie, so it survives reloads and
 * reaches Server Components and Server Actions; there are no /ky or /ru URLs.
 */

export const LOCALES = ["ky", "ru"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ky";
export const LOCALE_COOKIE = "race_lang";

export const MESSAGES: Record<Locale, Messages> = { ky, ru };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export type { Messages };
