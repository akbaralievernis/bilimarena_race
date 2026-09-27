import type { ComponentProps, ReactNode } from "react";

const control =
  "w-full rounded-2xl bg-surface px-4 text-base text-ink ring-1 ring-line transition " +
  "placeholder:text-ink-muted/70 hover:ring-brand/40 focus:ring-2 focus:ring-brand focus:outline-none " +
  "disabled:cursor-not-allowed disabled:bg-canvas aria-invalid:ring-2 aria-invalid:ring-danger";

type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
};

function FieldShell({ id, label, hint, error, children }: FieldProps & { children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold">
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {error ? (
        <p id={`${id}-error`} className="mt-2 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-2 text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: string) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export function TextField({ id, label, hint, error, className = "", ...props }: FieldProps & ComponentProps<"input">) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${control} min-h-13 ${className}`}
        {...props}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  error,
  className = "",
  ...props
}: FieldProps & ComponentProps<"textarea">) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${control} min-h-28 resize-y py-3 ${className}`}
        {...props}
      />
    </FieldShell>
  );
}
