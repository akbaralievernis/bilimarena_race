import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/env";

/**
 * Supabase client for Client Components: auth session, Realtime
 * subscriptions and reads permitted by RLS.
 *
 * Never use it to decide game outcomes (score, position, winner) —
 * those are written only by trusted server code. See docs/ARCHITECTURE.md.
 */
export function createClient() {
  const { url, publishableKey } = getSupabasePublicConfig();
  return createBrowserClient(url, publishableKey);
}
