import { describe, expect, it } from "vitest";
import { serializeRoute, draftItem } from "@/app/create/route-editor";
import { parseLobby } from "@/lib/race/lobby";
import { cleanQuestion, isAnswerReady, parseRouteDraft } from "@/lib/race/tasks";

const choice = (extra: object = {}) => ({
  title: "Дроби",
  task: { type: "single_choice", question: "1/2 + 1/2 = ?", options: ["1", "2"], correctOption: 0, ...extra },
});
const short = (extra: object = {}) => ({
  title: "Столицы",
  task: { type: "short_answer", question: "Столица?", correctAnswer: "Бишкек", ...extra },
});

describe("parseRouteDraft", () => {
  it("accepts a route where every checkpoint has a task", () => {
    expect(parseRouteDraft([choice(), short({ correctAnswer: "  Бишкек  " })])).toEqual({
      ok: true,
      value: {
        titles: ["Дроби", "Столицы"],
        tasks: [
          { type: "single_choice", question: "1/2 + 1/2 = ?", options: ["1", "2"], correctOption: 0 },
          { type: "short_answer", question: "Столица?", correctAnswer: "Бишкек" },
        ],
      },
    });
  });

  it("rejects malformed input and wrong route sizes", () => {
    expect(parseRouteDraft(null)).toMatchObject({ ok: false });
    expect(parseRouteDraft([])).toMatchObject({ ok: false, error: "Добавьте хотя бы один чекпоинт." });
    expect(parseRouteDraft(Array.from({ length: 21 }, () => short()))).toMatchObject({ ok: false, error: "Максимум 20 чекпоинтов." });
  });

  it("points at the exact field of the exact checkpoint", () => {
    const result = parseRouteDraft([
      choice(),
      short({ question: "   " }),
      choice({ options: ["один"] }),
      choice({ options: ["a", ""] }),
      choice({ options: ["Да", "да"] }),
      choice({ correctOption: -1 }),
      short({ correctAnswer: "" }),
      { title: "", task: { type: "essay", question: "?" } },
      choice({ question: "x".repeat(501) }),
    ]);
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        "question-1": "Введите вопрос.",
        "options-2": "Нужно от 2 до 6 вариантов.",
        "options-3": "Заполните все варианты ответа.",
        "options-4": "Варианты ответа не должны повторяться.",
        "answer-5": "Отметьте правильный вариант.",
        "answer-6": "Введите правильный ответ.",
        "checkpoint-7": "Введите название чекпоинта.",
        "question-7": "Выберите тип задания.",
        "question-8": "Вопрос — максимум 500 символов.",
      },
    });
  });

  it("keeps line breaks in questions and normalizes CRLF", () => {
    expect(cleanQuestion("  Код:\r\nx = 1\r\n ")).toBe("Код:\nx = 1");
  });
});

describe("route editor serialization", () => {
  it("posts the index of the marked option, or -1 when none is marked", () => {
    const item = draftItem("c1");
    item.title = "Дроби";
    item.task.question = "?";
    item.task.options = [
      { id: "a", text: "1" },
      { id: "b", text: "2" },
    ];
    expect(serializeRoute([item])[0].task).toEqual({ type: "single_choice", question: "?", options: ["1", "2"], correctOption: -1 });
    item.task.correctOptionId = "b";
    expect(serializeRoute([item])[0].task).toMatchObject({ correctOption: 1 });
    expect(parseRouteDraft(serializeRoute([item]))).toMatchObject({ ok: true });
  });
});

describe("answers", () => {
  it("knows when an answer can be sent", () => {
    expect(isAnswerReady("single_choice", "2")).toBe(true);
    expect(isAnswerReady("single_choice", "")).toBe(false);
    expect(isAnswerReady("single_choice", "9")).toBe(false);
    expect(isAnswerReady("short_answer", "  ")).toBe(false);
    expect(isAnswerReady("short_answer", "Бишкек")).toBe(true);
    expect(isAnswerReady("short_answer", "x".repeat(201))).toBe(false);
  });
});

describe("parseLobby with tasks", () => {
  const base = {
    race: { id: "r", code: "A7K9Q2", title: "Гонка", description: null, status: "running", startedAt: null, finishedAt: null },
    viewer: { role: "student", participantId: "p", displayName: "Эрнис", teamId: "t" },
    route: [
      { position: 0, title: "Старт", type: "start", hasTask: false, task: null },
      { position: 1, title: "Дроби", type: "checkpoint", hasTask: true, task: null },
      { position: 2, title: "Финиш", type: "finish", hasTask: false, task: null },
    ],
    currentTask: { id: "k", checkpointPosition: 1, type: "single_choice", question: "?", options: ["1", "2"], cooldownSeconds: 0 },
    teams: [{ id: "t", name: "Альфа", memberCount: 1, position: 0, score: 0, place: 1, finishOrder: null, stats: null }],
    participants: [],
    studentCount: 1,
  };

  it("keeps the current task and teacher statistics", () => {
    expect(parseLobby(base).currentTask).toEqual(base.currentTask);
    const teacher = parseLobby({
      ...base,
      currentTask: null,
      teams: [{ ...base.teams[0], stats: { correct: 2, wrong: 1, finishedAt: "2026-09-29T10:00:00Z" } }],
      route: base.route.map((point) => (point.hasTask ? { ...point, task: { type: "short_answer", question: "?" } } : point)),
    });
    expect(teacher.teams[0].stats).toEqual({ correct: 2, wrong: 1, finishedAt: "2026-09-29T10:00:00Z" });
    expect(teacher.route[1].task).toEqual({ type: "short_answer", question: "?" });
  });

  it("drops anything that is not part of the contract, e.g. an answer key", () => {
    const leaked = { ...base, currentTask: { ...base.currentTask, correctOption: 1 } };
    expect(parseLobby(leaked).currentTask).not.toHaveProperty("correctOption");
  });

  it("still reads a Stage 2 payload (database not migrated yet) as a race without tasks", () => {
    const stage2 = {
      ...base,
      currentTask: undefined,
      route: base.route.map((point) => ({ position: point.position, title: point.title, type: point.type })),
      teams: [{ id: "t", name: "Альфа", memberCount: 1, position: 0 }],
    };
    const lobby = parseLobby(stage2);
    expect(lobby.route.every((point) => !point.hasTask && point.task === null)).toBe(true);
    expect(lobby.currentTask).toBeNull();
    expect(lobby.teams[0].stats).toBeNull();
    expect(() => parseLobby({ ...stage2, route: [{ ...stage2.route[0], hasTask: "yes" }] })).toThrow();
  });

  it("rejects inconsistent tasks", () => {
    expect(() => parseLobby({ ...base, currentTask: { ...base.currentTask, options: null } })).toThrow();
    expect(() => parseLobby({ ...base, currentTask: { ...base.currentTask, type: "essay" } })).toThrow();
    expect(() => parseLobby({ ...base, teams: [{ ...base.teams[0], stats: { correct: -1, wrong: 0, finishedAt: null } }] })).toThrow();
  });
});
