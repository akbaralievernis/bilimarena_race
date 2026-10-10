"use client";

import { useI18n } from "@/components/i18n/i18n-provider";
import { RouteStrip } from "@/components/race/route-strip";
import { ButtonLink } from "@/components/ui/button-link";
import { teamColor, type LobbySnapshot } from "@/lib/race/lobby";
import { minutesLabel } from "@/lib/race/timer";
import { formatRoomCode } from "@/lib/race/validation";
import { ConnectionBanner, ConnectionPill } from "./connection-status";
import { StatusBadge } from "./status-badge";
import type { ConnectionState } from "./use-lobby";

function WaitingDots() {
  return (
    <span aria-hidden="true">
      <span className="waiting-dot">.</span>
      <span className="waiting-dot [animation-delay:0.2s]">.</span>
      <span className="waiting-dot [animation-delay:0.4s]">.</span>
    </span>
  );
}

export function StudentLobby({ lobby, connection }: { lobby: LobbySnapshot; connection: ConnectionState }) {
  const { race, viewer } = lobby;
  const { m } = useI18n();
  const team = lobby.teams.find((candidate) => candidate.id === viewer.teamId) ?? null;
  const color = teamColor(lobby.teams, viewer.teamId);
  const teammates = team ? lobby.participants.filter((participant) => participant.teamId === team.id) : [];

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <ConnectionBanner state={connection} />

      <section className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line sm:p-10">
        <div className="flex items-center justify-between gap-3">
          <StatusBadge status={race.status} />
          <ConnectionPill state={connection} />
        </div>

        <p className="mt-6 text-sm font-bold text-teal-strong">Bilim Arena Race</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight break-words sm:text-3xl">{race.title}</h1>
        {race.description && <p className="mt-2 whitespace-pre-line text-ink-muted">{race.description}</p>}
        <p className="mt-3 text-sm text-ink-muted">
          {m.lobby.roomCode}: <span className="font-mono font-bold tracking-wider text-ink">{formatRoomCode(race.code)}</span>
          {race.timeLimitSeconds !== null && (
            <>
              {" · "}
              {m.lobby.raceTime}: <span className="font-bold text-ink">{minutesLabel(race.timeLimitSeconds, m)}</span>
            </>
          )}
        </p>

        <div className="mt-8 rounded-2xl bg-canvas px-5 py-4 ring-1 ring-line">
          <p className="text-sm font-semibold text-ink-muted">{m.lobby.joinedAs}</p>
          <p className="mt-1 font-display text-xl font-bold break-words">{viewer.displayName}</p>
        </div>

        {/* Keyed by team so a new assignment visibly pops in. */}
        <div key={viewer.teamId ?? "none"} className="animate-pop-in mt-4">
          {team ? (
            <div className="rounded-2xl px-5 py-4" style={{ boxShadow: `inset 0 0 0 2px ${color ?? "#E4E7F0"}` }}>
              <p className="text-sm font-semibold text-ink-muted">{m.lobby.team}</p>
              <p className="mt-1 flex items-center gap-2.5 font-display text-xl font-bold break-words">
                <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: color ?? undefined }} aria-hidden="true" />
                {team.name}
              </p>
              <p className="mt-4 text-sm font-semibold text-ink-muted">{m.lobby.teamMembers}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {teammates.map((member) => (
                  <li
                    key={member.id}
                    className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${
                      member.id === viewer.participantId ? "bg-brand-soft text-brand-strong ring-brand/30" : "bg-canvas ring-line"
                    }`}
                  >
                    {member.displayName}
                    {member.id === viewer.participantId && <span className="sr-only">{m.lobby.itsYou}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-line px-5 py-4">
              <p className="font-bold">{m.lobby.noTeamTitle}</p>
              <p className="mt-1 text-sm text-ink-muted">{m.lobby.noTeamText}</p>
            </div>
          )}
        </div>

        <div className="mt-6">
          <p className="text-sm font-semibold text-ink-muted">{m.lobby.routeLabel}</p>
          <div className="mt-2">
            <RouteStrip route={lobby.route} />
          </div>
        </div>

        <div className="mt-8 text-center" role="status">
          {race.status === "running" ? (
            <>
              <p className="font-display text-xl font-bold text-teal-strong">{m.lobby.started}</p>
              <ButtonLink href={`/race/${race.id}`} className="mt-4 w-full sm:w-auto">
                {m.lobby.openMap}
              </ButtonLink>
            </>
          ) : race.status === "finished" ? (
            <p className="font-display text-xl font-bold">{m.lobby.finished}</p>
          ) : (
            <p className="font-display text-lg font-bold text-ink-muted">
              {m.lobby.waiting}
              <WaitingDots />
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
