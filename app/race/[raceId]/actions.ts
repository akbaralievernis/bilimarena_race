"use server";

import { SETUP_REQUIRED_MESSAGE } from "@/lib/actions";
import { isSupabaseConfigured } from "@/lib/env";
import { raceErrorMessage } from "@/lib/race/errors";
import { isUuid } from "@/lib/race/validation";
import { createClient } from "@/lib/supabase/server";

const INVALID_REQUEST = { ok: false as const, message: "Некорректный запрос. Обновите страницу." };

export type AdvanceResult =
  | { ok: true; position: number; finished: boolean; moved: boolean }
  | { ok: false; message: string };

/**
 * Stage 2 move for checkpoints without a task (legacy races). advance_team()
 * checks membership, race status, the N → N+1 rule and refuses task points.
 */
export async function advanceTeamAction(teamId: unknown, toPosition: unknown): Promise<AdvanceResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: SETUP_REQUIRED_MESSAGE };
  if (typeof teamId !== "string" || !isUuid(teamId) || !Number.isInteger(toPosition) || (toPosition as number) < 1) {
    return INVALID_REQUEST;
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

export type AnswerResult =
  | { ok: true; correct: boolean | null; moved: boolean; alreadyPassed: boolean; position: number; finished: boolean }
  | { ok: false; message: string };

/**
 * Sends an answer to submit_answer(), which alone decides whether it is
 * correct. The response carries the verdict only — never the right answer.
 * `answer`: option index ("0".."5") or the short answer text.
 */
export async function submitAnswerAction(teamId: unknown, taskId: unknown, answer: unknown): Promise<AnswerResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: SETUP_REQUIRED_MESSAGE };
  if (
    typeof teamId !== "string" ||
    !isUuid(teamId) ||
    typeof taskId !== "string" ||
    !isUuid(taskId) ||
    typeof answer !== "string"
  ) {
    return INVALID_REQUEST;
  }
  const value = answer.trim();
  if (value === "" || [...value].length > 200) {
    return { ok: false, message: raceErrorMessage({ message: "invalid_answer" }) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_answer", {
    p_team_id: teamId,
    p_task_id: taskId,
    p_answer: value,
  });
  if (error) return { ok: false, message: raceErrorMessage(error) };

  const result = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    correct: typeof result.correct === "boolean" ? result.correct : null,
    moved: result.moved === true,
    alreadyPassed: result.alreadyPassed === true,
    position: typeof result.position === "number" ? result.position : 0,
    finished: result.finished === true,
  };
}
