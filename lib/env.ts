export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

/**
 * Public Supabase settings, safe to ship to the browser: data access is
 * enforced by Row Level Security, not by hiding the publishable key.
 *
 * NEXT_PUBLIC_* variables must be read as literal `process.env.NAME`
 * expressions so Next.js can inline them into the client bundle.
 */
function readSupabasePublicEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "",
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "",
  };
}

/** True when both public Supabase variables are set. Never throws. */
export function isSupabaseConfigured(): boolean {
  const { url, publishableKey } = readSupabasePublicEnv();
  return url !== "" && publishableKey !== "";
}

/**
 * Returns validated public Supabase settings or throws a descriptive error.
 * Called lazily by the Supabase clients, so pages that don't touch the
 * database keep working (and building) without any env configured.
 */
export function getSupabasePublicConfig(): SupabasePublicConfig {
  const { url, publishableKey } = readSupabasePublicEnv();

  const missing = [
    url === "" && "NEXT_PUBLIC_SUPABASE_URL",
    publishableKey === "" && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Supabase is not configured: missing ${missing.join(", ")}. ` +
        "Copy .env.example to .env.local and fill in the values.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use http or https.");
  }

  return { url, publishableKey };
}
