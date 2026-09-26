import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export function SiteHeader() {
  return (
    <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:h-20 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="group inline-flex items-center gap-2.5 rounded-xl font-display text-lg font-bold tracking-tight"
      >
        <BrandMark className="size-9 transition-transform duration-300 group-hover:-rotate-6" />
        <span>
          Bilim Arena <span className="text-brand">Race</span>
        </span>
      </Link>
    </header>
  );
}
