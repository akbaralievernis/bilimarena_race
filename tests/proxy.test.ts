import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { rememberLanguage } from "@/proxy";

describe("?lang= from the main site", () => {
  it("remembers ky or ru and redirects to the same address without it", () => {
    const response = rememberLanguage(new NextRequest("https://race.example/join?code=A7K9Q2&lang=ru"))!;
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://race.example/join?code=A7K9Q2");
    expect(response.cookies.get("race_lang")?.value).toBe("ru");
  });

  it("drops an unknown language without changing the choice", () => {
    const response = rememberLanguage(new NextRequest("https://race.example/create?lang=en"))!;
    expect(response.headers.get("location")).toBe("https://race.example/create");
    expect(response.cookies.get("race_lang")).toBeUndefined();
  });

  it("leaves other requests alone", () => {
    expect(rememberLanguage(new NextRequest("https://race.example/join?code=A7K9Q2"))).toBeNull();
  });
});

describe("content security policy", () => {
  it("runs scripts only with the request's nonce and talks only to Supabase", async () => {
    const { buildCsp } = await import("@/lib/security/csp");
    const csp = buildCsp({ nonce: "abc", supabaseUrl: "https://ref.supabase.co", dev: false });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("connect-src 'self' https://ref.supabase.co wss://ref.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("allows eval only in development", async () => {
    const { buildCsp } = await import("@/lib/security/csp");
    expect(buildCsp({ nonce: "n", supabaseUrl: "", dev: true })).toContain("'unsafe-eval'");
  });

  it("sets a fresh policy on every page response", async () => {
    const { proxy } = await import("@/proxy");
    const a = (await proxy(new NextRequest("https://race.example/join"))).headers.get("content-security-policy");
    const b = (await proxy(new NextRequest("https://race.example/join"))).headers.get("content-security-policy");
    expect(a).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(a).not.toBe(b);
  });
});
