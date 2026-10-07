import { isRaceStatus, type RaceStatus } from "@/lib/race/status";

/**
 * Shape returned by public.get_lobby(). Contains no internal auth ids and
 * never a correct answer: the database does not put them into the snapshot.
 */
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

/** Teacher-only team statistics (null for students). */
export type TeamStats = { correct: number; wrong: number; finishedAt: string | null };

/**
 * position: the point the team stands on (0 = START, last = FINISH).
 * score / place / finishOrder: Stage 4 standings computed by the database
 * (place: 1 = leader, equal teams share it; finishOrder: 1, 2, 3… or null).
 */
export type LobbyTeam = {
  id: string;
  name: string;
  memberCount: number;
  position: number;
  score: number;
  place: number | null;
  finishOrder: number | null;
  stats: TeamStats | null;
};

export type LobbyParticipant = { id: string; displayName: string; teamId: string | null };

export type RoutePointType = "start" | "checkpoint" | "finish";

export type TaskType = "single_choice" | "short_answer";

/**
 * One point of the race route, ordered by position (0 = START, last = FINISH).
 * `task` (question only) is sent to the race owner; everyone gets `hasTask`.
 */
export type RoutePoint = {
  position: number;
  title: string;
  type: RoutePointType;
  hasTask: boolean;
  task: { type: TaskType; question: string } | null;
};

/**
 * The task a student's team must solve to reach its next checkpoint.
 * cooldownSeconds: seconds left of the pause after a wrong answer (0 = may answer).
 */
export type CurrentTask = {
  id: string;
  checkpointPosition: number;
  type: TaskType;
  question: string;
  options: string[] | null;
  cooldownSeconds: number;
};

export type LobbySnapshot = {
  race: LobbyRace;
  viewer: LobbyViewer;
  route: RoutePoint[];
  currentTask: CurrentTask | null;
  teams: LobbyTeam[];
  participants: LobbyParticipant[];
  studentCount: number;
};

const ROUTE_POINT_TYPES: readonly string[] = ["start", "checkpoint", "finish"];
const TASK_TYPES: readonly string[] = ["single_choice", "short_answer"];
const isPosition = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const isCount = isPosition;
const isRank = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === "string";
const isNullableString = (value: unknown): value is string | null => value === null || isString(value);
const isTaskType = (value: unknown): value is TaskType => isString(value) && TASK_TYPES.includes(value);

function invalid(): never {
  throw new Error("invalid_lobby_payload");
}

// Stage 3 fields (hasTask, task, currentTask, stats) and Stage 4 fields (score,
// place, finishOrder, cooldownSeconds) may be absent while the database still
// runs an older get_lobby(): the app then works without them instead of
// failing. Present fields must still have the right type.
function parseRoutePoint(point: unknown, index: number): RoutePoint {
  if (
    !isObject(point) ||
    point.position !== index ||
    !isString(point.title) ||
    !isString(point.type) ||
    !ROUTE_POINT_TYPES.includes(point.type) ||
    (point.hasTask !== undefined && typeof point.hasTask !== "boolean")
  ) {
    invalid();
  }
  let task: RoutePoint["task"] = null;
  if (point.task !== null && point.task !== undefined) {
    if (!isObject(point.task) || !isTaskType(point.task.type) || !isString(point.task.question)) invalid();
    task = { type: point.task.type, question: point.task.question };
  }
  return {
    position: index,
    title: point.title,
    type: point.type as RoutePointType,
    hasTask: point.hasTask === true || task !== null,
    task,
  };
}

function parseCurrentTask(value: unknown): CurrentTask | null {
  if (value === null || value === undefined) return null;
  if (
    !isObject(value) ||
    !isString(value.id) ||
    !isPosition(value.checkpointPosition) ||
    !isTaskType(value.type) ||
    !isString(value.question)
  ) {
    invalid();
  }
  let options: string[] | null = null;
  if (value.options !== null && value.options !== undefined) {
    if (!Array.isArray(value.options) || !value.options.every(isString)) invalid();
    options = [...value.options];
  }
  if ((value.type === "single_choice") !== (options !== null)) invalid();
  if (value.cooldownSeconds !== undefined && !isCount(value.cooldownSeconds)) invalid();
  return {
    id: value.id,
    checkpointPosition: value.checkpointPosition,
    type: value.type,
    question: value.question,
    options,
    cooldownSeconds: isCount(value.cooldownSeconds) ? value.cooldownSeconds : 0,
  };
}

function parseStats(value: unknown): TeamStats | null {
  if (value === null || value === undefined) return null;
  if (!isObject(value) || !isCount(value.correct) || !isCount(value.wrong) || !isNullableString(value.finishedAt)) {
    invalid();
  }
  return { correct: value.correct, wrong: value.wrong, finishedAt: value.finishedAt };
}

/** Validates the RPC payload so the UI never renders half-shaped data. */
export function parseLobby(data: unknown): LobbySnapshot {
  if (!isObject(data) || !isObject(data.race) || !isObject(data.viewer)) invalid();
  const { race, viewer, route, teams, participants, studentCount } = data;

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
    !Array.isArray(route) ||
    !Array.isArray(teams) ||
    !Array.isArray(participants) ||
    typeof studentCount !== "number"
  ) {
    invalid();
  }

  const parsedTeams = teams.map((team): LobbyTeam => {
    if (
      !isObject(team) ||
      !isString(team.id) ||
      !isString(team.name) ||
      typeof team.memberCount !== "number" ||
      !isPosition(team.position) ||
      (team.score !== undefined && !isCount(team.score)) ||
      (team.place !== undefined && team.place !== null && !isRank(team.place)) ||
      (team.finishOrder !== undefined && team.finishOrder !== null && !isRank(team.finishOrder))
    ) {
      invalid();
    }
    return {
      id: team.id,
      name: team.name,
      memberCount: team.memberCount,
      position: team.position,
      score: isCount(team.score) ? team.score : 0,
      place: isRank(team.place) ? team.place : null,
      finishOrder: isRank(team.finishOrder) ? team.finishOrder : null,
      stats: parseStats(team.stats),
    };
  });

  const parsedParticipants = participants.map((participant): LobbyParticipant => {
    if (
      !isObject(participant) ||
      !isString(participant.id) ||
      !isString(participant.displayName) ||
      !isNullableString(participant.teamId)
    ) {
      invalid();
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
    route: route.map(parseRoutePoint),
    currentTask: parseCurrentTask(data.currentTask),
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
