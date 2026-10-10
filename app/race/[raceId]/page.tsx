import { notFound, redirect } from "next/navigation";
import { RaceScreen } from "@/components/race/race-screen";
import { RaceUnavailable } from "@/components/race/race-unavailable";
import { SetupRequired } from "@/components/setup-required";
import { pageMetadata } from "@/lib/i18n/server";
import { loadRace } from "@/lib/race/load-race";
import { isUuid } from "@/lib/race/validation";

export const generateMetadata = pageMetadata("race");

export default async function RacePage({ params }: PageProps<"/race/[raceId]">) {
  const { raceId } = await params;
  if (!isUuid(raceId)) notFound();

  const result = await loadRace(raceId);
  if (result.kind === "setup") return <SetupRequired />;
  if (result.kind === "signed-out") redirect("/join");
  if (result.kind !== "ok") return <RaceUnavailable kind={result.kind} />;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-2 pb-16 sm:px-6 lg:px-8 lg:pt-4">
      <RaceScreen key={raceId} initial={result.lobby} />
    </main>
  );
}
