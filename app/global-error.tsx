"use client";

import { useSyncExternalStore } from "react";
import { LOCALE_COOKIE, MESSAGES, toLocale } from "@/lib/i18n/config";
import "./globals.css";

const noSubscribe = () => () => {};

/** The layout (and its language provider) is gone here: read the language cookie directly. */
function useCookieLocale() {
  return useSyncExternalStore(
    noSubscribe,
    () => toLocale(document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`))?.[1]),
    () => toLocale(undefined),
  );
}

/**
 * Last resort when the root layout itself fails. It replaces the layout, so it
 * renders its own <html> and <body> and depends on nothing but the styles.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const locale = useCookieLocale();
  const m = MESSAGES[locale];
  return (
    <html lang={locale}>
      <body className="flex min-h-screen items-center justify-center bg-canvas px-4 font-sans text-ink">
        <main className="w-full max-w-md rounded-card bg-surface p-8 text-center shadow-card ring-1 ring-line">
          <h1 className="text-2xl font-bold">{m.notices.globalTitle}</h1>
          <p className="mt-3 text-ink-muted">{m.notices.globalText}</p>
          <button
            type="button"
            onClick={() => retry()}
            className="mt-6 min-h-12 rounded-2xl bg-brand px-6 font-bold text-white hover:bg-brand-strong"
          >
            {m.common.retry}
          </button>
          {error.digest && <p className="mt-4 font-mono text-xs text-ink-muted">{m.common.errorCode(error.digest)}</p>}
        </main>
      </body>
    </html>
  );
}
