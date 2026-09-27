"use server";

import type { ActionResult } from "@/lib/actions";
import { SETUP_REQUIRED_MESSAGE } from "@/lib/actions";
import { getViewer, isTeacher } from "@/lib/auth/viewer";
import { isSupabaseConfigured } from "@/lib/env";
import { raceErrorCode, raceErrorMessage } from "@/lib/race/errors";
import { validateRaceDescription, validateRaceTitle, validateRoute } from "@/lib/race/validation";
import { createClient } from "@/lib/supabase/server";

export type CreateRaceField = "title" | "description" | "route" | `checkpoint-${number}`;

export async function createRaceAction(formData: FormData): Promise<ActionResult<CreateRaceField>> {
  if (!isSupabaseConfigured()) return { ok: false, message: SETUP_REQUIRED_MESSAGE };

  const title = validateRaceTitle(String(formData.get("title") ?? ""));
  const description = validateRaceDescription(String(formData.get("description") ?? ""));
  // Checkpoint titles arrive in the order of the form fields = route order.
  const route = validateRoute(formData.getAll("checkpoint").map((value) => String(value)));

  if (!title.ok || !description.ok || !route.ok) {
    const fieldErrors: Partial<Record<CreateRaceField, string>> = {
      title: title.ok ? undefined : title.error,
      description: description.ok ? undefined : description.error,
    };
    if (!route.ok) {
      fieldErrors.route = route.error;
      for (const [index, error] of Object.entries(route.itemErrors)) fieldErrors[`checkpoint-${Number(index)}`] = error;
    }
    return { ok: false, fieldErrors };
  }

  // Friendly early exit only: create_race() rejects non-teachers itself.
  if (!isTeacher(await getViewer())) {
    return { ok: false, message: "Войдите как учитель, чтобы создать гонку." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_race", {
    p_title: title.value,
    p_description: description.value,
    p_checkpoints: route.value,
  });
  if (error || typeof data !== "string") {
    const code = raceErrorCode(error);
    if (code === "invalid_route" || code === "invalid_checkpoint_title") {
      return { ok: false, fieldErrors: { route: raceErrorMessage(error) } };
    }
    return { ok: false, message: raceErrorMessage(error) };
  }

  return { ok: true, redirectTo: `/race/${data}/lobby` };
}
