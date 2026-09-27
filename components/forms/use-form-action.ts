"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import type { ActionResult } from "@/lib/actions";
import { NETWORK_ERROR_MESSAGE, UNKNOWN_ERROR_MESSAGE, isNetworkError } from "@/lib/race/errors";

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

  return useActionState<FormState<Field>, FormData>(async (_previous, formData) => {
    try {
      const result = await action(formData);
      if (!result.ok) {
        return { status: "error", message: result.message, fieldErrors: result.fieldErrors };
      }
      if (result.redirectTo) router.push(result.redirectTo);
      return { status: "success", message: result.message, redirecting: Boolean(result.redirectTo) };
    } catch (error) {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      return {
        status: "error",
        message: offline || isNetworkError(error) ? NETWORK_ERROR_MESSAGE : UNKNOWN_ERROR_MESSAGE,
      };
    }
  }, { status: "idle" });
}

export function fieldError<Field extends string>(state: FormState<Field>, field: Field): string | undefined {
  return state.status === "error" ? state.fieldErrors?.[field] : undefined;
}
