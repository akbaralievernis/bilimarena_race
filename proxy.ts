import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale } from "@/lib/i18n/locale";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Stage 10: links from the main Bilim Arena site carry its language
 * (?lang=ky|ru). Remember it in the cookie and drop it from the address, so
 * the page itself renders in that language and a shared link stays clean.
 */
export function rememberLanguage(request: NextRequest): NextResponse | null {
  const lang = request.nextUrl.searchParams.get("lang");
  if (lang === null) return null;
  const url = request.nextUrl.clone();
  url.searchParams.delete("lang");
  const response = NextResponse.redirect(url);
  if (isLocale(lang)) {
    response.cookies.set(LOCALE_COOKIE, lang, { path: "/", maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: "lax" });
  }
  return response;
}

export async function proxy(request: NextRequest) {
  return rememberLanguage(request) ?? updateSession(request);
}

// Routes that use the auth session, plus the pages the main site links to.
export const config = {
  matcher: ["/", "/status", "/login", "/create", "/join", "/race/:path*", "/auth/:path*"],
};
