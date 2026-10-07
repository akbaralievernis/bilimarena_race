import type { Metadata } from "next";
import { NetworkCheck } from "@/components/status/network-check";
import { getSupabasePublicConfig, isSupabaseConfigured } from "@/lib/env";
import { checkHealth, type HealthCheck } from "@/lib/health";

export const metadata: Metadata = {
  title: "Проверка перед уроком",
};

function CheckRow({ check }: { check: HealthCheck }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-sm font-bold ${
          check.ok ? "bg-teal-soft text-teal-strong" : "bg-danger-soft text-danger"
        }`}
        aria-hidden="true"
      >
        {check.ok ? "✓" : "!"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{check.label}</span>
        <span className="block text-sm break-words text-ink-muted">
          {check.detail}
          <span className="sr-only">{check.ok ? " — в порядке" : " — проблема"}</span>
        </span>
      </span>
    </li>
  );
}

/**
 * Before the lesson: the teacher opens /status on the board computer, and once
 * on a student's phone in the school Wi-Fi. Public: shows no data of any race.
 */
export default async function StatusPage() {
  const report = await checkHealth();
  const config = isSupabaseConfigured() ? getSupabasePublicConfig() : null;

  return (
    <main className="mx-auto grid w-full max-w-3xl flex-1 grid-cols-1 gap-6 px-4 pt-2 pb-16 sm:px-6 lg:pt-6">
      <section aria-labelledby="server-heading" className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line sm:p-8">
        <p className="text-sm font-bold text-teal-strong">Проверка перед уроком</p>
        <h1 id="server-heading" className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {report.ok ? "Всё готово к гонке" : "Есть проблемы"}
        </h1>
        <p className="mt-2 text-ink-muted">
          Сервер и база данных. Проверено{" "}
          <time dateTime={report.checkedAt}>
            {new Date(report.checkedAt).toLocaleTimeString("ru-RU", { timeZone: "Asia/Bishkek" })}
          </time>{" "}
          (Бишкек) — обновите страницу, чтобы проверить снова.
        </p>
        <ul className="mt-4 divide-y divide-line">
          {report.checks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </ul>
      </section>

      {config && (
        <section aria-labelledby="network-heading" className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line sm:p-8">
          <h2 id="network-heading" className="font-display text-xl font-bold tracking-tight">
            Сеть этого устройства
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Откройте эту страницу на телефоне ученика в школьном Wi-Fi: если WebSocket заблокирован, гонка всё равно
            работает, но карта обновляется не мгновенно, а раз в 10 секунд.
          </p>
          <div className="mt-2">
            <NetworkCheck url={config.url} publishableKey={config.publishableKey} />
          </div>
        </section>
      )}
    </main>
  );
}
