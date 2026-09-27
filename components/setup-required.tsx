import { NoticeCard } from "@/components/notice-card";

/** Shown when the deployment has no Supabase variables yet. */
export function SetupRequired() {
  return (
    <NoticeCard
      badge="Настройка"
      title="Supabase не подключён"
      description="Добавьте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY в .env.local, примените миграции и перезапустите сервер. Инструкция — в README."
      icon={
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-8">
          <path
            d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1M12 9a3 3 0 100 6 3 3 0 000-6z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      }
    />
  );
}
