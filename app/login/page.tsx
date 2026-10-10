import { redirect } from "next/navigation";
import { SetupRequired } from "@/components/setup-required";
import { getViewer, isTeacher } from "@/lib/auth/viewer";
import { isSupabaseConfigured } from "@/lib/env";
import { getI18n, pageMetadata } from "@/lib/i18n/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { LoginForm } from "./login-form";

export const generateMetadata = pageMetadata("login");

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  if (!isSupabaseConfigured()) return <SetupRequired />;
  if (isTeacher(await getViewer())) redirect(next);

  const { m } = await getI18n();
  const initialError = params.error === "confirm" ? m.login.confirmFailed : undefined;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-start px-4 pt-4 pb-16 sm:items-center sm:pt-10">
      <div className="w-full rounded-card bg-surface p-6 shadow-card ring-1 ring-line sm:p-10">
        <p className="text-sm font-bold text-teal-strong">{m.login.eyebrow}</p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">{m.login.title}</h1>
        <p className="mt-3 text-ink-muted">{m.login.lead}</p>
        <div className="mt-8">
          <LoginForm next={next} initialError={initialError} />
        </div>
      </div>
    </main>
  );
}
