import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Only routes that use the auth session. The landing page stays static.
export const config = {
  matcher: ["/login", "/create", "/join", "/race/:path*", "/auth/:path*"],
};
