import type { TaskType } from "@/lib/race/lobby";
import { LIMITS, cleanText, validateCheckpointTitle } from "@/lib/race/validation";

/*
 * Route + task drafts from the /create form. The form posts them as JSON; this
 * module is the server-side gate before create_race(), which validates the
 * same rules again in the database (private.insert_tasks).
 */

export const TASK_LIMITS = {
  question: { min: 1, max: 500 },
  options: { min: 2, max: 6 },
  option: { min: 1, max: 200 },
  answer: { min: 1, max: 200 },
} as const;

export type TaskInput =
  | { type: "single_choice"; question: string; options: string[]; correctOption: number }
  | { type: "short_answer"; question: string; correctAnswer: string };

export type RouteInput = { titles: string[]; tasks: TaskInput[] };

export type RouteDraftError = `checkpoint-${number}` | `question-${number}` | `options-${number}` | `answer-${number}`;

export type RouteDraftResult =
  | { ok: true; value: RouteInput }
  | { ok: false; error?: string; fieldErrors: Partial<Record<RouteDraftError, string>> };

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  single_choice: "Выбор ответа",
  short_answer: "Короткий ответ",
};

const length = (value: string) => [...value].length;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Same rules as the database: trimmed, CRLF → LF, 1–500 characters. */
export function cleanQuestion(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

/**
 * Parses and validates `[{ title, task }]` posted by the route editor.
 * Every checkpoint needs a task (MVP: one mandatory task per checkpoint).
 */
export function parseRouteDraft(raw: unknown): RouteDraftResult {
  const { min, max } = LIMITS.route;
  if (!Array.isArray(raw)) return { ok: false, error: "Не удалось прочитать маршрут. Обновите страницу.", fieldErrors: {} };
  if (raw.length < min) return { ok: false, error: "Добавьте хотя бы один чекпоинт.", fieldErrors: {} };
  if (raw.length > max) return { ok: false, error: `Максимум ${max} чекпоинтов.`, fieldErrors: {} };

  const fieldErrors: Partial<Record<RouteDraftError, string>> = {};
  const titles: string[] = [];
  const tasks: TaskInput[] = [];

  raw.forEach((item, index) => {
    const entry = isRecord(item) ? item : {};
    const title = validateCheckpointTitle(typeof entry.title === "string" ? entry.title : "");
    if (!title.ok) fieldErrors[`checkpoint-${index}`] = title.error;
    titles.push(title.ok ? title.value : "");

    const task = isRecord(entry.task) ? entry.task : {};
    const question = cleanQuestion(typeof task.question === "string" ? task.question : "");
    if (length(question) < TASK_LIMITS.question.min) fieldErrors[`question-${index}`] = "Введите вопрос.";
    else if (length(question) > TASK_LIMITS.question.max) {
      fieldErrors[`question-${index}`] = `Вопрос — максимум ${TASK_LIMITS.question.max} символов.`;
    }

    if (task.type === "single_choice") {
      const options = Array.isArray(task.options) ? task.options.map((o) => (typeof o === "string" ? cleanText(o) : "")) : [];
      const correct = task.correctOption;
      if (options.length < TASK_LIMITS.options.min || options.length > TASK_LIMITS.options.max) {
        fieldErrors[`options-${index}`] = `Нужно от ${TASK_LIMITS.options.min} до ${TASK_LIMITS.options.max} вариантов.`;
      } else if (options.some((option) => length(option) < TASK_LIMITS.option.min)) {
        fieldErrors[`options-${index}`] = "Заполните все варианты ответа.";
      } else if (options.some((option) => length(option) > TASK_LIMITS.option.max)) {
        fieldErrors[`options-${index}`] = `Вариант ответа — максимум ${TASK_LIMITS.option.max} символов.`;
      } else if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
        fieldErrors[`options-${index}`] = "Варианты ответа не должны повторяться.";
      } else if (!Number.isInteger(correct) || (correct as number) < 0 || (correct as number) >= options.length) {
        fieldErrors[`answer-${index}`] = "Отметьте правильный вариант.";
      }
      tasks.push({ type: "single_choice", question, options, correctOption: Number(correct) });
    } else if (task.type === "short_answer") {
      const answer = cleanText(typeof task.correctAnswer === "string" ? task.correctAnswer : "");
      if (length(answer) < TASK_LIMITS.answer.min) fieldErrors[`answer-${index}`] = "Введите правильный ответ.";
      else if (length(answer) > TASK_LIMITS.answer.max) {
        fieldErrors[`answer-${index}`] = `Ответ — максимум ${TASK_LIMITS.answer.max} символов.`;
      }
      tasks.push({ type: "short_answer", question, correctAnswer: answer });
    } else {
      fieldErrors[`question-${index}`] = "Выберите тип задания.";
    }
  });

  return Object.keys(fieldErrors).length > 0 ? { ok: false, fieldErrors } : { ok: true, value: { titles, tasks } };
}

/** Client-side check of a single answer before sending it. */
export function isAnswerReady(type: TaskType, value: string): boolean {
  const answer = value.trim();
  if (type === "single_choice") return /^[0-5]$/.test(answer);
  return answer.length > 0 && length(answer) <= TASK_LIMITS.answer.max;
}
