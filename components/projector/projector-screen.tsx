"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import { JoinQr } from "@/components/lobby/join-qr";
import { StatusBadge } from "@/components/lobby/status-badge";
import { useLobby } from "@/components/lobby/use-lobby";
import { AccessLost } from "@/components/race/access-lost";
import { Leaderboard } from "@/components/race/leaderboard";
import { RaceClock } from "@/components/race/race-clock";
import { RouteMap } from "@/components/race/route-map";
import { useRaceClock } from "@/components/race/use-race-clock";
import { buttonClass } from "@/components/ui/button-styles";
import { teamColor, type LobbySnapshot } from "@/lib/race/lobby";
import { minutesLabel } from "@/lib/race/timer";
import { formatRoomCode } from "@/lib/race/validation";

const noSubscribe = () => () => {};

/** The site's address as the board shows it ("bilimarenarace.vercel.app"); empty on the server. */
function useHost() {
  return useSyncExternalStore(
    noSubscribe,
    () => window.location.host,
    () => "",
  );
}

/** Full screen toggle; browsers allow it only after a click, so it is a button. */
function useFullscreen() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);
  return { on, toggle };
}

/**
 * Stage 7: the projector view. Read-only — no button here changes the race, so
 * a click on the board cannot start or finish it by mistake. It covers the
 * site header and footer and follows the race live, like every other screen.
 */
export function ProjectorScreen({ initial }: { initial: LobbySnapshot }) {
  const { lobby, accessLost, refresh } = useLobby(initial);
  const secondsLeft = useRaceClock(lobby.race, refresh);
  const fullscreen = useFullscreen();
  const host = useHost();
  const { m } = useI18n();
  const t = m.projector;

  if (accessLost) return <AccessLost />;

  const { race, route, teams, participants } = lobby;
  const waiting = race.status === "draft" || race.status === "lobby";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas">
      <div className="mx-auto flex min-h-full max-w-[1800px] flex-col gap-[2.5vh] px-6 py-[2.5vh] lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-4">
            <StatusBadge status={race.status} />
            <h1 className="min-w-0 font-display text-[clamp(1.75rem,5vh,3rem)] leading-tight font-bold tracking-tight break-words">
              {race.title}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {secondsLeft !== null && <RaceClock seconds={secondsLeft} big />}
            <button type="button" onClick={fullscreen.toggle} className={buttonClass({ variant: "secondary", size: "sm" })}>
              {fullscreen.on ? t.exitFullscreen : t.fullscreen}
            </button>
          </div>
        </header>

        {waiting ? (
          <div className="grid flex-1 grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section
              aria-label={t.howToJoin}
              className="flex flex-col items-center gap-[2vh] rounded-card bg-surface p-[3vh] text-center shadow-card ring-1 ring-line"
            >
              {/* Sized by the screen height: a 1280×720 projector must show QR and code without scrolling. */}
              <JoinQr code={race.code} className="size-[min(42vh,26rem)]" />
              <p className="text-[clamp(1.25rem,3.2vh,1.875rem)] text-ink-muted">
                {t.scanOrOpen} <span className="font-bold whitespace-nowrap text-ink">{host || t.site}/join</span>
              </p>
              <p
                className="font-mono text-[clamp(3rem,10vh,6.5rem)] leading-none font-bold tracking-[0.2em]"
                aria-label={m.roomCode.aria(race.code.split("").join(" "))}
              >
                {formatRoomCode(race.code)}
              </p>
              {race.timeLimitSeconds !== null && (
                <p className="text-[clamp(1.125rem,3vh,1.5rem)] font-bold text-ink-muted">
                  {t.raceTime}: {minutesLabel(race.timeLimitSeconds, m)}
                </p>
              )}
            </section>

            <section aria-labelledby="joined-heading" className="rounded-card bg-surface p-8 shadow-card ring-1 ring-line">
              <h2 id="joined-heading" className="font-display text-3xl font-bold tracking-tight">
                {t.joined}: <span className="tabular-nums">{lobby.studentCount}</span>
              </h2>
              {teams.length === 0 ? (
                <ul className="mt-6 flex flex-wrap gap-3 text-xl">
                  {participants.map((participant) => (
                    <li key={participant.id} className="max-w-full truncate rounded-full bg-canvas px-4 py-2 font-semibold ring-1 ring-line">
                      {participant.displayName}
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {teams.map((team) => {
                    const members = participants.filter((participant) => participant.teamId === team.id);
                    return (
                      <li key={team.id} className="min-w-0 rounded-2xl p-5 ring-1 ring-line">
                        <p className="flex min-w-0 items-center gap-3 text-2xl font-bold">
                          <span
                            className="size-4 shrink-0 rounded-full"
                            style={{ backgroundColor: teamColor(teams, team.id) ?? undefined }}
                            aria-hidden="true"
                          />
                          <span className="truncate">{team.name}</span>
                          <span className="ml-auto shrink-0 text-lg text-ink-muted tabular-nums">{members.length}</span>
                        </p>
                        {members.length > 0 && (
                          <p className="mt-2 text-lg break-words text-ink-muted">
                            {members.map((member) => member.displayName).join(", ")}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <section aria-labelledby="board-map" className="rounded-card bg-surface p-8 shadow-card ring-1 ring-line">
              <h2 id="board-map" className="font-display text-2xl font-bold tracking-tight lg:text-3xl">
                {t.map}
              </h2>
              {/* The shared components are sized for laptops; the board needs them bigger. */}
              <div className="mt-6 xl:[zoom:1.15]">
                <RouteMap route={route} teams={teams} />
              </div>
            </section>
            <section aria-labelledby="board-places" className="rounded-card bg-surface p-8 shadow-card ring-1 ring-line">
              <h2 id="board-places" className="font-display text-2xl font-bold tracking-tight lg:text-3xl">
                {race.status === "finished" ? t.results : t.places}
              </h2>
              <div className="mt-6 grid grid-cols-1 lg:[zoom:1.25]">
                <Leaderboard teams={teams} route={route} />
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
