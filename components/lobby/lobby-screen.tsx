"use client";

import { ButtonLink } from "@/components/ui/button-link";
import type { LobbySnapshot } from "@/lib/race/lobby";
import { LobbyNotices } from "./lobby-notices";
import { StudentLobby } from "./student-lobby";
import { TeacherLobby } from "./teacher-lobby";
import { useLobby } from "./use-lobby";

export function LobbyScreen({ initial }: { initial: LobbySnapshot }) {
  const { lobby, connection, accessLost, notices, dismissNotice, refresh } = useLobby(initial);

  if (accessLost) {
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

  return (
    <>
      {lobby.viewer.role === "teacher" ? (
        <TeacherLobby lobby={lobby} connection={connection} refresh={refresh} />
      ) : (
        <StudentLobby lobby={lobby} connection={connection} />
      )}
      <LobbyNotices notices={notices} onDismiss={dismissNotice} />
    </>
  );
}
