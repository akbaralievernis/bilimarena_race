"use client";

import { useEffect } from "react";
import type { LobbyNotice } from "./use-lobby";

function Notice({ notice, onDismiss }: { notice: LobbyNotice; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(notice.id), 4500);
    return () => clearTimeout(timer);
  }, [notice.id, onDismiss]);

  return (
    <li className="animate-pop-in flex items-center gap-2.5 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-lift">
      <span className="size-2 shrink-0 rounded-full bg-teal" aria-hidden="true" />
      {notice.text}
    </li>
  );
}

/** Toasts for the teacher, e.g. "Новый участник: Эрнис". Announced politely. */
export function LobbyNotices({ notices, onDismiss }: { notices: LobbyNotice[]; onDismiss: (id: string) => void }) {
  return (
    <ul
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-20 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
    >
      {notices.map((notice) => (
        <Notice key={notice.id} notice={notice} onDismiss={onDismiss} />
      ))}
    </ul>
  );
}
