"use server";

import type { ActionResult } from "@/lib/actions";
import { isSupabaseConfigured } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";
import { authErrorMessage } from "@/lib/race/errors";
import { createClient } from "@/lib/supabase/server";

const MIN_PASSWORD_LENGTH = 8;

/** New password for the teacher who opened the reset link (the link signed them in). */
export async function updatePasswordAction(formData: FormData): Promise<ActionResult<"password">> {
  const { m } = await getI18n();
  if (!isSupabaseConfigured()) return { ok: false, message: m.errors.setupRequired };

  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, fieldErrors: { password: m.login.errors.passwordShort(MIN_PASSWORD_LENGTH) } };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || data.user.is_anonymous) return { ok: false, message: m.resetPassword.expired };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, message: authErrorMessage(error, m) };
  return { ok: true, redirectTo: "/" };
}
