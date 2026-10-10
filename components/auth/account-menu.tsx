"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useI18n } from "@/components/i18n/i18n-provider";
import { signOutAction } from "@/lib/auth/actions";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

type Account = { kind: "loading" } | { kind: "guest" } | { kind: "student" } | { kind: "teacher"; name: string };

function toAccount(session: Session | null, fallbackName: string): Account {
  const user = session?.user;
  if (!user) return { kind: "guest" };
  if (user.is_anonymous) return { kind: "student" };
  const name = user.user_metadata?.display_name;
  return { kind: "teacher", name: typeof name === "string" && name ? name : (user.email ?? fallbackName) };
}

/**
 * Header account state. Display only — pages and the database make the real
 * access decisions. Rendered on the client so the landing page stays static.
 */
export function AccountMenu() {
  const pathname = usePathname();
  const { m } = useI18n();
  const fallbackName = m.header.teacher;
  const [account, setAccount] = useState<Account>({ kind: "loading" });

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    let active = true;

    // Re-read on navigation: server actions (sign in / out) change cookies.
    supabase.auth.getSession().then(({ data }) => {
      if (active) setAccount(toAccount(data.session, fallbackName));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setAccount(toAccount(session, fallbackName));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [pathname, fallbackName]);

  if (account.kind === "teacher") {
    return (
      <form action={signOutAction} className="flex min-w-0 items-center gap-2">
        <span className="hidden max-w-48 truncate text-sm font-semibold text-ink-muted sm:inline" title={account.name}>
          {account.name}
        </span>
        <button
          type="submit"
          className="min-h-10 rounded-xl px-3.5 text-sm font-bold text-ink-muted transition hover:bg-brand-soft hover:text-brand-strong"
        >
          {m.header.signOut}
        </button>
      </form>
    );
  }

  if (account.kind === "guest" && pathname !== "/login") {
    return (
      <Link
        href="/login"
        className="min-h-10 shrink-0 rounded-xl px-3.5 py-2.5 text-sm font-bold text-ink-muted transition hover:bg-brand-soft hover:text-brand-strong"
      >
        <span className="sm:hidden">{m.header.signIn}</span>
        <span className="hidden sm:inline">{m.header.signInTeacher}</span>
      </Link>
    );
  }

  return null;
}
