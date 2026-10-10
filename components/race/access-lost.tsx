"use client";

import { useI18n } from "@/components/i18n/i18n-provider";
import { ButtonLink } from "@/components/ui/button-link";

/** Shown when a live refresh reports the race is gone or no longer accessible. */
export function AccessLost() {
  const { m } = useI18n();
  return (
    <div className="mx-auto max-w-xl rounded-card bg-surface p-8 text-center shadow-card ring-1 ring-line">
      <h1 className="font-display text-2xl font-bold">{m.notices.lostTitle}</h1>
      <p className="mt-3 text-ink-muted">{m.notices.lostText}</p>
      <ButtonLink href="/join" variant="secondary" className="mt-6">
        {m.notices.joinByCode}
      </ButtonLink>
    </div>
  );
}
