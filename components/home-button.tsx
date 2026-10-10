"use client";

import { useI18n } from "@/components/i18n/i18n-provider";
import { ButtonLink } from "@/components/ui/button-link";

/** "На главную" / "Башкы бетке" — a client piece so NoticeCard works in server and client screens. */
export function HomeButton() {
  const { m } = useI18n();
  return (
    <ButtonLink href="/" variant="secondary" className="mt-8 w-full sm:w-auto">
      <svg viewBox="0 0 20 20" aria-hidden="true" className="size-5">
        <path d="M12 5l-5 5 5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {m.common.home}
    </ButtonLink>
  );
}
