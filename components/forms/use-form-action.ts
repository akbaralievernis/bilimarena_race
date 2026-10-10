"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import type { ActionResult } from "@/lib/actions";
import { useI18n } from "@/components/i18n/i18n-provider";
import { clientErrorMessage } from "@/lib/race/errors";

export type FormState<Field extends string> =
  | { status: "idle" }
  | { status: "error"; message?: string; fieldErrors?: Partial<Record<Field, string>> }
  | { status: "success"; message?: string; redirecting: boolean };

/**
 * Wraps a Server Action for a <form action>. `pending` covers the request;
 * after a successful answer with `redirectTo` the state stays "success" with
 * `redirecting: true`, so the submit button remains locked during navigation.
 */
export function useFormAction<Field extends string>(action: (formData: FormData) => Promise<ActionResult<Field>>) {
  const router = useRouter();
  const { m } = useI18n();

  return useActionState<FormState<Field>, FormData>(async (_previous, formData) => {
    try {
      const result = await action(formData);
      if (!result.ok) {
        return { status: "error", message: result.message, fieldErrors: result.fieldErrors };
      }
      if (result.redirectTo) router.push(result.redirectTo);
      return { status: "success", message: result.message, redirecting: Boolean(result.redirectTo) };
    } catch (error) {
      return { status: "error", message: clientErrorMessage(error, m) };
    }
  }, { status: "idle" });
}

export function fieldError<Field extends string>(state: FormState<Field>, field: Field): string | undefined {
  return state.status === "error" ? state.fieldErrors?.[field] : undefined;
}
