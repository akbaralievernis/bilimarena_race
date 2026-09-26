import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary";

const base =
  "inline-flex min-h-14 items-center justify-center gap-2.5 rounded-2xl px-7 text-base font-bold " +
  "transition duration-200 ease-out select-none " +
  "hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-brand hover:bg-brand-strong hover:shadow-lift",
  secondary:
    "bg-surface text-ink shadow-card ring-1 ring-line hover:text-brand-strong hover:ring-brand/40 hover:shadow-lift",
};

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: Variant;
};

export function ButtonLink({ variant = "primary", className = "", ...props }: ButtonLinkProps) {
  return <Link className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
