export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

// `not-disabled:` (not `enabled:`) so hover/active states also apply to links.
const base =
  "inline-flex items-center justify-center gap-2.5 font-bold transition duration-200 ease-out select-none " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const sizes: Record<ButtonSize, string> = {
  md:
    "min-h-14 rounded-2xl px-7 text-base " +
    "not-disabled:hover:-translate-y-0.5 not-disabled:active:translate-y-0 not-disabled:active:scale-[0.98]",
  sm: "min-h-10 rounded-xl px-3.5 text-sm not-disabled:active:scale-[0.97]",
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white shadow-brand not-disabled:hover:bg-brand-strong not-disabled:hover:shadow-lift",
  secondary:
    "bg-surface text-ink shadow-card ring-1 ring-line " +
    "not-disabled:hover:text-brand-strong not-disabled:hover:ring-brand/40 not-disabled:hover:shadow-lift",
  ghost: "text-ink-muted not-disabled:hover:bg-brand-soft not-disabled:hover:text-brand-strong",
  danger: "text-danger not-disabled:hover:bg-danger-soft",
};

export function buttonClass({
  variant = "primary",
  size = "md",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return `${base} ${sizes[size]} ${variants[variant]} ${className}`;
}
