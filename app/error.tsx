"use client";

import { useEffect } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import { NoticeCard } from "@/components/notice-card";
import { buttonClass } from "@/components/ui/button-styles";

const icon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-8">
    <path
      d="M12 8v5m0 3.5h.01M10.3 3.9L2.4 17.6A2 2 0 004.1 20.6h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Any unexpected error on a page: a calm screen with "try again" instead of a
 * blank page in the middle of a lesson. The real message stays in the console
 * (and in the server logs under `digest`), never on the screen.
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { m } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <NoticeCard
      badge={m.notices.errorBadge}
      title={m.notices.errorTitle}
      description={m.notices.errorText}
      icon={icon}
    >
      <button type="button" onClick={() => retry()} className={buttonClass({ className: "mt-8 w-full sm:w-auto" })}>
        {m.common.retry}
      </button>
      {error.digest && <p className="mt-4 font-mono text-xs text-ink-muted">{m.common.errorCode(error.digest)}</p>}
    </NoticeCard>
  );
}
