"use client";

import { useSyncExternalStore } from "react";

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

export function formatClock(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone });
}

export function formatDate(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

/** A time or a date in the viewer's own time zone. */
export function LocalTime({ iso, date = false }: { iso: string; date?: boolean }) {
  const timeZone = useIsClient() ? undefined : SERVER_TIME_ZONE;
  return <time dateTime={iso}>{date ? formatDate(iso, timeZone) : formatClock(iso, timeZone)}</time>;
}
