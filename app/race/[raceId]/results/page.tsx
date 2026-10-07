import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { NoticeCard } from "@/components/notice-card";
import { RaceReportView } from "@/components/report/race-report";
import { RaceUnavailable } from "@/components/race/race-unavailable";
import { SetupRequired } from "@/components/setup-required";
import { DATABASE_NOT_READY_MESSAGE } from "@/lib/race/errors";
import { loadReport } from "@/lib/race/load-report";
import { isUuid } from "@/lib/race/validation";

export const metadata: Metadata = {
  title: "Отчёт по гонке",
};

const chartIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-8">
    <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export default async function RaceResultsPage({ params }: PageProps<"/race/[raceId]/results">) {
  const { raceId } = await params;
  if (!isUuid(raceId)) notFound();

  const result = await loadReport(raceId);
  if (result.kind === "setup") return <SetupRequired />;
  if (result.kind === "signed-out") redirect(`/login?next=/race/${raceId}/results`);
  if (result.kind === "not-ready") {
    return <NoticeCard badge="Нужна миграция" title="Отчёт пока недоступен" description={DATABASE_NOT_READY_MESSAGE} icon={chartIcon} />;
  }
  if (result.kind === "denied") {
    return (
      <NoticeCard
        badge="Нет доступа"
        title="Отчёт недоступен"
        description="Отчёт видит только учитель, который создал гонку. Проверьте, что вы вошли в свой аккаунт."
        icon={chartIcon}
      />
    );
  }
  if (result.kind !== "ok") return <RaceUnavailable kind={result.kind} />;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-2 pb-16 sm:px-6 lg:px-8 lg:pt-4">
      <RaceReportView report={result.report} />
    </main>
  );
}
