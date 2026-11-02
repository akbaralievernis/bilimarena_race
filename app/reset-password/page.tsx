import Link from "next/link";
import { SetupRequired } from "@/components/setup-required";
import { getViewer, isTeacher } from "@/lib/auth/viewer";
import { isSupabaseConfigured } from "@/lib/env";
import { getI18n, pageMetadata } from "@/lib/i18n/server";
import { ResetPasswordForm } from "./reset-password-form";

export const generateMetadata = pageMetadata("resetPassword");

/** Opened from the "forgot password" e-mail: /auth/confirm has already signed the teacher in. */
export default async function ResetPasswordPage() {
  if (!isSupabaseConfigured()) return <SetupRequired />;
  const { m } = await getI18n();
  const signedIn = isTeacher(await getViewer());

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-start px-4 pt-4 pb-16 sm:items-center sm:pt-10">
      <div className="w-full rounded-card bg-surface p-6 shadow-card ring-1 ring-line sm:p-10">
        <p className="text-sm font-bold text-teal-strong">{m.login.eyebrow}</p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">{m.resetPassword.title}</h1>
        {signedIn ? (
          <>
            <p className="mt-3 text-ink-muted">{m.resetPassword.lead}</p>
            <div className="mt-8">
              <ResetPasswordForm />
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-ink-muted">{m.resetPassword.expired}</p>
            <Link href="/login" className="mt-6 inline-block font-bold text-teal-strong underline">
              {m.resetPassword.backToLogin}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
