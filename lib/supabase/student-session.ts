import type { Messages } from "@/lib/i18n/config";
import { authErrorMessage } from "@/lib/race/errors";
import { createClient } from "@/lib/supabase/client";

/**
 * Students sign in anonymously FROM THE BROWSER, not in a Server Action.
 * Supabase limits anonymous sign-ins per IP address: from the browser that is
 * the school's address, while on Vercel a server-side sign-in would come from
 * Vercel's shared addresses and every school in the country would share one
 * limit. The session lands in cookies, so the Server Action that follows sees it.
 *
 * Returns an error text, or null when the browser now has a session.
 */
export async function ensureStudentSession(m: Messages): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  if (data.session) return null;
  const { error } = await supabase.auth.signInAnonymously();
  return error ? authErrorMessage(error, m) : null;
}
