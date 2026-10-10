"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import type { TaskType } from "@/lib/race/lobby";
import { TASK_LIMITS } from "@/lib/race/tasks";
import { LIMITS } from "@/lib/race/validation";

export type OptionDraft = { id: string; text: string };
export type TaskDraft = {
  type: TaskType;
  question: string;
  options: OptionDraft[];
  correctOptionId: string | null;
  correctAnswer: string;
};
export type RouteDraftItem = { id: string; title: string; task: TaskDraft };

/** Deterministic ids for the first render (server and client must agree). */
export function draftItem(id: string): RouteDraftItem {
  return {
    id,
    title: "",
    task: {
      type: "single_choice",
      question: "",
      options: [
        { id: `${id}-o0`, text: "" },
        { id: `${id}-o1`, text: "" },
      ],
      correctOptionId: null,
      correctAnswer: "",
    },
  };
}

/** What the form posts (hidden "route" field): titles and tasks in route order. */
export function serializeRoute(items: RouteDraftItem[]) {
  return items.map(({ title, task }) => ({
    title,
    task:
      task.type === "single_choice"
        ? {
            type: task.type,
            question: task.question,
            options: task.options.map((option) => option.text),
            correctOption: task.options.findIndex((option) => option.id === task.correctOptionId),
          }
        : { type: task.type, question: task.question, correctAnswer: task.correctAnswer },
  }));
}

type FieldError = (key: string) => string | undefined;

const control =
  "w-full min-w-0 rounded-xl bg-surface px-3 text-base ring-1 ring-line transition placeholder:text-ink-muted/70 " +
  "hover:ring-brand/40 focus:ring-2 focus:ring-brand focus:outline-none aria-invalid:ring-2 aria-invalid:ring-danger";

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

function Cross() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4">
      <path d="M6 6l8 8m0-8l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ErrorText({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm font-semibold text-danger">
      {message}
    </p>
  );
}

function FixedPoint({ label, tone }: { label: string; tone: "start" | "finish" }) {
  const { m } = useI18n();
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-canvas px-3 py-2.5 ring-1 ring-line">
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
          tone === "start" ? "bg-teal-soft text-teal-strong" : "bg-ink text-white"
        }`}
        aria-hidden="true"
      >
        {tone === "start" ? m.common.startLetter : m.common.finishLetter}
      </span>
      <span className="text-sm font-bold text-ink-muted">{label}</span>
    </li>
  );
}

function TaskEditor({
  item,
  index,
  onChange,
  makeId,
  fieldError,
}: {
  item: RouteDraftItem;
  index: number;
  onChange: (task: TaskDraft) => void;
  makeId: () => string;
  fieldError: FieldError;
}) {
  const { task } = item;
  const { m } = useI18n();
  const questionId = `question-${item.id}`;
  const answerId = `answer-${item.id}`;
  const questionError = fieldError(`question-${index}`);
  const optionsError = fieldError(`options-${index}`);
  const answerError = fieldError(`answer-${index}`);
  const set = (patch: Partial<TaskDraft>) => onChange({ ...task, ...patch });

  return (
    <div className="mt-3 rounded-xl bg-canvas p-3 ring-1 ring-line">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold">{m.route.task}</p>
        <div role="group" aria-label={m.route.taskType(index + 1)} className="flex gap-1 rounded-xl bg-surface p-1 ring-1 ring-line">
          {(["single_choice", "short_answer"] as const).map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={task.type === type}
              onClick={() => set({ type })}
              className={`min-h-9 rounded-lg px-3 text-sm font-bold transition ${
                task.type === type ? "bg-brand text-white" : "text-ink-muted hover:text-ink"
              }`}
            >
              {m.route.taskTypes[type]}
            </button>
          ))}
        </div>
      </div>

      <label htmlFor={questionId} className="mt-3 block text-sm font-semibold text-ink-muted">
        {m.route.question}
      </label>
      <textarea
        id={questionId}
        value={task.question}
        onChange={(event) => set({ question: event.target.value })}
        maxLength={TASK_LIMITS.question.max}
        rows={2}
        placeholder={m.route.questionPlaceholder}
        aria-invalid={questionError ? true : undefined}
        aria-describedby={questionError ? `${questionId}-error` : undefined}
        className={`${control} mt-1.5 min-h-16 resize-y py-2`}
      />
      <ErrorText id={`${questionId}-error`} message={questionError} />

      {task.type === "single_choice" ? (
        <fieldset className="mt-3 min-w-0">
          <legend className="text-sm font-semibold text-ink-muted">{m.route.optionsLegend}</legend>
          <ul className="mt-1.5 space-y-2">
            {task.options.map((option, optionIndex) => {
              const inputId = `option-${option.id}`;
              return (
                <li key={option.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${item.id}`}
                    checked={task.correctOptionId === option.id}
                    onChange={() => set({ correctOptionId: option.id })}
                    aria-label={m.route.optionCorrect(optionIndex + 1)}
                    className="size-5 shrink-0 accent-brand"
                  />
                  <label htmlFor={inputId} className="sr-only">
                    {m.route.option(optionIndex + 1)}
                  </label>
                  <input
                    id={inputId}
                    value={option.text}
                    onChange={(event) =>
                      set({
                        options: task.options.map((other) =>
                          other.id === option.id ? { ...other, text: event.target.value } : other,
                        ),
                      })
                    }
                    maxLength={TASK_LIMITS.option.max}
                    placeholder={m.route.option(optionIndex + 1)}
                    autoComplete="off"
                    className={`${control} min-h-10 flex-1`}
                  />
                  <button
                    type="button"
                    className={iconButton}
                    disabled={task.options.length <= TASK_LIMITS.options.min}
                    onClick={() =>
                      set({
                        options: task.options.filter((other) => other.id !== option.id),
                        correctOptionId: task.correctOptionId === option.id ? null : task.correctOptionId,
                      })
                    }
                    aria-label={m.route.removeOption(optionIndex + 1)}
                  >
                    <Cross />
                  </button>
                </li>
              );
            })}
          </ul>
          <ErrorText id={`options-${item.id}-error`} message={optionsError ?? answerError} />
          <button
            type="button"
            onClick={() => set({ options: [...task.options, { id: makeId(), text: "" }] })}
            disabled={task.options.length >= TASK_LIMITS.options.max}
            className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold text-brand-strong transition hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            {m.route.addOption}
          </button>
        </fieldset>
      ) : (
        <div className="mt-3">
          <label htmlFor={answerId} className="block text-sm font-semibold text-ink-muted">
            {m.route.answer}
          </label>
          <input
            id={answerId}
            value={task.correctAnswer}
            onChange={(event) => set({ correctAnswer: event.target.value })}
            maxLength={TASK_LIMITS.answer.max}
            autoComplete="off"
            aria-invalid={answerError ? true : undefined}
            aria-describedby={`${answerId}-hint`}
            className={`${control} mt-1.5 min-h-10`}
          />
          <p id={`${answerId}-hint`} className="mt-1 text-xs text-ink-muted">
            {m.route.answerHint}
          </p>
          <ErrorText id={`${answerId}-error`} message={answerError} />
        </div>
      )}
    </div>
  );
}

