import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button-link";

type NoticeCardProps = {
  badge: string;
  title: string;
  description: string;
  icon: ReactNode;
  children?: ReactNode;
};

/** Centered card for placeholder and status pages. */
export function NoticeCard({ badge, title, description, icon, children }: NoticeCardProps) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 items-center px-4 py-10 sm:px-6 sm:py-16">
      <div className="w-full rounded-card bg-surface p-7 text-center shadow-card ring-1 ring-line sm:p-12">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          {icon}
        </div>
        <p className="mt-6 inline-flex rounded-full bg-sun-soft px-3 py-1 text-xs font-bold tracking-wide text-ink uppercase">
          {badge}
        </p>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-ink-muted">{description}</p>
        {children}
        <ButtonLink href="/" variant="secondary" className="mt-8 w-full sm:w-auto">
          <svg viewBox="0 0 20 20" aria-hidden="true" className="size-5">
            <path
              d="M12 5l-5 5 5 5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          На главную
        </ButtonLink>
      </div>
    </main>
  );
}
