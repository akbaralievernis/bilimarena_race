import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LobbyScreen } from "@/components/lobby/lobby-screen";
import { NoticeCard } from "@/components/notice-card";
import { SetupRequired } from "@/components/setup-required";
import { ButtonLink } from "@/components/ui/button-link";
import { getViewer } from "@/lib/auth/viewer";
import { isSupabaseConfigured } from "@/lib/env";
import { isNetworkError } from "@/lib/race/errors";
import { parseLobby, type LobbySnapshot } from "@/lib/race/lobby";
import { isUuid } from "@/lib/race/validation";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Лобби гонки",
};

const lockIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-8">
    <path
      d="M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default async function LobbyPage({ params }: PageProps<"/race/[raceId]/lobby">) {
  const { raceId } = await params;
  if (!isUuid(raceId)) notFound();
  if (!isSupabaseConfigured()) return <SetupRequired />;
  if (!(await getViewer())) redirect("/join");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_lobby", { p_race_id: raceId });

  if (error && isNetworkError(error)) {
    return (
      <NoticeCard
        badge="Нет связи"
        title="Не удалось загрузить лобби"
        description="Сервер гонки сейчас недоступен. Проверьте интернет и обновите страницу."
        icon={lockIcon}
      />
    );
  }

  let lobby: LobbySnapshot | null = null;
  if (!error) {
    try {
      lobby = parseLobby(data);
    } catch {
      lobby = null;
    }
  }

  if (!lobby) {
    // Missing race and "not a member" look the same on purpose.
    return (
      <NoticeCard
        badge="Нет доступа"
        title="Гонка недоступна"
        description="Гонка не найдена или вы в ней не участвуете. Подключитесь по коду комнаты."
        icon={lockIcon}
      >
        <ButtonLink href="/join" className="mt-8 w-full sm:w-auto">
          Подключиться по коду
        </ButtonLink>
      </NoticeCard>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-2 pb-16 sm:px-6 lg:px-8 lg:pt-4">
      <LobbyScreen key={raceId} initial={lobby} />
    </main>
  );
}
