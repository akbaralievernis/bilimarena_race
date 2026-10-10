"use server";

import { isSupabaseConfigured } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";
import { raceErrorMessage } from "@/lib/race/errors";
import { isUuid } from "@/lib/race/validation";
import { createClient } from "@/lib/supabase/server";


export type AdvanceResult =
  | { ok: true; position: number; finished: boolean; moved: boolean }
  | { ok: false; message: string };

/**
 * Stage 2 move for checkpoints without a task (legacy races). advance_team()
 * checks membership, race status, the N → N+1 rule and refuses task points.
 */
export async function advanceTeamAction(teamId: unknown, toPosition: unknown): Promise<AdvanceResult> {
  const { m } = await getI18n();
  if (!isSupabaseConfigured()) return { ok: false, message: m.errors.setupRequired };
  if (typeof teamId !== "string" || !isUuid(teamId) || !Number.isInteger(toPosition) || (toPosition as number) < 1) {
    return { ok: false, message: m.errors.invalidRequest };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("advance_team", { p_team_id: teamId, p_to_position: toPosition });
  if (error) return { ok: false, message: raceErrorMessage(error, {}, m) };

  const result = (data ?? {}) as { position?: unknown; finished?: unknown; moved?: unknown };
  return {
    ok: true,
    position: typeof result.position === "number" ? result.position : (toPosition as number),
    finished: result.finished === true,
    moved: result.moved === true,
  };
}

export type AnswerResult =
  | {
      ok: true;
      correct: boolean | null;
      moved: boolean;
      alreadyPassed: boolean;
      position: number;
      finished: boolean;
      /** Points this answer earned (Stage 4): 100 + speed bonus, −20 or 0. */
      points: number;
      /** Pause before the team may answer again; 0 after a correct answer. */
      cooldownSeconds: number;
    }
  | { ok: false; message: string };

/**
 * Sends an answer to submit_answer(), which alone decides whether it is
 * correct. The response carries the verdict only — never the right answer.
 * `answer`: option index ("0".."5") or the short answer text.
 */
export async function submitAnswerAction(teamId: unknown, taskId: unknown, answer: unknown): Promise<AnswerResult> {
  const { m } = await getI18n();
  if (!isSupabaseConfigured()) return { ok: false, message: m.errors.setupRequired };
  if (
    typeof teamId !== "string" ||
    !isUuid(teamId) ||
    typeof taskId !== "string" ||
    !isUuid(taskId) ||
    typeof answer !== "string"
  ) {
    return { ok: false, message: m.errors.invalidRequest };
  }
  const value = answer.trim();
  if (value === "" || [...value].length > 200) {
    return { ok: false, message: m.errors.race.invalid_answer };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_answer", {
    p_team_id: teamId,
    p_task_id: taskId,
    p_answer: value,
  });
  if (error) return { ok: false, message: raceErrorMessage(error, {}, m) };

  const result = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    correct: typeof result.correct === "boolean" ? result.correct : null,
    moved: result.moved === true,
    alreadyPassed: result.alreadyPassed === true,
    position: typeof result.position === "number" ? result.position : 0,
    finished: result.finished === true,
    points: typeof result.points === "number" ? result.points : 0,
    cooldownSeconds: typeof result.cooldownSeconds === "number" ? result.cooldownSeconds : 0,
  };
}
