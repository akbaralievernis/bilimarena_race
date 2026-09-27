import { NoticeCard } from "@/components/notice-card";
import { ButtonLink } from "@/components/ui/button-link";

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
export function RaceUnavailable({ kind }: { kind: "network" | "denied" }) {
  if (kind === "network") {
    return (
      <NoticeCard
        badge="Нет связи"
        title="Не удалось загрузить гонку"
        description="Сервер гонки сейчас недоступен. Проверьте интернет и обновите страницу."
        icon={lockIcon}
      />
    );
  }
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
