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

/** "очко", "очка", "очков" for a number. */
export function pointsWord(points: number): string {
  const n = Math.abs(points) % 100;
  const last = n % 10;
  if (n >= 11 && n <= 14) return "очков";
  if (last === 1) return "очко";
  if (last >= 2 && last <= 4) return "очка";
  return "очков";
}

/** Rules in one line for students and teachers. */
export function rulesSummary(): string {
  const [first, second, third] = SCORING.finishBonus;
  return (
    `Верный ответ — ${SCORING.correct} очков и до ${SCORING.speedBonusMax} за скорость. ` +
    `Неверный — ${formatPoints(SCORING.wrong)} и пауза ${SCORING.pauseSeconds} секунд. ` +
    `Финиш: +${first}, +${second} и +${third} первым трём командам.`
  );
}
