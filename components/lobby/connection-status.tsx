"use client";

import { useI18n } from "@/components/i18n/i18n-provider";
import { Spinner } from "@/components/ui/spinner";
import type { ConnectionState } from "./use-lobby";

/** Compact indicator for the lobby header. */
export function ConnectionPill({ state }: { state: ConnectionState }) {
  const { m } = useI18n();
  if (state === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-strong">
        <span className="size-2 rounded-full bg-teal" aria-hidden="true" />
        {m.connection.live}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-muted">
      <Spinner className="size-3.5" />
      {state === "connecting" ? m.connection.connecting : m.connection.offline}
    </span>
  );
}

/** Prominent banner while the realtime connection is down. */
export function ConnectionBanner({ state }: { state: ConnectionState }) {
  const { m } = useI18n();
  if (state !== "reconnecting" && state !== "offline") return null;
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl bg-sun-soft px-4 py-3 text-sm font-semibold text-ink ring-1 ring-sun/40"
    >
      <Spinner className="mt-0.5 size-4 shrink-0" />
      <p>
        {m.connection.lost} {state === "offline" ? m.connection.checkInternet : m.connection.reconnecting}
      </p>
    </div>
  );
}
