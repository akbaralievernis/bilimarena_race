import { ButtonLink } from "@/components/ui/button-link";

/** Shown when a live refresh reports the race is gone or no longer accessible. */
export function AccessLost() {
  return (
    <div className="mx-auto max-w-xl rounded-card bg-surface p-8 text-center shadow-card ring-1 ring-line">
      <h1 className="font-display text-2xl font-bold">Гонка недоступна</h1>
      <p className="mt-3 text-ink-muted">Гонка не найдена или у вас больше нет к ней доступа.</p>
      <ButtonLink href="/join" variant="secondary" className="mt-6">
        Подключиться по коду
      </ButtonLink>
    </div>
  );
}
