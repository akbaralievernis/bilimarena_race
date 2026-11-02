"use client";

import { useState } from "react";
import { fieldError, useFormAction } from "@/components/forms/use-form-action";
import { useI18n } from "@/components/i18n/i18n-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { requestPasswordResetAction, signInAction, signUpAction } from "./actions";

type Mode = "sign-in" | "sign-up" | "reset";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const { m } = useI18n();

  return (
    <div>
      <div role="group" aria-label={m.login.modes} className="grid grid-cols-2 gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line">
        {(
          [
            ["sign-in", m.login.signIn],
            ["sign-up", m.login.signUp],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value || (mode === "reset" && value === "sign-in")}
            onClick={() => setMode(value)}
            className={`min-h-11 rounded-xl text-sm font-bold transition ${
              mode === value || (mode === "reset" && value === "sign-in") ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {initialError && <Alert className="mt-6">{initialError}</Alert>}

      {/* Separate components keep each form's state apart when switching tabs. */}
      {mode === "sign-in" && <SignInForm next={next} onForgot={() => setMode("reset")} />}
      {mode === "sign-up" && <SignUpForm next={next} />}
      {mode === "reset" && <ResetRequestForm onBack={() => setMode("sign-in")} />}
    </div>
  );
}

function SignInForm({ next, onForgot }: { next: string; onForgot: () => void }) {
  const [state, formAction, pending] = useFormAction(signInAction);
  const { m } = useI18n();
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
        label={m.login.email}
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
        label={m.login.password}
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldError(state, "password")}
        disabled={locked}
        required
      />
      <button type="button" onClick={onForgot} className="-mt-2 text-sm font-bold text-teal-strong underline">
        {m.login.reset.link}
      </button>
      {state.status === "error" && state.message && <Alert>{state.message}</Alert>}
      <Button type="submit" className="w-full" pending={locked} pendingLabel={pending ? m.login.signingIn : m.login.redirecting}>
        {m.login.submitSignIn}
      </Button>
    </form>
  );
}

/** "Forgot password": the e-mail with a link to /reset-password. */
function ResetRequestForm({ onBack }: { onBack: () => void }) {
  const [state, formAction, pending] = useFormAction(requestPasswordResetAction);
  const { m } = useI18n();
  const [email, setEmail] = useState("");
  const back = (
    <button type="button" onClick={onBack} className="text-sm font-bold text-teal-strong underline">
      {m.login.reset.back}
    </button>
  );

  if (state.status === "success") {
    return (
      <div className="mt-6 space-y-4">
        <Alert tone="success">{state.message}</Alert>
        {back}
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-5" noValidate>
      <p className="text-ink-muted">{m.login.reset.lead}</p>
      <TextField
        id="reset-email"
        name="email"
        type="email"
        label={m.login.email}
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fieldError(state, "email")}
        disabled={pending}
        required
      />
      {state.status === "error" && state.message && <Alert>{state.message}</Alert>}
      <Button type="submit" className="w-full" pending={pending} pendingLabel={m.login.reset.sending}>
        {m.login.reset.submit}
      </Button>
      {back}
    </form>
  );
}

function SignUpForm({ next }: { next: string }) {
  const [state, formAction, pending] = useFormAction(signUpAction);
  const { m } = useI18n();
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
        label={m.login.name}
        hint={m.login.nameHint}
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
        label={m.login.email}
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
        label={m.login.password}
        hint={m.login.passwordHint}
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
        pendingLabel={pending ? m.login.signingUp : m.login.redirecting}
      >
        {m.login.submitSignUp}
      </Button>
    </form>
  );
}
