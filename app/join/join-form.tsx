"use client";

import { useState } from "react";
import { fieldError, useFormAction } from "@/components/forms/use-form-action";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import type { ActionResult } from "@/lib/actions";
import { isSupabaseConfigured } from "@/lib/env";
import {
  LIMITS,
  ROOM_CODE_LENGTH,
  normalizeRoomCode,
  validateDisplayName,
  validateRoomCode,
} from "@/lib/race/validation";
import { ensureStudentSession } from "@/lib/supabase/student-session";
import { joinRaceAction } from "./actions";

/**
 * Anonymous sign-in happens here, in the browser (see ensureStudentSession);
 * the Server Action then joins the race with that session. Invalid input goes
 * straight to the action for its field errors, without creating a user.
 */
async function joinFromBrowser(formData: FormData): Promise<ActionResult<"code" | "name">> {
  const valid =
    validateRoomCode(String(formData.get("code") ?? "")).ok && validateDisplayName(String(formData.get("name") ?? "")).ok;
  if (valid && isSupabaseConfigured()) {
    const message = await ensureStudentSession();
    if (message) return { ok: false, message };
  }
  return joinRaceAction(formData);
}

export function JoinForm({ initialCode }: { initialCode: string }) {
  const [state, formAction, pending] = useFormAction(joinFromBrowser);
  const [code, setCode] = useState(() => normalizeRoomCode(initialCode).slice(0, ROOM_CODE_LENGTH));
  const [name, setName] = useState("");
  const locked = pending || (state.status === "success" && state.redirecting);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <TextField
        id="join-code"
        name="code"
        label="Код гонки"
        hint="6 символов с экрана учителя."
        placeholder="A7K9Q2"
        value={code}
        // Accept any case, spaces and a Russian keyboard layout; show the canonical form.
        onChange={(event) => setCode(normalizeRoomCode(event.target.value).slice(0, ROOM_CODE_LENGTH))}
        error={fieldError(state, "code")}
        disabled={locked}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="font-mono text-2xl font-bold tracking-[0.35em] uppercase placeholder:tracking-[0.35em]"
        required
      />
      <TextField
        id="join-name"
        name="name"
        label="Имя участника"
        hint="Так вас увидят учитель и команда."
        placeholder="Например, Эрнис А."
        maxLength={LIMITS.displayName.max}
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={fieldError(state, "name")}
        disabled={locked}
        autoComplete="off"
        required
      />
      {state.status === "error" && state.message && <Alert>{state.message}</Alert>}
      <Button
        type="submit"
        className="w-full"
        pending={locked}
        pendingLabel={pending ? "Подключение…" : "Входим в лобби…"}
      >
        Подключиться
      </Button>
    </form>
  );
}
