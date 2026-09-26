import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabasePublicConfig, isSupabaseConfigured } from "@/lib/env";

function stubSupabaseEnv(url: string, publishableKey: string) {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publishableKey);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isSupabaseConfigured", () => {
  it("is false when variables are missing or blank", () => {
    stubSupabaseEnv("", "");
    expect(isSupabaseConfigured()).toBe(false);

    stubSupabaseEnv("https://example.supabase.co", "   ");
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("is true when both variables are set", () => {
    stubSupabaseEnv("https://example.supabase.co", "sb_publishable_test");
    expect(isSupabaseConfigured()).toBe(true);
  });
});

describe("getSupabasePublicConfig", () => {
  it("names every missing variable", () => {
    stubSupabaseEnv("", "");
    expect(() => getSupabasePublicConfig()).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it("rejects a malformed URL", () => {
    stubSupabaseEnv("not a url", "sb_publishable_test");
    expect(() => getSupabasePublicConfig()).toThrow(/valid URL/);
  });

  it("rejects non-http protocols", () => {
    stubSupabaseEnv("ftp://example.supabase.co", "sb_publishable_test");
    expect(() => getSupabasePublicConfig()).toThrow(/http or https/);
  });

  it("returns trimmed values when configured", () => {
    stubSupabaseEnv(" https://example.supabase.co ", " sb_publishable_test ");
    expect(getSupabasePublicConfig()).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_test",
    });
  });
});
