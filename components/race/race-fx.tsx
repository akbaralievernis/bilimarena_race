"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import type { Messages } from "@/lib/i18n/config";
import { diffFocus, diffRace, type RaceEvent } from "@/lib/race/events";
import { teamColor, type LobbyParticipant, type LobbySnapshot, type LobbyTeam } from "@/lib/race/lobby";

/*
 * The race's live moments: a feed of what just happened, a toast for the
 * viewer's own team, confetti, the "3-2-1 Start!" countdown and score numbers
 * that count up. Everything is derived from the live snapshots; nothing here
 * changes the race.
 */

export type FeedItem = { id: number; event: RaceEvent };

type Seen = { teams: LobbyTeam[]; participants: LobbyParticipant[]; status: string; feed: FeedItem[]; seq: number; go: number; end: number };

/** Compares each new snapshot with the previous one and keeps the newest events first. */
export function useRaceEvents(lobby: LobbySnapshot) {
  const [seen, setSeen] = useState<Seen>({ teams: lobby.teams, participants: lobby.participants, status: lobby.race.status, feed: [], seq: 0, go: 0, end: 0 });
  let current = seen;
  if (seen.teams !== lobby.teams || seen.participants !== lobby.participants || seen.status !== lobby.race.status) {
    let seq = seen.seq;
    const items = [...diffRace(seen.teams, lobby.teams, lobby.route), ...diffFocus(seen.participants, lobby.participants)].map(
      (event) => ({ id: ++seq, event }),
    );
    const started = seen.status !== "running" && lobby.race.status === "running";
    const ended = seen.status === "running" && lobby.race.status === "finished";
    if (started || ended) seq += 1;
    current = {
      teams: lobby.teams,
      participants: lobby.participants,
      status: lobby.race.status,
      feed: [...items.reverse(), ...seen.feed].slice(0, 12),
      seq,
      go: started ? seq : seen.go,
      end: ended ? seq : seen.end,
    };
    // Adjusting state while rendering, as React recommends for "previous props".
    setSeen(current);
  }
  return { feed: current.feed, go: current.go, end: current.end };
}

export function eventText(event: RaceEvent, m: Messages): string {
  switch (event.kind) {
    case "advance":
      return m.live.advanced(event.team, event.position);
    case "finish":
      return m.live.finished(event.team, event.order);
    case "overtake":
      return m.live.overtook(event.team, event.other);
    case "lead":
      return m.live.newLeader(event.team);
    case "focus":
      return m.focus.leftTab(event.team, event.count, 3);
  }
}

/** The same event as the viewer's team should hear it; null when it is not about them. */
export function personalText(event: RaceEvent, ownTeamId: string | null, m: Messages): string | null {
  if (!ownTeamId) return null;
  if (event.kind === "overtake" && event.otherId === ownTeamId) return m.live.overtookYou(event.team);
  if (event.kind === "overtake" && event.teamId === ownTeamId) return m.live.youOvertook(event.other);
  if (event.kind === "lead" && event.teamId === ownTeamId) return m.live.youLead;
  if (event.kind === "finish" && event.teamId !== ownTeamId) return m.live.finished(event.team, event.order);
  return null;
}

const ICONS: Record<RaceEvent["kind"], string> = { advance: "➜", finish: "🏁", overtake: "⚡", lead: "👑", focus: "👀" };

