import { describe, expect, it } from "vitest";
import { draftFromRow, serializeRoute } from "@/app/create/route-editor";
import { exampleTable } from "@/lib/i18n/messages/ru";
import { parseQuestions, parseTable, shuffled } from "@/lib/race/import";
import { parseRouteDraft } from "@/lib/race/tasks";

const TAB = String.fromCharCode(9);
const NL = String.fromCharCode(10);

describe("parseTable", () => {
  it("reads cells copied from Excel or Google Sheets (tabs, quoted cells with line breaks)", () => {
    const text = `Дроби${TAB}"Сколько будет${NL}1/2 + 1/4?"${TAB}3/4${NL}Столица${TAB}"Город ""Бишкек"""${TAB}Бишкек`;
    expect(parseTable(text)).toEqual([
      ["Дроби", `Сколько будет${NL}1/2 + 1/4?`, "3/4"],
      ["Столица", 'Город "Бишкек"', "Бишкек"],
    ]);
  });

  it("reads a saved CSV with ; (Excel in Russian or Kyrgyz) or ,", () => {
    expect(parseTable("A;Вопрос 1;Да\r\nB;Вопрос 2;Нет")).toEqual([
      ["A", "Вопрос 1", "Да"],
      ["B", "Вопрос 2", "Нет"],
    ]);
    expect(parseTable("A,Q,Yes")).toEqual([["A", "Q", "Yes"]]);
  });
});

describe("parseQuestions", () => {
  it("skips a header row and empty lines, reports rows without a question or an answer", () => {
    const text = exampleTable([
      ["Чекпоинт", "Вопрос", "Правильный ответ", "Неверный"],
      ["Дроби", "1/2 + 1/4?", "3/4", "2/6", "1/8"],
      [""],
      ["Без ответа", "Вопрос?", ""],
      ["", "Столица Кыргызстана?", "Бишкек"],
    ]);
    expect(parseQuestions(text)).toEqual({
      rows: [
        { title: "Дроби", question: "1/2 + 1/4?", answer: "3/4", wrong: ["2/6", "1/8"] },
        { title: "", question: "Столица Кыргызстана?", answer: "Бишкек", wrong: [] },
      ],
      skipped: [4],
    });
  });

  it("keeps at most 5 wrong options (6 options in a task)", () => {
    const { rows } = parseQuestions(exampleTable([["A", "Q?", "1", "2", "3", "4", "5", "6", "7"]]));
    expect(rows[0].wrong).toEqual(["2", "3", "4", "5", "6"]);
  });
});

describe("rows become route items", () => {
  const fixed = () => 0.99; // Fisher–Yates with 0.99 keeps the order

  it("a row with wrong options is a choice; the right option is marked wherever it lands", () => {
    const item = draftFromRow({ title: "Дроби", question: "1/2 + 1/4?", answer: "3/4", wrong: ["2/6", "1/8"] }, "c1", "Чекпоинт 1", () => 0);
    expect(item.task.type).toBe("single_choice");
    const texts = item.task.options.map((option) => option.text);
    expect(texts.sort()).toEqual(["1/8", "2/6", "3/4"]);
    expect(item.task.options.find((option) => option.id === item.task.correctOptionId)?.text).toBe("3/4");
  });

  it("a row without wrong options is a short answer; an empty title gets a default", () => {
    const item = draftFromRow({ title: "", question: "Столица?", answer: "Бишкек", wrong: [] }, "c2", "Чекпоинт 2", fixed);
    expect(item).toMatchObject({ title: "Чекпоинт 2", task: { type: "short_answer", question: "Столица?", correctAnswer: "Бишкек" } });
  });

  it("what the editor posts passes the server-side validation", () => {
    const items = [
      draftFromRow({ title: "Дроби", question: "1/2 + 1/4?", answer: "3/4", wrong: ["2/6"] }, "c1", "Чекпоинт 1", fixed),
      draftFromRow({ title: "Столица", question: "Столица?", answer: "Бишкек", wrong: [] }, "c2", "Чекпоинт 2", fixed),
    ];
    const parsed = parseRouteDraft(serializeRoute(items));
    expect(parsed).toEqual({
      ok: true,
      value: {
        titles: ["Дроби", "Столица"],
        tasks: [
          { type: "single_choice", question: "1/2 + 1/4?", options: ["3/4", "2/6"], correctOption: 0 },
          { type: "short_answer", question: "Столица?", correctAnswer: "Бишкек" },
        ],
      },
    });
  });

  it("shuffle keeps every item exactly once", () => {
    const items = ["a", "b", "c", "d", "e", "f"];
    for (const value of [0, 0.3, 0.7, 0.99]) {
      expect([...shuffled(items, () => value)].sort()).toEqual(items);
    }
  });
});
