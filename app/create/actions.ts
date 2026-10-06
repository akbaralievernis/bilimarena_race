"use server";

import type { ActionResult } from "@/lib/actions";
import { SETUP_REQUIRED_MESSAGE } from "@/lib/actions";
import { getViewer, isTeacher } from "@/lib/auth/viewer";
import { isSupabaseConfigured } from "@/lib/env";
import { raceErrorCode, raceErrorMessage } from "@/lib/race/errors";
import { parseRouteDraft, type RouteDraftError } from "@/lib/race/tasks";
import { validateRaceDescription, validateRaceTitle } from "@/lib/race/validation";
import { createClient } from "@/lib/supabase/server";

export type CreateRaceField = "title" | "description" | "route" | RouteDraftError;

const ROUTE_ERRORS = new Set(["invalid_route", "invalid_checkpoint_title", "invalid_tasks", "invalid_task"]);

function readRoute(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get("route") ?? ""));
  } catch {
    return null;
  }
}

export async function createRaceAction(formData: FormData): Promise<ActionResult<CreateRaceField>> {
  if (!isSupabaseConfigured()) return { ok: false, message: SETUP_REQUIRED_MESSAGE };

  const title = validateRaceTitle(String(formData.get("title") ?? ""));
  const description = validateRaceDescription(String(formData.get("description") ?? ""));
  // The route editor posts [{ title, task }] in route order as JSON.
  const route = parseRouteDraft(readRoute(formData));

  if (!title.ok || !description.ok || !route.ok) {
    return {
      ok: false,
      fieldErrors: {
        title: title.ok ? undefined : title.error,
        description: description.ok ? undefined : description.error,
        ...(route.ok ? {} : { route: route.error, ...route.fieldErrors }),
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
    p_checkpoints: route.value.titles,
    p_tasks: route.value.tasks,
  });
  if (error || typeof data !== "string") {
    const code = raceErrorCode(error);
    if (code && ROUTE_ERRORS.has(code)) return { ok: false, fieldErrors: { route: raceErrorMessage(error) } };
    return { ok: false, message: raceErrorMessage(error) };
  }

  return { ok: true, redirectTo: `/race/${data}/lobby` };
}
