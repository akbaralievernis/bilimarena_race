import { beforeEach, describe, expect, it, vi } from "vitest";
import { ru } from "@/lib/i18n/messages/ru";

/* "Forgot password": the e-mail request and the new password, with Supabase stubbed. */

const auth = {
  resetPasswordForEmail: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
};
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "https://race.example" }) }));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/i18n/server", () => ({ getI18n: async () => ({ m: ru }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));

const { requestPasswordResetAction } = await import("@/app/login/actions");
const { updatePasswordAction } = await import("@/app/reset-password/actions");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockReset();
});

describe("requestPasswordResetAction", () => {
  it("sends a link that signs the teacher in and opens /reset-password", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    const result = await requestPasswordResetAction(form({ email: " Teacher@School.KG " }));
    expect(result).toEqual({ ok: true, message: ru.login.reset.sent("teacher@school.kg") });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("teacher@school.kg", {
      redirectTo: "https://race.example/auth/confirm?next=%2Freset-password",
    });
  });

  it("does not tell whether the address has an account", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { code: "user_not_found", message: "User not found" } });
    const result = await requestPasswordResetAction(form({ email: "nobody@school.kg" }));
    expect(result.ok).toBe(true);
  });

  it("reports errors the teacher can act on and checks the address", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { code: "over_email_send_rate_limit", message: "limit" } });
    expect(await requestPasswordResetAction(form({ email: "t@school.kg" }))).toEqual({
      ok: false,
      message: ru.errors.auth.over_email_send_rate_limit,
    });
    expect(await requestPasswordResetAction(form({ email: "not-an-email" }))).toEqual({
      ok: false,
      fieldErrors: { email: ru.login.errors.emailInvalid },
    });
  });
});

describe("updatePasswordAction", () => {
  it("saves the new password of the signed-in teacher", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "t1", is_anonymous: false } } });
    auth.updateUser.mockResolvedValue({ error: null });
    expect(await updatePasswordAction(form({ password: "new-password-1" }))).toEqual({ ok: true, redirectTo: "/" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password-1" });
  });

  it("refuses a short password, a missing session and an anonymous student", async () => {
    expect((await updatePasswordAction(form({ password: "short" }))).ok).toBe(false);
    auth.getUser.mockResolvedValue({ data: { user: null } });
    expect(await updatePasswordAction(form({ password: "new-password-1" }))).toEqual({ ok: false, message: ru.resetPassword.expired });
    auth.getUser.mockResolvedValue({ data: { user: { id: "s1", is_anonymous: true } } });
    expect(await updatePasswordAction(form({ password: "new-password-1" }))).toEqual({ ok: false, message: ru.resetPassword.expired });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});
