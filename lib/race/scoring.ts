import { ru, type Messages } from "@/lib/i18n/messages/ru";
import type { LobbyTeam, TeamStats } from "@/lib/race/lobby";

/*
 * Stage 4 scoring for the UI. The database decides every point and place
 * (submit_answer, private.team_standings); these values only explain the rules
 * and order the snapshot it sends.
 */

/** Mirror of supabase/migrations/20261007100100_scoring_functions.sql — for texts only. */
export const SCORING = {
  correct: 100,
  speedBonusMax: 50,
  /** The speed bonus loses one point every this many seconds. */
  speedBonusStepSeconds: 3,
  wrong: -20,
  pauseSeconds: 10,
  /** Bonus for the 1st, 2nd and 3rd team at FINISH. */
  finishBonus: [100, 60, 30],
} as const;

/**
 * Teams in leaderboard order: by place (1 first), equal places by name.
 * Teams without a place (database before Stage 4) follow by position, score.
 */
export function standings(teams: LobbyTeam[]): LobbyTeam[] {
  return [...teams].sort(
    (a, b) =>
      (a.place ?? Number.MAX_SAFE_INTEGER) - (b.place ?? Number.MAX_SAFE_INTEGER) ||
      b.position - a.position ||
      b.score - a.score ||
      a.name.localeCompare(b.name, "ru"),
  );
}

/** Share of correct answers in percent, or null before the first answer. */
export function accuracy(stats: TeamStats | null): number | null {
  if (!stats) return null;
  const total = stats.correct + stats.wrong;
  return total === 0 ? null : Math.round((stats.correct / total) * 100);
}

/** "+150", "−20", "0" — with a real minus sign. */
export function formatPoints(points: number): string {
  if (points > 0) return `+${points}`;
  if (points < 0) return `−${Math.abs(points)}`;
  return "0";
}

/** The word for points after a number: "очков" / "упай". */
export function pointsWord(points: number, m: Messages = ru): string {
  return m.scoring.pointsWord(points);
}

/** Rules in one line for students and teachers. */
export function rulesSummary(m: Messages = ru): string {
  return m.scoring.rules({
    correct: SCORING.correct,
    speedBonusMax: SCORING.speedBonusMax,
    wrong: formatPoints(SCORING.wrong),
    pauseSeconds: SCORING.pauseSeconds,
    bonus: SCORING.finishBonus,
  });
}
