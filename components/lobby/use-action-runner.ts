"use client";

import { useCallback, useRef, useState } from "react";
import type { LobbyActionResult } from "@/app/race/[raceId]/lobby/actions";
import { useI18n } from "@/components/i18n/i18n-provider";
import { clientErrorMessage } from "@/lib/race/errors";

/**
 * Runs lobby Server Actions keyed by what they touch ("create-team",
 * "assign:<id>"…). The same key can't run twice at once (double clicks), while
 * different rows stay independent. Errors are kept per key.
 */
export function useActionRunner(refresh: () => Promise<void>) {
  // The ref is the lock (synchronous); state only drives rendering.
  const lock = useRef(new Set<string>());
  const { m } = useI18n();
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});

  const setError = useCallback((key: string, message: string | null) => {
    setErrors((current) => {
      const next = { ...current };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }, []);

  const run = useCallback(
    async (key: string, action: () => Promise<LobbyActionResult>): Promise<boolean> => {
      if (lock.current.has(key)) return false;
      lock.current.add(key);
      setPending(new Set(lock.current));
      setError(key, null);
      try {
        const result = await action();
        if (!result.ok) {
          setError(key, result.message);
          return false;
        }
        await refresh();
        return true;
      } catch (error) {
        setError(key, clientErrorMessage(error, m));
        return false;
      } finally {
        lock.current.delete(key);
        setPending(new Set(lock.current));
      }
    },
    [refresh, setError, m],
  );

  return {
    run,
    isPending: (key: string) => pending.has(key),
    errorFor: (key: string) => errors[key],
    clearError: (key: string) => setError(key, null),
  };
}

export type ActionRunner = ReturnType<typeof useActionRunner>;
