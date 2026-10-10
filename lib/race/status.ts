export const RACE_STATUSES = ["draft", "lobby", "running", "finished"] as const;

export type RaceStatus = (typeof RACE_STATUSES)[number];

/**
 * Allowed transitions — mirrors private.can_transition() in the database,
 * which is the authority. Used by the UI to decide which buttons to show.
 */
const TRANSITIONS: Record<RaceStatus, readonly RaceStatus[]> = {
  draft: ["lobby"],
  lobby: ["running", "finished"],
  running: ["finished"],
  finished: [],
};

export function canTransition(from: RaceStatus, to: RaceStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isRaceStatus(value: unknown): value is RaceStatus {
  return typeof value === "string" && (RACE_STATUSES as readonly string[]).includes(value);
}

/** New students may join only while the race is open. */
export function isJoinable(status: RaceStatus): boolean {
  return status === "lobby" || status === "running";
}

