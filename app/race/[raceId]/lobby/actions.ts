"use server";

import { isSupabaseConfigured } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";
import { raceErrorMessage } from "@/lib/race/errors";
import { TIME_LIMIT_MAX_SECONDS, TIME_LIMIT_MIN_SECONDS } from "@/lib/race/timer";
import { isUuid, validateTeamName } from "@/lib/race/validation";
import { createClient } from "@/lib/supabase/server";

/*
 * Teacher actions in the lobby. Server Actions are public HTTP endpoints, so
 * every argument is re-validated here, and the database functions decide
 * whether the caller may do it (owner of the race, valid status, same race).
 */

export type LobbyActionResult = { ok: true } | { ok: false; message: string };

async function invalidRequest(): Promise<LobbyActionResult> {
  const { m } = await getI18n();
  return { ok: false, message: m.errors.invalidRequest };
}

async function callRpc(fn: string, args: Record<string, unknown>): Promise<LobbyActionResult> {
  const { m } = await getI18n();
  if (!isSupabaseConfigured()) return { ok: false, message: m.errors.setupRequired };
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (!error) return { ok: true };
  return {
    ok: false,
    message: raceErrorMessage(error, { race_not_found: m.errors.raceNotFoundAction }, m),
  };
}

const isId = (value: unknown): value is string => typeof value === "string" && isUuid(value);

export async function createTeamAction(raceId: unknown, name: unknown): Promise<LobbyActionResult> {
  if (!isId(raceId) || typeof name !== "string") return invalidRequest();
  const team = validateTeamName(name, (await getI18n()).m);
  if (!team.ok) return { ok: false, message: team.error };
  return callRpc("create_team", { p_race_id: raceId, p_name: team.value });
}

export async function renameTeamAction(teamId: unknown, name: unknown): Promise<LobbyActionResult> {
  if (!isId(teamId) || typeof name !== "string") return invalidRequest();
  const team = validateTeamName(name, (await getI18n()).m);
  if (!team.ok) return { ok: false, message: team.error };
  return callRpc("rename_team", { p_team_id: teamId, p_name: team.value });
}

export async function deleteTeamAction(teamId: unknown): Promise<LobbyActionResult> {
  if (!isId(teamId)) return invalidRequest();
  return callRpc("delete_team", { p_team_id: teamId });
}

export async function assignParticipantAction(participantId: unknown, teamId: unknown): Promise<LobbyActionResult> {
  if (!isId(participantId) || (teamId !== null && !isId(teamId))) return invalidRequest();
  return callRpc("assign_participant", { p_participant_id: participantId, p_team_id: teamId });
}

export async function startRaceAction(raceId: unknown): Promise<LobbyActionResult> {
  if (!isId(raceId)) return invalidRequest();
  return callRpc("start_race", { p_race_id: raceId });
}

export async function finishRaceAction(raceId: unknown): Promise<LobbyActionResult> {
  if (!isId(raceId)) return invalidRequest();
  return callRpc("finish_race", { p_race_id: raceId });
}

/** Stage 7: race time limit in seconds, or null for none. */
export async function setTimeLimitAction(raceId: unknown, seconds: unknown): Promise<LobbyActionResult> {
  const valid =
    seconds === null ||
    (Number.isInteger(seconds) &&
      (seconds as number) >= TIME_LIMIT_MIN_SECONDS &&
      (seconds as number) <= TIME_LIMIT_MAX_SECONDS);
  if (!isId(raceId) || !valid) return invalidRequest();
  return callRpc("set_race_time_limit", { p_race_id: raceId, p_seconds: seconds });
}
