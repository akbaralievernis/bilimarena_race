import { checkHealth } from "@/lib/health";
import { getI18n } from "@/lib/i18n/server";

/**
 * Machine-readable readiness: 200 when everything is ready, 503 otherwise.
 * Also pinged once a day by the Vercel cron (vercel.json), which keeps a
 * free-tier Supabase project from pausing after a week without requests.
 */
export async function GET() {
  const report = await checkHealth((await getI18n()).m);
  return Response.json(report, {
    status: report.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
