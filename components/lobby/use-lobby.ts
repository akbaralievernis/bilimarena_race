"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { raceErrorCode } from "@/lib/race/errors";
import { parseLobby, type LobbySnapshot } from "@/lib/race/lobby";
import { createClient } from "@/lib/supabase/client";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "offline";

export type LobbyNotice = { id: string; text: string };

const REFRESH_DEBOUNCE_MS = 120;
const POLL_WHILE_DISCONNECTED_MS = 10_000;
// A signal can be lost even on a live socket (seen on the free Supabase tier):
// during a race the map and leaderboard are re-read every 20–25 s anyway.
const POLL_WHILE_RUNNING_MS = 20_000;
const POLL_JITTER_MS = 5_000;

// realtime-js reuses a channel with the same topic and removes it
// asynchronously. A remount (React StrictMode, navigation) waits for the
// previous removal so it never attaches to a channel that is shutting down.
const pendingRemovals = new Map<string, Promise<unknown>>();

/**
 * Live lobby state. Realtime only signals "something changed" on the private
 * channel race:<id>; the snapshot is always re-read through get_lobby(), so
 * permissions are applied by the database and missed events self-heal on the
 * next read (after reconnecting, on focus, by polling while disconnected, and
 * by a slow background read while the race is running).
 */
export function useLobby(initial: LobbySnapshot) {
  const raceId = initial.race.id;
  const supabase = useMemo(() => createClient(), []);
  const [lobby, setLobby] = useState(initial);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [accessLost, setAccessLost] = useState(false);
  const [notices, setNotices] = useState<LobbyNotice[]>([]);

  const lobbyRef = useRef(initial);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const rerun = useRef(false);

  const applySnapshot = useCallback((next: LobbySnapshot) => {
    const previous = lobbyRef.current;
    lobbyRef.current = next;
    setLobby(next);

    if (next.viewer.role === "teacher") {
      const known = new Set(previous.participants.map((participant) => participant.id));
      const joined = next.participants.filter((participant) => !known.has(participant.id));
      if (joined.length > 0) {
        setNotices((current) =>
          [
            ...current,
            ...joined.map((participant) => ({
              id: `${participant.id}-${Date.now()}`,
              text: `Новый участник: ${participant.displayName}`,
            })),
          ].slice(-4),
        );
      }
    }
  }, []);

  // One request at a time; a change during a request schedules one more read,
  // so responses can never arrive out of order.
  const refresh = useCallback((): Promise<void> => {
    if (inFlight.current) {
      rerun.current = true;
      return inFlight.current;
    }
    const run = async () => {
      do {
        rerun.current = false;
        const { data, error } = await supabase.rpc("get_lobby", { p_race_id: raceId });
        if (error) {
          if (raceErrorCode(error) === "race_not_found") setAccessLost(true);
          // Network errors keep the last snapshot; the connection banner explains.
        } else {
          try {
            applySnapshot(parseLobby(data));
          } catch {
            // Malformed payload: keep showing the last good snapshot.
          }
        }
      } while (rerun.current);
    };
    inFlight.current = run().finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }, [supabase, raceId, applySnapshot]);

  useEffect(() => {
    const topic = `race:${raceId}`;
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
    };

    void (async () => {
      await pendingRemovals.get(topic);
      if (cancelled) return;
      await supabase.realtime.setAuth();
      if (cancelled) return;

      channelRef.current = supabase
        .channel(topic, { config: { private: true } })
        .on("broadcast", { event: "lobby_changed" }, scheduleRefresh)
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            setConnection("live");
            scheduleRefresh(); // catch up on anything missed while disconnected
          } else {
            // CHANNEL_ERROR / TIMED_OUT / CLOSED: realtime-js retries by itself.
            setConnection(navigator.onLine ? "reconnecting" : "offline");
          }
        });
    })();

    return () => {
      cancelled = true;
      clearTimeout(debounce);
      const channel = channelRef.current;
      channelRef.current = null;
      if (channel) {
        const removal = supabase.removeChannel(channel).catch(() => undefined);
        pendingRemovals.set(topic, removal);
        void removal.finally(() => {
          if (pendingRemovals.get(topic) === removal) pendingRemovals.delete(topic);
        });
      }
    };
  }, [supabase, raceId, refresh]);

  useEffect(() => {
    const onOffline = () => setConnection("offline");
    const onOnline = () => {
      setConnection(channelRef.current?.state === "joined" ? "live" : "reconnecting");
      void refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Safety net while the socket is down: keep the lobby fresh by polling.
  useEffect(() => {
    if (connection === "live") return;
    const timer = setInterval(() => void refresh(), POLL_WHILE_DISCONNECTED_MS);
    return () => clearInterval(timer);
  }, [connection, refresh]);

  // Safety net while the race is running: a lost "lobby_changed" signal must not
  // freeze the leaderboard until the next event. Visible tabs only; a random
  // offset keeps a whole class from polling at the same second.
  const running = lobby.race.status === "running";
  useEffect(() => {
    if (!running || connection !== "live") return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
      timer = setTimeout(tick, POLL_WHILE_RUNNING_MS + Math.random() * POLL_JITTER_MS);
    };
    timer = setTimeout(tick, POLL_WHILE_RUNNING_MS + Math.random() * POLL_JITTER_MS);
    return () => clearTimeout(timer);
  }, [running, connection, refresh]);

  const dismissNotice = useCallback((id: string) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);

  return { lobby, connection, accessLost, notices, dismissNotice, refresh };
}
