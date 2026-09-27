import "server-only";

import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type Viewer = {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  displayName: string | null;
};

/**
 * The signed-in user for this request, or null. Uses getClaims(), which
 * verifies the JWT — never trust getSession() on the server for access checks.
 * Authorization itself is enforced again by the database functions.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  const { claims } = data;
  const displayName = claims.user_metadata?.display_name;
  return {
    id: claims.sub,
    email: claims.email ?? null,
    isAnonymous: claims.is_anonymous === true,
    displayName: typeof displayName === "string" ? displayName : null,
  };
});

/** Teachers are users with a real (non-anonymous) account. */
export function isTeacher(viewer: Viewer | null): viewer is Viewer {
  return viewer !== null && !viewer.isAnonymous;
}
