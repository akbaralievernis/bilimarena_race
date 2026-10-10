import { SetupRequired } from "@/components/setup-required";
import { isSupabaseConfigured } from "@/lib/env";
import { getI18n, pageMetadata } from "@/lib/i18n/server";
import { JoinForm } from "./join-form";

export const generateMetadata = pageMetadata("join");

export default async function JoinRacePage({ searchParams }: PageProps<"/join">) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { code } = await searchParams;
  const { m } = await getI18n();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-start px-4 pt-4 pb-16 sm:items-center sm:pt-10">
      <div className="w-full rounded-card bg-surface p-6 shadow-card ring-1 ring-line sm:p-10">
        <p className="text-sm font-bold text-teal-strong">{m.join.eyebrow}</p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">{m.join.title}</h1>
        <p className="mt-3 text-ink-muted">{m.join.lead}</p>
        <div className="mt-8">
          <JoinForm initialCode={typeof code === "string" ? code : ""} />
        </div>
      </div>
    </main>
  );
}
