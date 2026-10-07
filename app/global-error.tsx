"use client";

import "./globals.css";

/**
 * Last resort when the root layout itself fails. It replaces the layout, so it
 * renders its own <html> and <body> and depends on nothing but the styles.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="ru">
      <body className="flex min-h-screen items-center justify-center bg-canvas px-4 font-sans text-ink">
        <main className="w-full max-w-md rounded-card bg-surface p-8 text-center shadow-card ring-1 ring-line">
          <h1 className="text-2xl font-bold">Bilim Arena Race недоступен</h1>
          <p className="mt-3 text-ink-muted">Произошла ошибка. Обновите страницу — гонка и ответы сохранены на сервере.</p>
          <button
            type="button"
            onClick={() => retry()}
            className="mt-6 min-h-12 rounded-2xl bg-brand px-6 font-bold text-white hover:bg-brand-strong"
          >
            Попробовать ещё раз
          </button>
          {error.digest && <p className="mt-4 font-mono text-xs text-ink-muted">Код ошибки: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
