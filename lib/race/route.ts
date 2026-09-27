import type { LobbyTeam, RoutePoint } from "@/lib/race/lobby";

/*
 * Reading the route for the UI. The database decides every move
 * (advance_team); these helpers only describe the current snapshot.
 */

/** "Старт", "Чекпоинт 2", "Финиш". */
export function pointLabel(point: RoutePoint): string {
  if (point.type === "start") return "Старт";
  if (point.type === "finish") return "Финиш";
  return `Чекпоинт ${point.position}`;
}

/** Label plus the teacher's title for checkpoints: "Чекпоинт 2 · Проценты". */
export function pointName(point: RoutePoint): string {
  return point.type === "checkpoint" ? `${pointLabel(point)} · ${point.title}` : pointLabel(point);
}

export type TeamProgress = {
  current: RoutePoint;
  /** The point the team may move to next; null at FINISH. */
  next: RoutePoint | null;
  finished: boolean;
  /** Share of the route covered: 0 at START, 1 at FINISH. */
  ratio: number;
};

export function teamProgress(route: RoutePoint[], position: number): TeamProgress | null {
  const current = route[position];
  if (!current) return null;
  const last = route.length - 1;
  return {
    current,
    next: route[position + 1] ?? null,
    finished: current.type === "finish",
    ratio: last > 0 ? position / last : 0,
  };
}

export function teamsAt(teams: LobbyTeam[], position: number): LobbyTeam[] {
  return teams.filter((team) => team.position === position);
}

export function checkpointCount(route: RoutePoint[]): number {
  return route.filter((point) => point.type === "checkpoint").length;
}
