import { NoticeCard } from "@/components/notice-card";
import { getI18n } from "@/lib/i18n/server";

/** Shown when the deployment has no Supabase variables yet. */
export async function SetupRequired() {
  const { m } = await getI18n();
  return (
    <NoticeCard
      badge={m.notices.setupBadge}
      title={m.notices.setupTitle}
      description={m.notices.setupText}
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
