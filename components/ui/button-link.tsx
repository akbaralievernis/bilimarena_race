import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/components/ui/button-styles";

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function ButtonLink({ variant = "primary", size = "md", className = "", ...props }: ButtonLinkProps) {
  return <Link className={buttonClass({ variant, size, className })} {...props} />;
}
