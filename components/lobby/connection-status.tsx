import { Spinner } from "@/components/ui/spinner";
import type { ConnectionState } from "./use-lobby";

/** Compact indicator for the lobby header. */
export function ConnectionPill({ state }: { state: ConnectionState }) {
  if (state === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-strong">
        <span className="size-2 rounded-full bg-teal" aria-hidden="true" />
        Онлайн
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-muted">
      <Spinner className="size-3.5" />
      {state === "connecting" ? "Подключение…" : "Нет связи"}
    </span>
  );
}

/** Prominent banner while the realtime connection is down. */
export function ConnectionBanner({ state }: { state: ConnectionState }) {
  if (state !== "reconnecting" && state !== "offline") return null;
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl bg-sun-soft px-4 py-3 text-sm font-semibold text-ink ring-1 ring-sun/40"
    >
      <Spinner className="mt-0.5 size-4 shrink-0" />
      <p>
        Соединение с гонкой потеряно.{" "}
        {state === "offline" ? "Проверьте интернет — мы переподключимся автоматически." : "Переподключаемся…"}
      </p>
    </div>
  );
}
