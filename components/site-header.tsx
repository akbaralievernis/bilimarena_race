import Link from "next/link";
import { AccountMenu } from "@/components/auth/account-menu";
import { BrandMark } from "@/components/brand-mark";

export function SiteHeader() {
  return (
    <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:h-20 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="group inline-flex shrink-0 items-center gap-2.5 rounded-xl font-display text-lg font-bold tracking-tight"
      >
        <BrandMark className="size-9 transition-transform duration-300 group-hover:-rotate-6" />
        <span>
          Bilim Arena <span className="text-brand">Race</span>
        </span>
      </Link>
      <AccountMenu />
    </header>
  );
}
