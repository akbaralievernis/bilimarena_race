"use client";

import { useEffect, useMemo, useState } from "react";
import type { LobbyRace } from "@/lib/race/lobby";
import { createClient } from "@/lib/supabase/client";

/**
 * Seconds left in a timed race, ticking locally from the server's
 * remainingSeconds of the latest snapshot (every new snapshot re-syncs it, so
 * a phone with a wrong clock still shows the right time). At zero this device
 * asks the database to close the race — finish_expired_race() does it once for
 * everybody, refuses while time is left — and re-reads the lobby.
 *
 * Returns null for a race without a running timer.
 */
export function useRaceClock(race: LobbyRace, refresh: () => Promise<void>): number | null {
  const supabase = useMemo(() => createClient(), []);
  const [clock, setClock] = useState({ race, left: race.remainingSeconds, asked: false });
  if (clock.race !== race) setClock({ race, left: race.remainingSeconds, asked: false });

  const running = race.status === "running" && clock.left !== null;

  useEffect(() => {
    if (!running || clock.left === null || clock.left <= 0) return;
    const timer = setTimeout(() => setClock((current) => ({ ...current, left: (current.left ?? 1) - 1 })), 1000);
    return () => clearTimeout(timer);
  }, [running, clock.left]);

  useEffect(() => {
    if (!running || clock.left !== 0 || clock.asked) return;
    let cancelled = false;
    void (async () => {
      // The answer does not matter: the next snapshot shows "finished" or the real time left.
      await supabase.rpc("finish_expired_race", { p_race_id: race.id });
      if (!cancelled) setClock((current) => ({ ...current, asked: true }));
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [running, clock.left, clock.asked, supabase, race.id, refresh]);

  return running ? Math.max(0, clock.left ?? 0) : null;
}