/** Feed of the latest events for the projector and the teacher. */
export function LiveFeed({
  feed,
  teams,
  dark = false,
  limit = 6,
  showFocus = true,
}: {
  feed: FeedItem[];
  teams: LobbyTeam[];
  dark?: boolean;
  limit?: number;
  /** "Left the tab" is for the teacher, not for the class on the projector. */
  showFocus?: boolean;
}) {
  const { m } = useI18n();
  feed = showFocus ? feed : feed.filter((item) => item.event.kind !== "focus");
  return (
    <section aria-label={m.live.title}>
      <p className={`flex items-center gap-2 text-xs font-extrabold tracking-[0.18em] uppercase ${dark ? "text-white/80" : "text-brand-strong"}`}>
        <span className="live-dot size-2.5 rounded-full bg-brand" aria-hidden="true" />
        {m.live.title}
      </p>
      {feed.length === 0 ? (
        <p className={`mt-3 text-sm ${dark ? "text-white/60" : "text-ink-muted"}`}>{m.live.empty}</p>
      ) : (
        <ol className="mt-3 space-y-2" aria-live="polite">
          {feed.slice(0, limit).map((item, i) => (
            <li
              key={item.id}
              className={`animate-feed-in flex min-w-0 items-center gap-3 rounded-2xl px-3.5 py-2.5 font-semibold ${
                dark ? "bg-white/10 text-white ring-1 ring-white/15" : "bg-canvas ring-1 ring-line"
              } ${i === 0 ? "" : "opacity-80"}`}
            >
              <span
                className="grid size-8 shrink-0 place-items-center rounded-full text-sm"
                style={{ backgroundColor: teamColor(teams, item.event.teamId) ?? "#E0162B", color: "#fff" }}
                aria-hidden="true"
              >
                {ICONS[item.event.kind]}
              </span>
              <span className="min-w-0 break-words">{eventText(item.event, m)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** One toast at a time, for the newest event about the viewer's team; it fades out by itself. */
export function LiveToast({ feed, ownTeamId }: { feed: FeedItem[]; ownTeamId: string | null }) {
  const { m } = useI18n();
  const item = feed.find((candidate) => personalText(candidate.event, ownTeamId, m) !== null);
  if (!item || item.id !== feed[0]?.id) return null;
  const text = personalText(item.event, ownTeamId, m);
  const good = item.event.teamId === ownTeamId;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4">
      <p
        key={item.id}
        role="status"
        className={`animate-toast-life rounded-2xl px-5 py-3 text-center font-bold text-white shadow-lift ${good ? "bg-teal-strong" : "bg-brand"}`}
      >
        {text}
      </p>
    </div>
  );
}

// Deterministic "random" numbers, so rendering stays pure.
const rand = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
const CONFETTI = ["#E0162B", "#0FA595", "#FFB547", "#3A86FF", "#9B5DE5", "#FF7A59"];

/** A burst of confetti; change `burst` to fire again. */
export function Confetti({ burst, count = 70 }: { burst: number; count?: number }) {
  if (burst <= 0) return null;
  return (
    <div key={burst} className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const r1 = rand(burst * 97 + i);
        const r2 = rand(burst * 31 + i * 7);
        const r3 = rand(burst * 13 + i * 3);
        const style = {
          left: `${r1 * 100}%`,
          backgroundColor: CONFETTI[i % CONFETTI.length],
          animationDelay: `${r2 * 0.35}s`,
          animationDuration: `${1.6 + r3 * 1.4}s`,
          "--drift": `${(r2 - 0.5) * 220}px`,
          "--spin": `${(r3 - 0.5) * 1440}deg`,
          width: `${8 + r3 * 6}px`,
          height: `${12 + r1 * 8}px`,
        } as CSSProperties;
        return <span key={i} className="confetti-piece" style={style} />;
      })}
    </div>
  );
}

/** "3 · 2 · 1 · Start!" over the screen when the teacher starts the race. */
export function GoOverlay({ go }: { go: number }) {
  const { m } = useI18n();
  if (go <= 0) return null;
  return (
    <div key={go} className="go-overlay pointer-events-none fixed inset-0 z-50 grid place-items-center" aria-hidden="true">
      {["3", "2", "1", m.live.go].map((text, i) => (
        <span
          key={text}
          className="go-num col-start-1 row-start-1 font-display font-bold text-white"
          style={{ animationDelay: `${i * 0.8}s` }}
        >
          {text}
        </span>
      ))}
    </div>
  );
}

/** A score that counts up to its new value and shows "+N" floating away. */
export function AnimatedScore({ value, className = "" }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const [delta, setDelta] = useState({ value, by: 0, key: 0 });
  if (delta.value !== value) setDelta({ value, by: value - delta.value, key: delta.key + 1 });

  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const began = performance.now();
    const step = (now: number) => {
      const t = still ? 1 : Math.min(1, (now - began) / 900);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(start + (value - start) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span className={`relative inline-block tabular-nums ${className}`}>
      <span>{shown}</span>
      {delta.by !== 0 && (
        <span
          key={delta.key}
          className={`animate-float-up pointer-events-none absolute -top-1 left-full ml-1 text-[0.6em] font-extrabold ${
            delta.by > 0 ? "text-teal-strong" : "text-danger"
          }`}
          aria-hidden="true"
        >
          {delta.by > 0 ? `+${delta.by}` : delta.by}
        </span>
      )}
    </span>
  );
}
