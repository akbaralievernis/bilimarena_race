"use client";

import { useState } from "react";
import { fieldError, useFormAction } from "@/components/forms/use-form-action";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { signInAction, signUpAction } from "./actions";

type Mode = "sign-in" | "sign-up";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [mode, setMode] = useState<Mode>("sign-in");

  return (
    <div>
      <div role="group" aria-label="Вход или регистрация" className="grid grid-cols-2 gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line">
        {(
          [
            ["sign-in", "Вход"],
            ["sign-up", "Регистрация"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className={`min-h-11 rounded-xl text-sm font-bold transition ${
              mode === value ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {initialError && <Alert className="mt-6">{initialError}</Alert>}

      {/* Separate components keep each form's state apart when switching tabs. */}
      {mode === "sign-in" ? <SignInForm next={next} /> : <SignUpForm next={next} />}
    </div>
  );
}

function SignInForm({ next }: { next: string }) {
  const [state, formAction, pending] = useFormAction(signInAction);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const locked = pending || (state.status === "success" && state.redirecting);

  return (
    <form action={formAction} className="mt-6 space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <TextField
        id="sign-in-email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fieldError(state, "email")}
        disabled={locked}
        required
      />
      <TextField
        id="sign-in-password"
        name="password"
        type="password"
        label="Пароль"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldError(state, "password")}
        disabled={locked}
        required
      />
      {state.status === "error" && state.message && <Alert>{state.message}</Alert>}
      <Button type="submit" className="w-full" pending={locked} pendingLabel={pending ? "Вход…" : "Переходим…"}>
        Войти
      </Button>
    </form>
  );
}

function SignUpForm({ next }: { next: string }) {
  const [state, formAction, pending] = useFormAction(signUpAction);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const locked = pending || (state.status === "success" && state.redirecting);

  if (state.status === "success" && !state.redirecting) {
    return (
      <Alert tone="success" className="mt-6">
        {state.message}
      </Alert>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <TextField
        id="sign-up-name"
        name="name"
        label="Имя"
        hint="Его увидят студенты в лобби."
        autoComplete="name"
        maxLength={40}
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={fieldError(state, "name")}
        disabled={locked}
        required
      />
      <TextField
        id="sign-up-email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fieldError(state, "email")}
        disabled={locked}
        required
      />
      <TextField
        id="sign-up-password"
        name="password"
        type="password"
        label="Пароль"
        hint="Минимум 8 символов."
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldError(state, "password")}
        disabled={locked}
        required
      />
      {state.status === "error" && state.message && <Alert>{state.message}</Alert>}
      <Button
        type="submit"
        className="w-full"
        pending={locked}
        pendingLabel={pending ? "Создание аккаунта…" : "Переходим…"}
      >
        Создать аккаунт учителя
      </Button>
    </form>
  );
}
