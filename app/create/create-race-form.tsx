"use client";

import { useState } from "react";
import { fieldError, useFormAction } from "@/components/forms/use-form-action";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { LIMITS } from "@/lib/race/validation";
import { createRaceAction, type CreateRaceField } from "./actions";
import { RouteEditor, draftItem, serializeRoute } from "./route-editor";

const INITIAL_ROUTE = [draftItem("checkpoint-0"), draftItem("checkpoint-1"), draftItem("checkpoint-2")];

export function CreateRaceForm() {
  const [state, formAction, pending] = useFormAction(createRaceAction);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [route, setRoute] = useState(INITIAL_ROUTE);
  const locked = pending || (state.status === "success" && state.redirecting);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <TextField
        id="race-title"
        name="title"
        label="Название гонки"
        placeholder="Например, «Дроби — 6А»"
        maxLength={LIMITS.raceTitle.max}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        error={fieldError(state, "title")}
        disabled={locked}
        autoComplete="off"
        required
      />
      <TextAreaField
        id="race-description"
        name="description"
        label="Описание (необязательно)"
        hint={`Тема или правила — до ${LIMITS.raceDescription.max} символов.`}
        maxLength={LIMITS.raceDescription.max}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        error={fieldError(state, "description")}
        disabled={locked}
      />
      {/* Route and tasks travel as one JSON field; the server re-validates all of it. */}
      <input type="hidden" name="route" value={JSON.stringify(serializeRoute(route))} />
      <RouteEditor
        items={route}
        onChange={setRoute}
        fieldError={(key) => fieldError(state, key as CreateRaceField)}
        error={fieldError(state, "route")}
        disabled={locked}
      />
      {state.status === "error" && state.message && <Alert>{state.message}</Alert>}
      {state.status === "error" && !state.message && (
        <Alert>Проверьте отмеченные поля — у каждого чекпоинта должно быть заполненное задание.</Alert>
      )}
      <Button
        type="submit"
        className="w-full sm:w-auto"
        pending={locked}
        pendingLabel={pending ? "Создание…" : "Открываем лобби…"}
      >
        Создать гонку
      </Button>
    </form>
  );
}
