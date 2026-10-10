"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { duplicateRaceAction } from "@/app/create/actions";
import { useI18n } from "@/components/i18n/i18n-provider";
import { Alert } from "@/components/ui/alert";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/components/ui/button-styles";
import { Spinner } from "@/components/ui/spinner";
import { clientErrorMessage } from "@/lib/race/errors";

/** Stage 9: copies the race and opens the new lobby. */
export function DuplicateRaceButton({
  raceId,
  title,
  label,
  variant = "secondary",
  size = "sm",
  className = "",
}: {
  raceId: string;
  title: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const { m } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function duplicate() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await duplicateRaceAction(raceId);
        if (!result.ok) setError(result.message ?? m.errors.unknown);
        else if (result.redirectTo) router.push(result.redirectTo);
      } catch (caught) {
        setError(clientErrorMessage(caught, m));
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={duplicate}
        disabled={pending}
        aria-label={label ? undefined : m.create.duplicateFor(title)}
        title={m.create.duplicateFor(title)}
        className={buttonClass({ variant, size, className })}
      >
        {pending ? <Spinner className="size-4" /> : null}
        {pending ? m.create.duplicating : (label ?? m.create.duplicate)}
      </button>
      {error && <Alert className="mt-2">{error}</Alert>}
    </>
  );
}
