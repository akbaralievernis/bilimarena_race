import "server-only";

import { getViewer } from "@/lib/auth/viewer";
import { isSupabaseConfigured } from "@/lib/env";
import { isNetworkError } from "@/lib/race/errors";
import { parseLobby, type LobbySnapshot } from "@/lib/race/lobby";
import { createClient } from "@/lib/supabase/server";

export type RaceLoad =
  | { kind: "ok"; lobby: LobbySnapshot }
  | { kind: "setup" }
  | { kind: "signed-out" }
  | { kind: "network" }
  | { kind: "denied" };

/**
 * Server-side snapshot for the lobby and race pages. get_lobby() applies the
 * permissions; a missing race and "not a member" are both "denied" on purpose.
 */
export async function loadRace(raceId: string): Promise<RaceLoad> {
  if (!isSupabaseConfigured()) return { kind: "setup" };
  if (!(await getViewer())) return { kind: "signed-out" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_lobby", { p_race_id: raceId });
  if (error) return isNetworkError(error) ? { kind: "network" } : { kind: "denied" };

  try {
    return { kind: "ok", lobby: parseLobby(data) };
  } catch {
    return { kind: "denied" };
  }
}
