"use server";

import type { ActionResult } from "@/lib/actions";
import { isSupabaseConfigured } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";
import { authErrorMessage, raceErrorCode, raceErrorMessage } from "@/lib/race/errors";
import { validateDisplayName, validateRoomCode } from "@/lib/race/validation";
import { createClient } from "@/lib/supabase/server";

type JoinField = "code" | "name";

const CODE_ERRORS = new Set(["race_not_found", "race_finished", "race_not_open", "race_full"]);
const NAME_ERRORS = new Set(["display_name_taken", "invalid_display_name"]);

/**
 * Student join: with the (anonymous) session from the browser, let join_race() validate
 * the code and create the seat. The browser never writes the participant row.
 */
export async function joinRaceAction(formData: FormData): Promise<ActionResult<JoinField>> {
  const { m } = await getI18n();
  if (!isSupabaseConfigured()) return { ok: false, message: m.errors.setupRequired };

  const code = validateRoomCode(String(formData.get("code") ?? ""), m);
  const name = validateDisplayName(String(formData.get("name") ?? ""), m);
  if (!code.ok || !name.ok) {
    return {
      ok: false,
      fieldErrors: { code: code.ok ? undefined : code.error, name: name.ok ? undefined : name.error },
    };
  }

  const supabase = await createClient();
  const { data: session } = await supabase.auth.getClaims();
  if (!session?.claims) {
    // Normally the browser has already signed in (join-form.tsx — the rate
    // limit then counts the school's IP, not the server's). This is a fallback.
    // A returning student keeps the same anonymous user (cookie), so a reload
    // or a retry after a typo never creates a second participant.
    const { error } = await supabase.auth.signInAnonymously();
    if (error) return { ok: false, message: authErrorMessage(error, m) };
  }

  const { data: raceId, error } = await supabase.rpc("join_race", {
    p_code: code.value,
    p_display_name: name.value,
  });
  if (error || typeof raceId !== "string") {
    const errorCode = raceErrorCode(error);
    const message = raceErrorMessage(error, {}, m);
    if (errorCode && CODE_ERRORS.has(errorCode)) return { ok: false, fieldErrors: { code: message } };
    if (errorCode && NAME_ERRORS.has(errorCode)) return { ok: false, fieldErrors: { name: message } };
    return { ok: false, message };
  }

  return { ok: true, redirectTo: `/race/${raceId}/lobby` };
}
