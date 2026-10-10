import "server-only";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, MESSAGES, toLocale, type Locale, type Messages } from "./config";

export async function getLocale(): Promise<Locale> {
  return toLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}

/** The viewer's language and texts, for Server Components and Server Actions. */
export async function getI18n(): Promise<{ locale: Locale; m: Messages }> {
  const locale = await getLocale();
  return { locale, m: MESSAGES[locale] };
}

type PageKey = keyof Messages["meta"]["pages"];

/** `export const generateMetadata = pageMetadata("create")` — the tab title in the viewer's language. */
export function pageMetadata(key: PageKey) {
  return async () => ({ title: (await getI18n()).m.meta.pages[key] });
}
