import { NoticeCard } from "@/components/notice-card";
import { ButtonLink } from "@/components/ui/button-link";
import { getI18n } from "@/lib/i18n/server";

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

/** Shared "cannot open this race" screen for the lobby and race pages. */
export async function RaceUnavailable({ kind }: { kind: "network" | "denied" }) {
  const { m } = await getI18n();
  if (kind === "network") {
    return (
      <NoticeCard
        badge={m.notices.offlineBadge}
        title={m.notices.offlineTitle}
        description={m.notices.offlineText}
        icon={lockIcon}
      />
    );
  }
  return (
    <NoticeCard
      badge={m.notices.deniedBadge}
      title={m.notices.deniedTitle}
      description={m.notices.deniedText}
      icon={lockIcon}
    >
      <ButtonLink href="/join" className="mt-8 w-full sm:w-auto">
        {m.notices.joinByCode}
      </ButtonLink>
    </NoticeCard>
  );
}
