"use client";

import { useLobby } from "@/components/lobby/use-lobby";
import type { LobbySnapshot } from "@/lib/race/lobby";
import { AccessLost } from "./access-lost";
import { StudentRace } from "./student-race";
import { TeacherRace } from "./teacher-race";

/**
 * The race map screen. Same live snapshot as the lobby (useLobby): a team move
 * updates public.teams → "lobby_changed" on race:<id> → everyone re-reads.
 */
export function RaceScreen({ initial }: { initial: LobbySnapshot }) {
  const { lobby, connection, accessLost, refresh } = useLobby(initial);

  if (accessLost) return <AccessLost />;

  return lobby.viewer.role === "teacher" ? (
    <TeacherRace lobby={lobby} connection={connection} refresh={refresh} />
  ) : (
    <StudentRace lobby={lobby} connection={connection} refresh={refresh} />
  );
}
