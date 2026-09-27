import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "@/lib/env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Acts on behalf of the signed-in user, so RLS still applies.
 *
 * Create a new client per request — never share one between requests.
 */
export async function createClient() {
  const { url, publishableKey } = getSupabasePublicConfig();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can't write cookies. Safe to ignore: proxy.ts
          // refreshes the auth session before pages render.
        }
      },
    },
  });
}
