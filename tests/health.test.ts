import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { checkHealth, markerState, SCHEMA_MARKERS } = await import("@/lib/health");

describe("markerState", () => {
  it("reads PostgREST answers without a session", () => {
    expect(markerState({ status: 401, code: "42501" })).toBe("exists");
    expect(markerState({ status: 200, code: null })).toBe("exists");
    expect(markerState({ status: 404, code: "PGRST202" })).toBe("missing");
    expect(markerState({ status: 400, code: "42703" })).toBe("missing");
    expect(markerState({ status: 0, code: "network" })).toBe("unknown");
    expect(markerState({ status: 500, code: "XX000" })).toBe("unknown");
  });
});

describe("checkHealth", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  const answer = (missing: string[] = [], anonymous = true) =>
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/settings")) return json({ external: { anonymous_users: anonymous }, disable_signup: false });
      const name = url.includes("/rpc/") ? url.split("/rpc/")[1] : "task_submissions.points";
      return missing.includes(name) ? json({ code: "PGRST202" }, 404) : json({ code: "42501" }, 401);
    });

  it("is ready when the server answers, students can sign in and every stage is applied", async () => {
    answer();
    const report = await checkHealth();
    expect(report.ok).toBe(true);
    expect(report.checks.map((check) => [check.id, check.ok])).toEqual([
      ["env", true],
      ["server", true],
      ["anonymous", true],
      ["signup", true],
      ["schema", true],
    ]);
    // Only the public key travels; no secret key, no user token.
    for (const [, init] of fetchMock.mock.calls) {
      expect(Object.keys((init?.headers ?? {}) as object)).not.toContain("Authorization");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1 + SCHEMA_MARKERS.length);
  });

  it("names the stages whose migrations are missing", async () => {
    answer(["get_race_report", "task_submissions.points"]);
    const schema = (await checkHealth()).checks.find((check) => check.id === "schema")!;
    expect(schema).toMatchObject({ ok: false });
    expect(schema.detail).toContain("4, 5");
  });

  it("explains a disabled anonymous sign-in and a sleeping project", async () => {
    answer([], false);
    expect((await checkHealth()).checks.find((check) => check.id === "anonymous")).toMatchObject({ ok: false });

    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const report = await checkHealth();
    expect(report).toMatchObject({ ok: false, latencyMs: null });
    expect(report.checks.at(-1)).toMatchObject({ id: "server", ok: false });
  });

  it("without settings says what to configure", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const report = await checkHealth();
    expect(report.checks).toEqual([expect.objectContaining({ id: "env", ok: false })]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