/**
 * Checkpoints between START and FINISH with one task each: add, rename,
 * reorder (↑ ↓), remove, and edit the task. The parent form posts
 * serializeRoute(items) as JSON; the server validates everything again.
 */
export function RouteEditor({
  items,
  onChange,
  fieldError,
  error,
  disabled,
}: {
  items: RouteDraftItem[];
  onChange: (items: RouteDraftItem[]) => void;
  fieldError: FieldError;
  error?: string;
  disabled: boolean;
}) {
  const { m } = useI18n();
  const [nextId, setNextId] = useState(items.length);
  const counter = useRef(0);
  const focusId = useRef<string | null>(null);
  const { min, max } = LIMITS.route;

  function makeId() {
    counter.current += 1;
    return `new-${counter.current}`;
  }

  function add() {
    const id = `checkpoint-${nextId}`;
    setNextId((value) => value + 1);
    focusId.current = id;
    onChange([...items, draftItem(id)]);
  }

  function move(index: number, delta: -1 | 1) {
    const next = [...items];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  }

  const update = (id: string, patch: Partial<RouteDraftItem>) =>
    onChange(items.map((other) => (other.id === id ? { ...other, ...patch } : other)));

  return (
    <fieldset disabled={disabled} aria-describedby="route-hint" className="min-w-0">
      <legend className="text-sm font-bold">{m.route.legend}</legend>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <p id="route-hint" className="text-sm text-ink-muted">
          {m.route.hint}
        </p>
        <span className="shrink-0 text-sm text-ink-muted">
          {items.length} / {max}
        </span>
      </div>

      <ol className="mt-3 space-y-2">
        <FixedPoint label={m.common.start} tone="start" />
        {items.map((item, index) => {
          const inputId = `route-${item.id}`;
          const titleError = fieldError(`checkpoint-${index}`);
          const controls = (
            <>
              <button
                type="button"
                className={iconButton}
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={m.route.moveUp(index + 1)}
              >
                <Arrow up />
              </button>
              <button
                type="button"
                className={iconButton}
                onClick={() => move(index, 1)}
                disabled={index === items.length - 1}
                aria-label={m.route.moveDown(index + 1)}
              >
                <Arrow />
              </button>
              <button
                type="button"
                className={`${iconButton} hover:text-danger`}
                onClick={() => onChange(items.filter((other) => other.id !== item.id))}
                disabled={items.length <= min}
                aria-label={m.route.remove(index + 1)}
              >
                <Cross />
              </button>
            </>
          );
          return (
            <li key={item.id} className="rounded-2xl p-2 ring-1 ring-line sm:p-3">
              <div className="flex items-center gap-2">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand-strong"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <label htmlFor={inputId} className="sr-only">
                  {m.route.checkpointTitle(index + 1)}
                </label>
                <input
                  id={inputId}
                  ref={(element) => {
                    if (element && focusId.current === item.id) {
                      element.focus();
                      focusId.current = null;
                    }
                  }}
                  value={item.title}
                  onChange={(event) => update(item.id, { title: event.target.value })}
                  placeholder={m.common.checkpoint(index + 1)}
                  maxLength={LIMITS.checkpointTitle.max}
                  autoComplete="off"
                  aria-invalid={titleError ? true : undefined}
                  aria-describedby={titleError ? `${inputId}-error` : undefined}
                  className={`${control} min-h-10 flex-1`}
                />
                <div className="hidden gap-2 sm:flex">{controls}</div>
              </div>
              {/* Phones: controls on their own row so the title field stays wide. */}
              <div className="mt-2 flex justify-end gap-2 sm:hidden">{controls}</div>
              <ErrorText id={`${inputId}-error`} message={titleError} />
              <TaskEditor
                item={item}
                index={index}
                onChange={(task) => update(item.id, { task })}
                makeId={makeId}
                fieldError={fieldError}
              />
            </li>
          );
        })}
        <FixedPoint label={m.common.finish} tone="finish" />
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
        {items.length >= max ? m.route.max(max) : m.route.add}
      </button>
    </fieldset>
  );
}
