"use client";

import { useState } from "react";
import { fieldError, useFormAction } from "@/components/forms/use-form-action";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { LIMITS } from "@/lib/race/validation";
import { createRaceAction } from "./actions";
import { RouteEditor, type RouteDraftItem } from "./route-editor";

const INITIAL_ROUTE: RouteDraftItem[] = [
  { id: "checkpoint-0", title: "" },
  { id: "checkpoint-1", title: "" },
  { id: "checkpoint-2", title: "" },
];

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
      <RouteEditor
        items={route}
        onChange={setRoute}
        itemError={(index) => fieldError(state, `checkpoint-${index}`)}
        error={fieldError(state, "route")}
        disabled={locked}
      />
      {state.status === "error" && state.message && <Alert>{state.message}</Alert>}
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
