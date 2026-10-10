import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { NoticeCard } from "@/components/notice-card";
import { ProjectorScreen } from "@/components/projector/projector-screen";
import { RaceUnavailable } from "@/components/race/race-unavailable";
import { SetupRequired } from "@/components/setup-required";
import { loadRace } from "@/lib/race/load-race";
import { isUuid } from "@/lib/race/validation";

export const metadata: Metadata = {
  title: "Экран для проектора",
};

const screenIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-8">
    <path
      d="M3 5h18v11H3zM8 20h8M12 16v4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Stage 7: the board view of a race — code and QR before the start, map, places and timer during it. */
export default async function ProjectorPage({ params }: PageProps<"/race/[raceId]/screen">) {
  const { raceId } = await params;
  if (!isUuid(raceId)) notFound();

  const result = await loadRace(raceId);
  if (result.kind === "setup") return <SetupRequired />;
  if (result.kind === "signed-out") redirect(`/login?next=/race/${raceId}/screen`);
  if (result.kind !== "ok") return <RaceUnavailable kind={result.kind} />;
  if (result.lobby.viewer.role !== "teacher") {
    return (
      <NoticeCard
        badge="Для учителя"
        title="Экран проектора — у учителя"
        description="Этот экран открывает учитель на компьютере у доски. Ваша гонка — на странице карты."
        icon={screenIcon}
      />
    );
  }

  return <ProjectorScreen key={raceId} initial={result.lobby} />;
}
