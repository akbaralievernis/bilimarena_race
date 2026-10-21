import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale } from "@/lib/i18n/locale";
import { buildCsp, newNonce } from "@/lib/security/csp";
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
  const redirect = rememberLanguage(request);
  if (redirect) return redirect;
  // A fresh nonce per request: Next.js reads it from the request's CSP header
  // and puts it on its own scripts (node_modules/next/dist/docs, CSP guide).
  const csp = buildCsp({
    nonce: newNonce(),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    dev: process.env.NODE_ENV === "development",
  });
  request.headers.set("content-security-policy", csp);
  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

// Routes that use the auth session, plus the pages the main site links to.
export const config = {
  matcher: ["/", "/status", "/login", "/create", "/join", "/race/:path*", "/auth/:path*"],
};
