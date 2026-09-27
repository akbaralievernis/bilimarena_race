"use server";

import type { ActionResult } from "@/lib/actions";
import { SETUP_REQUIRED_MESSAGE } from "@/lib/actions";
import { getViewer, isTeacher } from "@/lib/auth/viewer";
import { isSupabaseConfigured } from "@/lib/env";
import { raceErrorMessage } from "@/lib/race/errors";
import { validateRaceDescription, validateRaceTitle } from "@/lib/race/validation";
import { createClient } from "@/lib/supabase/server";

type CreateRaceField = "title" | "description";

export async function createRaceAction(formData: FormData): Promise<ActionResult<CreateRaceField>> {
  if (!isSupabaseConfigured()) return { ok: false, message: SETUP_REQUIRED_MESSAGE };

  const title = validateRaceTitle(String(formData.get("title") ?? ""));
  const description = validateRaceDescription(String(formData.get("description") ?? ""));
  if (!title.ok || !description.ok) {
    return {
      ok: false,
      fieldErrors: {
        title: title.ok ? undefined : title.error,
        description: description.ok ? undefined : description.error,
      },
    };
  }

  // Friendly early exit only: create_race() rejects non-teachers itself.
  if (!isTeacher(await getViewer())) {
    return { ok: false, message: "Войдите как учитель, чтобы создать гонку." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_race", {
    p_title: title.value,
    p_description: description.value,
  });
  if (error || typeof data !== "string") return { ok: false, message: raceErrorMessage(error) };

  return { ok: true, redirectTo: `/race/${data}/lobby` };
}
