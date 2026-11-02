"use server";

import { headers } from "next/headers";
import type { ActionResult } from "@/lib/actions";
import { isSupabaseConfigured } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";
import { authErrorMessage } from "@/lib/race/errors";
import { cleanText } from "@/lib/race/validation";
import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

type AuthField = "name" | "email" | "password";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/** Address of this site for links in e-mails (confirmation, password reset). */
async function requestOrigin() {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("origin") ??
    `${requestHeaders.get("x-forwarded-proto") ?? "http"}://${requestHeaders.get("host")}`
  );
}

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    next: safeNextPath(formData.get("next")),
  };
}

export async function signInAction(formData: FormData): Promise<ActionResult<AuthField>> {
  const { m } = await getI18n();
  if (!isSupabaseConfigured()) return { ok: false, message: m.errors.setupRequired };

  const { email, password, next } = readCredentials(formData);
  const fieldErrors: Partial<Record<AuthField, string>> = {};
  if (!EMAIL_PATTERN.test(email)) fieldErrors.email = m.login.errors.email;
  if (password === "") fieldErrors.password = m.login.errors.password;
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: authErrorMessage(error, m) };

  return { ok: true, redirectTo: next };
}

export async function signUpAction(formData: FormData): Promise<ActionResult<AuthField>> {
  const { m } = await getI18n();
  if (!isSupabaseConfigured()) return { ok: false, message: m.errors.setupRequired };

  const { email, password, next } = readCredentials(formData);
  const name = cleanText(String(formData.get("name") ?? ""));
  const fieldErrors: Partial<Record<AuthField, string>> = {};
  if ([...name].length < 2 || [...name].length > 40) fieldErrors.name = m.login.errors.name;
  if (!EMAIL_PATTERN.test(email)) fieldErrors.email = m.login.errors.emailInvalid;
  if (password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = m.login.errors.passwordShort(MIN_PASSWORD_LENGTH);
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  const origin = await requestOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: name },
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { ok: false, message: authErrorMessage(error, m) };

  // With e-mail confirmation enabled there is no session until the link is opened.
  if (!data.session) {
    return {
      ok: true,
      message: m.login.checkEmail(email),
    };
  }
  return { ok: true, redirectTo: next };
}

/**
 * "Forgot password": Supabase e-mails a link that signs the teacher in and opens
 * /reset-password. The answer is the same whether or not the address has an
 * account, so the form cannot be used to find out who is registered.
 */
export async function requestPasswordResetAction(formData: FormData): Promise<ActionResult<"email">> {
  const { m } = await getI18n();
  if (!isSupabaseConfigured()) return { ok: false, message: m.errors.setupRequired };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return { ok: false, fieldErrors: { email: m.login.errors.emailInvalid } };

  const origin = await requestOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=${encodeURIComponent("/reset-password")}`,
  });
  if (error) {
    // Only errors the teacher can act on (no connection, too many e-mails); the rest look like success.
    const message = authErrorMessage(error, m);
    if (message !== m.errors.unknown) return { ok: false, message };
  }
  return { ok: true, message: m.login.reset.sent(email) };
}
