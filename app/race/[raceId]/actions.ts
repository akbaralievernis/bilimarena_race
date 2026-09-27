"use server";

import { SETUP_REQUIRED_MESSAGE } from "@/lib/actions";
import { isSupabaseConfigured } from "@/lib/env";
import { raceErrorMessage } from "@/lib/race/errors";
import { isUuid } from "@/lib/race/validation";
import { createClient } from "@/lib/supabase/server";

export type AdvanceResult =
  | { ok: true; position: number; finished: boolean; moved: boolean }
  | { ok: false; message: string };

/**
 * Moves the caller's team to `toPosition` (must be the next point).
 * advance_team() checks membership, race status and the N → N+1 rule.
 */
export async function advanceTeamAction(teamId: unknown, toPosition: unknown): Promise<AdvanceResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: SETUP_REQUIRED_MESSAGE };
  if (typeof teamId !== "string" || !isUuid(teamId) || !Number.isInteger(toPosition) || (toPosition as number) < 1) {
    return { ok: false, message: "Некорректный запрос. Обновите страницу." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("advance_team", { p_team_id: teamId, p_to_position: toPosition });
  if (error) return { ok: false, message: raceErrorMessage(error) };

  const result = (data ?? {}) as { position?: unknown; finished?: unknown; moved?: unknown };
  return {
    ok: true,
    position: typeof result.position === "number" ? result.position : (toPosition as number),
    finished: result.finished === true,
    moved: result.moved === true,
  };
}
