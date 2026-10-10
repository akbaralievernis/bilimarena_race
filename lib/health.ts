import "server-only";

import { getSupabasePublicConfig, isSupabaseConfigured } from "@/lib/env";

/*
 * Stage 6: "is everything ready for the lesson?" — checked from the server with
 * the public key only, no user and no secret key:
 *
 *  - Supabase answers, and how fast;
 *  - anonymous sign-ins (students) are enabled;
 *  - the migrations of every stage are applied. Without a session PostgREST
 *    answers 42501 "permission denied" for a function or column that exists
 *    and PGRST202 / 42703 for one that does not — nothing is executed.
 */

export type HealthCheck = { id: string; label: string; ok: boolean; detail: string };
export type HealthReport = { ok: boolean; checkedAt: string; latencyMs: number | null; checks: HealthCheck[] };

/** One marker per stage: something that first appeared in that stage's migrations. */
export const SCHEMA_MARKERS = [
  { stage: 1, kind: "rpc", name: "join_race", args: { p_code: "", p_display_name: "" } },
  { stage: 2, kind: "rpc", name: "advance_team", args: { p_team_id: null, p_to_position: 0 } },
  { stage: 3, kind: "rpc", name: "submit_answer", args: { p_team_id: null, p_task_id: null, p_answer: "" } },
  { stage: 4, kind: "column", name: "task_submissions.points" },
  { stage: 5, kind: "rpc", name: "get_race_report", args: { p_race_id: null } },
  { stage: 7, kind: "rpc", name: "set_race_time_limit", args: { p_race_id: null, p_seconds: null } },
] as const;

const TIMEOUT_MS = 6_000;

type Probe = { status: number; code: string | null } | { status: 0; code: "network" };

async function probe(url: string, key: string, init: RequestInit = {}): Promise<Probe> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { apikey: key, "Content-Type": "application/json", ...init.headers },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
    return { status: response.status, code: typeof body?.code === "string" ? body.code : null };
  } catch {
    return { status: 0, code: "network" };
  }
}

/** "exists" when the database refused for lack of rights, "missing" when it does not know the name. */
export function markerState(result: Probe): "exists" | "missing" | "unknown" {
  if (result.code === "42501" || (result.status >= 200 && result.status < 300)) return "exists";
  if (result.code === "PGRST202" || result.code === "42703" || result.code === "PGRST205" || result.code === "42P01") {
    return "missing";
  }
  return "unknown";
}

export async function checkHealth(): Promise<HealthReport> {
  const checkedAt = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      checkedAt,
      latencyMs: null,
      checks: [
        {
          id: "env",
          label: "Настройки Supabase",
          ok: false,
          detail: "Не заданы NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
        },
      ],
    };
  }

  const { url, publishableKey: key } = getSupabasePublicConfig();
  const checks: HealthCheck[] = [{ id: "env", label: "Настройки Supabase", ok: true, detail: new URL(url).host }];

  // Auth settings: reachability, latency and whether students can sign in.
  const started = performance.now();
  let settings: { external?: { anonymous_users?: boolean }; disable_signup?: boolean } | null = null;
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) settings = await response.json();
  } catch {
    settings = null;
  }
  const latencyMs = settings ? Math.round(performance.now() - started) : null;

  checks.push({
    id: "server",
    label: "Сервер Supabase отвечает",
    ok: settings !== null,
    detail: settings
      ? `${latencyMs} мс`
      : "Нет ответа. Проект на бесплатном тарифе мог уснуть — откройте его в Supabase Dashboard и нажмите Restore.",
  });
  if (!settings) return { ok: false, checkedAt, latencyMs, checks };

  checks.push({
    id: "anonymous",
    label: "Вход учеников без регистрации",
    ok: settings.external?.anonymous_users === true,
    detail:
      settings.external?.anonymous_users === true
        ? "Anonymous Sign-Ins включены"
        : "Включите Authentication → Sign In / Providers → Anonymous Sign-Ins.",
  });
  checks.push({
    id: "signup",
    label: "Регистрация учителей",
    ok: true,
    detail: settings.disable_signup ? "закрыта (новые учителя не смогут зарегистрироваться)" : "открыта",
  });

  const states = await Promise.all(
    SCHEMA_MARKERS.map((marker) => {
      if (marker.kind === "column") {
        const [table, column] = marker.name.split(".");
        return probe(`${url}/rest/v1/${table}?select=${column}&limit=0`, key).then(markerState);
      }
      return probe(`${url}/rest/v1/rpc/${marker.name}`, key, {
        method: "POST",
        body: JSON.stringify(marker.args),
      }).then(markerState);
    }),
  );
  const missing = SCHEMA_MARKERS.filter((_, index) => states[index] === "missing").map((marker) => marker.stage);
  const unknown = states.includes("unknown");
  checks.push({
    id: "schema",
    label: "Миграции базы (этапы 1–7)",
    ok: missing.length === 0 && !unknown,
    detail:
      missing.length > 0
        ? `Не применены этапы: ${missing.join(", ")}. Примените миграции из supabase/migrations.`
        : unknown
          ? "Не удалось проверить — обновите страницу."
          : "все применены",
  });

  return { ok: checks.every((check) => check.ok), checkedAt, latencyMs, checks };
}
