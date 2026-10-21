import type { LobbyTeam, RoutePoint } from "@/lib/race/lobby";

/*
 * What happened between two live snapshots: who moved, who overtook whom, who
 * took the lead, who finished. Only describes the data — the database decides
 * every move — so the screens can show it as a live feed with a bit of drama.
 */

export type RaceEvent =
  | { kind: "advance"; teamId: string; team: string; position: number }
  | { kind: "finish"; teamId: string; team: string; order: number | null }
  | { kind: "overtake"; teamId: string; team: string; otherId: string; other: string }
  | { kind: "lead"; teamId: string; team: string };

const byId = (teams: LobbyTeam[]) => new Map(teams.map((team) => [team.id, team]));

/** The single leader (place 1 held by one team), or null on a tie or before scores exist. */
function leaderOf(teams: LobbyTeam[]): LobbyTeam | null {
  const top = teams.filter((team) => team.place === 1);
  return top.length === 1 ? top[0] : null;
}

export function diffRace(prev: LobbyTeam[], next: LobbyTeam[], route: RoutePoint[]): RaceEvent[] {
  if (prev.length === 0) return [];
  const before = byId(prev);
  const events: RaceEvent[] = [];
  const last = route.length - 1;

  for (const team of next) {
    const old = before.get(team.id);
    if (!old || team.position <= old.position) continue;
    if (team.position >= last && last > 0) {
      events.push({ kind: "finish", teamId: team.id, team: team.name, order: team.finishOrder });
    } else {
      events.push({ kind: "advance", teamId: team.id, team: team.name, position: team.position });
    }
  }

  // Overtakes: a team that was strictly behind another is now strictly ahead.
  for (const team of next) {
    const old = before.get(team.id);
    if (!old || old.place === null || team.place === null || team.place >= old.place) continue;
    for (const other of next) {
      if (other.id === team.id) continue;
      const otherOld = before.get(other.id);
      if (!otherOld || otherOld.place === null || other.place === null) continue;
      if (otherOld.place < old.place && other.place > team.place) {
        events.push({ kind: "overtake", teamId: team.id, team: team.name, otherId: other.id, other: other.name });
      }
    }
  }

  const oldLeader = leaderOf(prev);
  const newLeader = leaderOf(next);
  if (newLeader && newLeader.id !== oldLeader?.id && newLeader.score > 0) {
    events.push({ kind: "lead", teamId: newLeader.id, team: newLeader.name });
  }
  return events;
}

/** Points to the team just above (null for the leader) and the lead over the team just below. */
export function gaps(teams: LobbyTeam[], teamId: string): { toAbove: number | null; overBelow: number | null } {
  const sorted = [...teams].sort((a, b) => b.score - a.score);
  const index = sorted.findIndex((team) => team.id === teamId);
  if (index < 0) return { toAbove: null, overBelow: null };
  const me = sorted[index];
  const above = sorted[index - 1];
  const below = sorted[index + 1];
  return {
    toAbove: above ? Math.max(0, above.score - me.score) : null,
    overBelow: below ? Math.max(0, me.score - below.score) : null,
  };
}
