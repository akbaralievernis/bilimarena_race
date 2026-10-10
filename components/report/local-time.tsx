"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import { clockTime, dayAndTime } from "@/lib/i18n/format";

// The server does not know the teacher's time zone: it renders school time
// (Bishkek), the browser re-renders in its own zone right after hydration.
const SERVER_TIME_ZONE = "Asia/Bishkek";
const subscribe = () => () => {};

function useIsClient() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/** A time or a date in the viewer's own time zone. */
export function LocalTime({ iso, date = false }: { iso: string; date?: boolean }) {
  const { m } = useI18n();
  const timeZone = useIsClient() ? undefined : SERVER_TIME_ZONE;
  return <time dateTime={iso}>{date ? dayAndTime(iso, m, timeZone) : clockTime(iso, timeZone)}</time>;
}
