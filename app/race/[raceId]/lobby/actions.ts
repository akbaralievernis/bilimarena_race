"use server";

import { SETUP_REQUIRED_MESSAGE } from "@/lib/actions";
import { isSupabaseConfigured } from "@/lib/env";
import { raceErrorMessage } from "@/lib/race/errors";
import { isUuid, validateTeamName } from "@/lib/race/validation";
import { createClient } from "@/lib/supabase/server";

/*
 * Teacher actions in the lobby. Server Actions are public HTTP endpoints, so
 * every argument is re-validated here, and the database functions decide
 * whether the caller may do it (owner of the race, valid status, same race).
 */

export type LobbyActionResult = { ok: true } | { ok: false; message: string };

const INVALID_REQUEST: LobbyActionResult = { ok: false, message: "Некорректный запрос. Обновите страницу." };

async function callRpc(fn: string, args: Record<string, unknown>): Promise<LobbyActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: SETUP_REQUIRED_MESSAGE };
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (!error) return { ok: true };
  return {
    ok: false,
    message: raceErrorMessage(error, {
      race_not_found: "Гонка не найдена или у вас нет прав на это действие.",
    }),
  };
}

const isId = (value: unknown): value is string => typeof value === "string" && isUuid(value);

export async function createTeamAction(raceId: unknown, name: unknown): Promise<LobbyActionResult> {
  if (!isId(raceId) || typeof name !== "string") return INVALID_REQUEST;
  const team = validateTeamName(name);
  if (!team.ok) return { ok: false, message: team.error };
  return callRpc("create_team", { p_race_id: raceId, p_name: team.value });
}

export async function renameTeamAction(teamId: unknown, name: unknown): Promise<LobbyActionResult> {
  if (!isId(teamId) || typeof name !== "string") return INVALID_REQUEST;
  const team = validateTeamName(name);
  if (!team.ok) return { ok: false, message: team.error };
  return callRpc("rename_team", { p_team_id: teamId, p_name: team.value });
}

export async function deleteTeamAction(teamId: unknown): Promise<LobbyActionResult> {
  if (!isId(teamId)) return INVALID_REQUEST;
  return callRpc("delete_team", { p_team_id: teamId });
}

export async function assignParticipantAction(participantId: unknown, teamId: unknown): Promise<LobbyActionResult> {
  if (!isId(participantId) || (teamId !== null && !isId(teamId))) return INVALID_REQUEST;
  return callRpc("assign_participant", { p_participant_id: participantId, p_team_id: teamId });
}

export async function startRaceAction(raceId: unknown): Promise<LobbyActionResult> {
  if (!isId(raceId)) return INVALID_REQUEST;
  return callRpc("start_race", { p_race_id: raceId });
}

export async function finishRaceAction(raceId: unknown): Promise<LobbyActionResult> {
  if (!isId(raceId)) return INVALID_REQUEST;
  return callRpc("finish_race", { p_race_id: raceId });
}
