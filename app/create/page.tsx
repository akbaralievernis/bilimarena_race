import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SetupRequired } from "@/components/setup-required";
import { StatusBadge } from "@/components/lobby/status-badge";
import { getViewer, isTeacher } from "@/lib/auth/viewer";
import { isSupabaseConfigured } from "@/lib/env";
import { isRaceStatus, type RaceStatus } from "@/lib/race/status";
import { formatRoomCode } from "@/lib/race/validation";
import { createClient } from "@/lib/supabase/server";
import { CreateRaceForm } from "./create-race-form";

export const metadata: Metadata = {
  title: "Создать гонку",
};

type MyRace = { id: string; code: string; title: string; status: RaceStatus };

function parseMyRaces(data: unknown): MyRace[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    const race = item as Record<string, unknown>;
    return typeof race.id === "string" &&
      typeof race.code === "string" &&
      typeof race.title === "string" &&
      isRaceStatus(race.status)
      ? [{ id: race.id, code: race.code, title: race.title, status: race.status }]
      : [];
  });
}

export default async function CreateRacePage() {
  if (!isSupabaseConfigured()) return <SetupRequired />;
  if (!isTeacher(await getViewer())) redirect("/login?next=/create");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_races");
  const races = error ? [] : parseMyRaces(data);

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-start gap-6 px-4 pt-2 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:px-8 lg:pt-6">
      <section className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line sm:p-10">
        <p className="text-sm font-bold text-teal-strong">Новая гонка</p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">Создать гонку</h1>
        <p className="mt-3 max-w-lg text-ink-muted">
          После создания откроется лобби с кодом комнаты. Студенты подключатся по нему, а вы распределите их по
          командам.
        </p>
        <div className="mt-8">
          <CreateRaceForm />
        </div>
      </section>

      <aside aria-labelledby="my-races" className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line sm:p-8">
        <h2 id="my-races" className="font-display text-lg font-bold tracking-tight">
          Мои гонки
        </h2>
        {error ? (
          <p className="mt-3 text-sm text-ink-muted">Не удалось загрузить список. Обновите страницу.</p>
        ) : races.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Здесь появятся созданные гонки — чтобы вернуться в лобби.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {races.map((race) => (
              <li key={race.id}>
                <Link
                  href={`/race/${race.id}/lobby`}
                  className="flex items-center gap-3 rounded-2xl px-3 py-3 ring-1 ring-line transition hover:bg-canvas hover:ring-brand/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{race.title}</span>
                    <span className="mt-0.5 block font-mono text-sm tracking-wider text-ink-muted">
                      {formatRoomCode(race.code)}
                    </span>
                  </span>
                  <StatusBadge status={race.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </main>
  );
}
