import type { ComponentProps, ReactNode } from "react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/components/ui/button-styles";
import { Spinner } from "@/components/ui/spinner";

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, swaps the label and blocks repeated clicks. */
  pending?: boolean;
  pendingLabel?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  pending = false,
  pendingLabel,
  disabled,
  className = "",
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={buttonClass({ variant, size, className })}
      {...props}
    >
      {pending && <Spinner className={size === "sm" ? "size-4" : "size-5"} />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
