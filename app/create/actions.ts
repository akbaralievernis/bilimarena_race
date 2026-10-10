"use server";

import type { ActionResult } from "@/lib/actions";
import { getViewer, isTeacher } from "@/lib/auth/viewer";
import { isSupabaseConfigured } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";
import { raceErrorCode, raceErrorMessage } from "@/lib/race/errors";
import { parseRouteDraft, type RouteDraftError } from "@/lib/race/tasks";
import { isUuid, validateRaceDescription, validateRaceTitle } from "@/lib/race/validation";
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
  const { m } = await getI18n();
  if (!isSupabaseConfigured()) return { ok: false, message: m.errors.setupRequired };

  const title = validateRaceTitle(String(formData.get("title") ?? ""), m);
  const description = validateRaceDescription(String(formData.get("description") ?? ""), m);
  // The route editor posts [{ title, task }] in route order as JSON.
  const route = parseRouteDraft(readRoute(formData), m);

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
    return { ok: false, message: m.create.signInFirst };
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
    if (code && ROUTE_ERRORS.has(code)) return { ok: false, fieldErrors: { route: raceErrorMessage(error, {}, m) } };
    return { ok: false, message: raceErrorMessage(error, {}, m) };
  }

  return { ok: true, redirectTo: `/race/${data}/lobby` };
}

/**
 * Stage 9: the same race again for another class — duplicate_race() copies the
 * route, tasks, time limit and team names (owner only) and the teacher lands
 * in the new lobby with a new room code.
 */
export async function duplicateRaceAction(raceId: unknown): Promise<ActionResult> {
  const { m } = await getI18n();
  if (!isSupabaseConfigured()) return { ok: false, message: m.errors.setupRequired };
  if (typeof raceId !== "string" || !isUuid(raceId)) return { ok: false, message: m.errors.invalidRequest };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_race", { p_race_id: raceId });
  if (error || typeof data !== "string") {
    return { ok: false, message: raceErrorMessage(error, { race_not_found: m.errors.raceNotFoundAction }, m) };
  }
  return { ok: true, redirectTo: `/race/${data}/lobby` };
}
