import { ky } from "./messages/ky";
import { ru, type Messages } from "./messages/ru";
import type { Locale } from "./locale";

/*
 * Stage 8: the interface is in Kyrgyz (the default, like the main Bilim Arena
 * site) or Russian. The choice lives in a cookie, so it survives reloads and
 * reaches Server Components and Server Actions; there are no /ky or /ru URLs.
 * Stage 10: a link from the main site may carry ?lang=ky|ru (proxy.ts).
 */

export { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, isLocale, toLocale, type Locale } from "./locale";

export const MESSAGES: Record<Locale, Messages> = { ky, ru };

export type { Messages };
