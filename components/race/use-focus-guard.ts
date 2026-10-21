"use client";

import { useEffect, useRef, useState } from "react";
import { reportFocusLeaveAction } from "@/app/race/[raceId]/actions";

export const FOCUS_LIMIT = 3;

type Guard = { leaves: number; warn: boolean; removed: boolean };

/**
 * Stage 11: a browser cannot stop a student from switching tabs, but it can
 * tell. While the race runs, hiding the race tab is reported to the database
 * (which counts it and removes the seat on the 3rd time); coming back shows a
 * warning with the count.
 */
export function useFocusGuard(raceId: string, active: boolean) {
  const [guard, setGuard] = useState<Guard>({ leaves: 0, warn: false, removed: false });
  const away = useRef(false);

  useEffect(() => {
    if (!active) return;
    const onChange = () => {
      if (document.visibilityState === "hidden") {
        away.current = true;
        void reportFocusLeaveAction(raceId).then((result) => {
          if (result.ok) setGuard((current) => ({ ...current, leaves: result.leaves, removed: result.removed }));
        });
      } else if (away.current) {
        away.current = false;
        setGuard((current) => ({ ...current, warn: true }));
      }
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [raceId, active]);

  return { ...guard, dismiss: () => setGuard((current) => ({ ...current, warn: false })) };
}
