"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocaleAction } from "@/app/i18n-actions";
import { LOCALES } from "@/lib/i18n/config";
import { useI18n } from "./i18n-provider";

/** КЫР / РУС: saves the choice and re-renders the page in the other language. */
export function LanguageSwitch() {
  const { locale, m } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div role="group" aria-label={m.language.label} className="flex shrink-0 rounded-xl bg-canvas p-0.5 ring-1 ring-line">
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-pressed={option === locale}
          aria-label={m.language.names[option]}
          disabled={pending}
          onClick={() => {
            if (option === locale) return;
            startTransition(async () => {
              await setLocaleAction(option);
              router.refresh();
            });
          }}
          className={`min-h-9 rounded-[10px] px-2.5 text-xs font-extrabold tracking-wide transition ${
            option === locale ? "bg-surface text-brand-strong shadow-card" : "text-ink-muted hover:text-ink"
          }`}
        >
          {m.language.short[option]}
        </button>
      ))}
    </div>
  );
}
