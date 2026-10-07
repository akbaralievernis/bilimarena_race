import "server-only";

import { getViewer } from "@/lib/auth/viewer";
import { isSupabaseConfigured } from "@/lib/env";
import { isDatabaseNotReady, isNetworkError } from "@/lib/race/errors";
import { parseReport, type RaceReport } from "@/lib/race/report";
import { createClient } from "@/lib/supabase/server";

export type ReportLoad =
  | { kind: "ok"; report: RaceReport }
  | { kind: "setup" }
  | { kind: "signed-out" }
  | { kind: "network" }
  | { kind: "not-ready" }
  | { kind: "denied" };

/**
 * Server-side report for the results page. get_race_report() is owner only:
 * a missing race, someone else's race and a student all get "denied".
 */
export async function loadReport(raceId: string): Promise<ReportLoad> {
  if (!isSupabaseConfigured()) return { kind: "setup" };
  if (!(await getViewer())) return { kind: "signed-out" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_race_report", { p_race_id: raceId });
  if (error) {
    if (isNetworkError(error)) return { kind: "network" };
    // Stage 5 migration not applied yet: say so instead of "no access".
    if (isDatabaseNotReady(error)) return { kind: "not-ready" };
    return { kind: "denied" };
  }

  try {
    return { kind: "ok", report: parseReport(data) };
  } catch {
    return { kind: "denied" };
  }
}
