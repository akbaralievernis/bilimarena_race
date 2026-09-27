import { isRaceStatus, type RaceStatus } from "@/lib/race/status";

/** Shape returned by public.get_lobby(). Contains no internal auth ids. */
export type LobbyRace = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: RaceStatus;
  startedAt: string | null;
  finishedAt: string | null;
};

export type LobbyViewer = {
  role: "teacher" | "student";
  participantId: string | null;
  displayName: string | null;
  teamId: string | null;
};

export type LobbyTeam = { id: string; name: string; memberCount: number };

export type LobbyParticipant = { id: string; displayName: string; teamId: string | null };

export type LobbySnapshot = {
  race: LobbyRace;
  viewer: LobbyViewer;
  teams: LobbyTeam[];
  participants: LobbyParticipant[];
  studentCount: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === "string";
const isNullableString = (value: unknown): value is string | null => value === null || isString(value);

/** Validates the RPC payload so the UI never renders half-shaped data. */
export function parseLobby(data: unknown): LobbySnapshot {
  if (!isObject(data) || !isObject(data.race) || !isObject(data.viewer)) {
    throw new Error("invalid_lobby_payload");
  }
  const { race, viewer, teams, participants, studentCount } = data;

  if (
    !isString(race.id) ||
    !isString(race.code) ||
    !isString(race.title) ||
    !isNullableString(race.description) ||
    !isRaceStatus(race.status) ||
    !isNullableString(race.startedAt) ||
    !isNullableString(race.finishedAt) ||
    (viewer.role !== "teacher" && viewer.role !== "student") ||
    !isNullableString(viewer.participantId) ||
    !isNullableString(viewer.displayName) ||
    !isNullableString(viewer.teamId) ||
    !Array.isArray(teams) ||
    !Array.isArray(participants) ||
    typeof studentCount !== "number"
  ) {
    throw new Error("invalid_lobby_payload");
  }

  const parsedTeams = teams.map((team): LobbyTeam => {
    if (!isObject(team) || !isString(team.id) || !isString(team.name) || typeof team.memberCount !== "number") {
      throw new Error("invalid_lobby_payload");
    }
    return { id: team.id, name: team.name, memberCount: team.memberCount };
  });

  const parsedParticipants = participants.map((participant): LobbyParticipant => {
    if (
      !isObject(participant) ||
      !isString(participant.id) ||
      !isString(participant.displayName) ||
      !isNullableString(participant.teamId)
    ) {
      throw new Error("invalid_lobby_payload");
    }
    return { id: participant.id, displayName: participant.displayName, teamId: participant.teamId };
  });

  return {
    race: {
      id: race.id,
      code: race.code,
      title: race.title,
      description: race.description,
      status: race.status,
      startedAt: race.startedAt,
      finishedAt: race.finishedAt,
    },
    viewer: {
      role: viewer.role,
      participantId: viewer.participantId,
      displayName: viewer.displayName,
      teamId: viewer.teamId,
    },
    teams: parsedTeams,
    participants: parsedParticipants,
    studentCount,
  };
}

/** Stable colour per team position — the same team keeps its colour for everyone. */
export const TEAM_COLORS = ["#635BFF", "#21B8A6", "#FFB020", "#FF6B6B", "#3A86FF", "#9B5DE5"] as const;

export function teamColor(teams: LobbyTeam[], teamId: string | null): string | null {
  if (!teamId) return null;
  const index = teams.findIndex((team) => team.id === teamId);
  return index === -1 ? null : TEAM_COLORS[index % TEAM_COLORS.length];
}
