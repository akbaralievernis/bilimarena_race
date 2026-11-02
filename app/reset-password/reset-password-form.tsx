"use client";

import { useState } from "react";
import { fieldError, useFormAction } from "@/components/forms/use-form-action";
import { useI18n } from "@/components/i18n/i18n-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { updatePasswordAction } from "./actions";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useFormAction(updatePasswordAction);
  const { m } = useI18n();
  const [password, setPassword] = useState("");
  const locked = pending || (state.status === "success" && state.redirecting);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <TextField
        id="new-password"
        name="password"
        type="password"
        label={m.resetPassword.newPassword}
        hint={m.login.passwordHint}
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldError(state, "password")}
        disabled={locked}
        required
      />
      {state.status === "error" && state.message && <Alert>{state.message}</Alert>}
      <Button type="submit" className="w-full" pending={locked} pendingLabel={pending ? m.resetPassword.saving : m.login.redirecting}>
        {m.resetPassword.submit}
      </Button>
    </form>
  );
}
