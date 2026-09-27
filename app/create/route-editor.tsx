"use client";

import { useRef, useState } from "react";
import { LIMITS } from "@/lib/race/validation";

export type RouteDraftItem = { id: string; title: string };

type RouteEditorProps = {
  items: RouteDraftItem[];
  onChange: (items: RouteDraftItem[]) => void;
  itemError: (index: number) => string | undefined;
  error?: string;
  disabled: boolean;
};

const iconButton =
  "flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-muted ring-1 ring-line transition " +
  "hover:bg-brand-soft hover:text-brand-strong hover:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-40 " +
  "disabled:hover:bg-transparent disabled:hover:text-ink-muted";

function Arrow({ up }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4">
      <path
        d={up ? "M10 15V5m-4.5 4.5L10 5l4.5 4.5" : "M10 5v10m4.5-4.5L10 15l-4.5-4.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FixedPoint({ label, tone }: { label: string; tone: "start" | "finish" }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-canvas px-3 py-2.5 ring-1 ring-line">
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
          tone === "start" ? "bg-teal-soft text-teal-strong" : "bg-ink text-white"
        }`}
        aria-hidden="true"
      >
        {tone === "start" ? "С" : "Ф"}
      </span>
      <span className="text-sm font-bold text-ink-muted">{label}</span>
    </li>
  );
}

/**
 * Checkpoints between START and FINISH: add, rename, reorder (↑ ↓), remove.
 * Inputs are named "checkpoint", so the form submits titles in route order.
 */
export function RouteEditor({ items, onChange, itemError, error, disabled }: RouteEditorProps) {
  const [nextId, setNextId] = useState(items.length);
  const focusId = useRef<string | null>(null);
  const { min, max } = LIMITS.route;

  function add() {
    const id = `checkpoint-${nextId}`;
    setNextId((value) => value + 1);
    focusId.current = id;
    onChange([...items, { id, title: "" }]);
  }

  function move(index: number, delta: -1 | 1) {
    const next = [...items];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  }

  return (
    <fieldset disabled={disabled} aria-describedby="route-hint" className="min-w-0">
      <legend className="text-sm font-bold">Маршрут</legend>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <p id="route-hint" className="text-sm text-ink-muted">
          Команды пройдут чекпоинты строго по порядку — от старта до финиша.
        </p>
        <span className="shrink-0 text-sm text-ink-muted">
          {items.length} / {max}
        </span>
      </div>

      <ol className="mt-3 space-y-2">
        <FixedPoint label="Старт" tone="start" />
        {items.map((item, index) => {
          const inputId = `route-${item.id}`;
          const message = itemError(index);
          const controls = (
            <>
              <button
                type="button"
                className={iconButton}
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`Поднять чекпоинт ${index + 1}`}
              >
                <Arrow up />
              </button>
              <button
                type="button"
                className={iconButton}
                onClick={() => move(index, 1)}
                disabled={index === items.length - 1}
                aria-label={`Опустить чекпоинт ${index + 1}`}
              >
                <Arrow />
              </button>
              <button
                type="button"
                className={`${iconButton} hover:text-danger`}
                onClick={() => onChange(items.filter((other) => other.id !== item.id))}
                disabled={items.length <= min}
                aria-label={`Удалить чекпоинт ${index + 1}`}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4">
                  <path d="M6 6l8 8m0-8l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </>
          );
          return (
            <li key={item.id} className="rounded-2xl p-2 ring-1 ring-line">
              <div className="flex items-center gap-2">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand-strong"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <label htmlFor={inputId} className="sr-only">
                  Название чекпоинта {index + 1}
                </label>
                <input
                  id={inputId}
                  name="checkpoint"
                  ref={(element) => {
                    if (element && focusId.current === item.id) {
                      element.focus();
                      focusId.current = null;
                    }
                  }}
                  value={item.title}
                  onChange={(event) =>
                    onChange(items.map((other) => (other.id === item.id ? { ...other, title: event.target.value } : other)))
                  }
                  placeholder={`Чекпоинт ${index + 1}`}
                  maxLength={LIMITS.checkpointTitle.max}
                  autoComplete="off"
                  aria-invalid={message ? true : undefined}
                  aria-describedby={message ? `${inputId}-error` : undefined}
                  className="min-h-10 w-full min-w-0 flex-1 rounded-xl bg-surface px-3 text-base ring-1 ring-line transition placeholder:text-ink-muted/70 hover:ring-brand/40 focus:ring-2 focus:ring-brand focus:outline-none aria-invalid:ring-2 aria-invalid:ring-danger"
                />
                <div className="hidden gap-2 sm:flex">{controls}</div>
              </div>
              {/* Phones: controls on their own row so the title field stays wide. */}
              <div className="mt-2 flex justify-end gap-2 sm:hidden">{controls}</div>
              {message && (
                <p id={`${inputId}-error`} className="mt-1.5 px-1 text-sm font-semibold text-danger">
                  {message}
                </p>
              )}
            </li>
          );
        })}
        <FixedPoint label="Финиш" tone="finish" />
      </ol>

      {error && <p className="mt-2 text-sm font-semibold text-danger">{error}</p>}

      <button
        type="button"
        onClick={add}
        disabled={items.length >= max}
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-bold text-brand-strong ring-1 ring-brand/30 transition hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4">
          <path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {items.length >= max ? `Максимум ${max} чекпоинтов` : "Добавить чекпоинт"}
      </button>
    </fieldset>
  );
}
