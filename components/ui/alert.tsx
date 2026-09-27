import type { ReactNode } from "react";

type AlertTone = "error" | "success" | "info";

const tones: Record<AlertTone, string> = {
  error: "bg-danger-soft text-danger",
  success: "bg-teal-soft text-teal-strong",
  info: "bg-brand-soft text-brand-strong",
};

/** Inline message for forms and screens. Errors are announced immediately. */
export function Alert({ tone = "error", children, className = "" }: { tone?: AlertTone; children: ReactNode; className?: string }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-2xl px-4 py-3 text-sm font-semibold ${tones[tone]} ${className}`}
    >
      {children}
    </p>
  );
}
