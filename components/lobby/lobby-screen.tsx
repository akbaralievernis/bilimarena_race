"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { AccessLost } from "@/components/race/access-lost";
import type { LobbySnapshot } from "@/lib/race/lobby";
import { LobbyNotices } from "./lobby-notices";
import { StudentLobby } from "./student-lobby";
import { TeacherLobby } from "./teacher-lobby";
import { useLobby } from "./use-lobby";

export function LobbyScreen({ initial }: { initial: LobbySnapshot }) {
  const { lobby, connection, accessLost, notices, dismissNotice, refresh } = useLobby(initial);
  const router = useRouter();
  const previousStatus = useRef(initial.race.status);

  // Everyone in the lobby moves to the race map the moment the race starts.
  useEffect(() => {
    if (previousStatus.current === "lobby" && lobby.race.status === "running") {
      router.push(`/race/${lobby.race.id}`);
    }
    previousStatus.current = lobby.race.status;
  }, [lobby.race.status, lobby.race.id, router]);

  if (accessLost) return <AccessLost />;

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
