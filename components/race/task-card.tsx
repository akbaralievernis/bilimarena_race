"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { CurrentTask, RoutePoint } from "@/lib/race/lobby";
import { pointLabel } from "@/lib/race/route";
import { TASK_LIMITS, isAnswerReady } from "@/lib/race/tasks";

/**
 * Seconds left of the pause after a wrong answer. The database sends the value
 * with every lobby snapshot (a new `task` object each time), so the countdown
 * restarts from the server's number after any refresh — also when a teammate
 * answered wrong on another phone. The database enforces the pause anyway.
 */
function usePause(task: CurrentTask): number {
  const [pause, setPause] = useState({ task, left: task.cooldownSeconds });
  if (pause.task !== task) setPause({ task, left: task.cooldownSeconds });

  useEffect(() => {
    if (pause.left <= 0) return;
    const timer = setTimeout(() => setPause((current) => ({ ...current, left: current.left - 1 })), 1000);
    return () => clearTimeout(timer);
  }, [pause.left]);

  return Math.max(0, pause.left);
}

/**
 * The task of the team's next checkpoint. Keyed by task id in the parent, so
 * a new task starts with an empty form; a wrong answer keeps the input.
 */
export function TaskCard({
  task,
  point,
  pending,
  onSubmit,
}: {
  task: CurrentTask;
  point: RoutePoint;
  pending: boolean;
  onSubmit: (answer: string) => void;
}) {
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState("");
  const answer = task.type === "single_choice" ? (choice === null ? "" : String(choice)) : text;
  const ready = isAnswerReady(task.type, answer);
  const pause = usePause(task);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ready && !pending && pause === 0) onSubmit(answer);
  }

  return (
    <form onSubmit={submit} className="animate-pop-in mt-4 rounded-2xl bg-brand-soft/60 p-4 ring-1 ring-brand/20 sm:p-5" noValidate>
      <p className="text-xs font-extrabold tracking-wider text-brand-strong uppercase">
        {pointLabel(point)} · задание
      </p>
      <p className="mt-0.5 font-bold break-words">{point.title}</p>
      <p id={`question-${task.id}`} className="mt-3 text-lg leading-snug font-semibold whitespace-pre-line break-words">
        {task.question}
      </p>

      {task.type === "single_choice" && task.options ? (
        <fieldset className="mt-4" aria-describedby={`question-${task.id}`} disabled={pending}>
          <legend className="sr-only">Варианты ответа</legend>
          <div className="space-y-2">
            {task.options.map((option, index) => (
              <label
                key={index}
                className={`flex cursor-pointer items-center gap-3 rounded-xl bg-surface px-4 py-3 ring-1 transition has-focus-visible:ring-2 has-focus-visible:ring-brand ${
                  choice === index ? "ring-2 ring-brand" : "ring-line hover:ring-brand/40"
                }`}
              >
                <input
                  type="radio"
                  name={`answer-${task.id}`}
                  checked={choice === index}
                  onChange={() => setChoice(index)}
                  className="size-5 shrink-0 accent-brand"
                />
                <span className="min-w-0 font-semibold break-words">{option}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <div className="mt-4">
          <label htmlFor={`answer-${task.id}`} className="block text-sm font-semibold text-ink-muted">
            Ваш ответ
          </label>
          <input
            id={`answer-${task.id}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={TASK_LIMITS.answer.max}
            autoComplete="off"
            disabled={pending}
            aria-describedby={`question-${task.id}`}
            className="mt-1.5 min-h-12 w-full rounded-xl bg-surface px-4 text-base ring-1 ring-line transition hover:ring-brand/40 focus:ring-2 focus:ring-brand focus:outline-none disabled:bg-canvas"
          />
        </div>
      )}

      {pause > 0 && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-2.5 text-sm font-semibold text-danger">
          <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4 shrink-0">
            <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M10 6v4.5l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Пауза после неверного ответа: ещё {pause} с
        </p>
      )}

      <Button type="submit" className="mt-4 w-full" disabled={!ready || pause > 0} pending={pending} pendingLabel="Проверяем…">
        {pause > 0 ? `Подождите ${pause} с` : "Ответить"}
      </Button>
    </form>
  );
}
