"use client";

import { createContext, useContext, type ReactNode } from "react";
import { MESSAGES, type Locale, type Messages } from "@/lib/i18n/config";

type I18n = { locale: Locale; m: Messages };

const I18nContext = createContext<I18n>({ locale: "ky", m: MESSAGES.ky });

/**
 * Only the locale crosses from the server: the texts contain functions, which
 * cannot be passed to the client, so both dictionaries ship with the bundle.
 */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <I18nContext.Provider value={{ locale, m: MESSAGES[locale] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
