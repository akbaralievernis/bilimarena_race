import { TASK_LIMITS, cleanQuestion } from "@/lib/race/tasks";

/*
 * Stage 9: questions pasted from Excel or Google Sheets into the route editor.
 * Copying cells gives tab-separated text (quoted where a cell holds a tab, a
 * quote or a line break); a saved .csv file uses ";" (Excel in ru/ky locales)
 * or ",". Columns, in this order:
 *
 *   checkpoint title | question | correct answer | wrong option | wrong option …
 *
 * With wrong options the task becomes a choice, without them a short answer.
 * The editor and then the server validate every value as usual.
 */

export type ImportedRow = { title: string; question: string; answer: string; wrong: string[] };
/** `skipped`: 1-based line numbers of rows without a question or an answer. */
export type ImportResult = { rows: ImportedRow[]; skipped: number[] };

const HEADER_WORDS = new Set(["вопрос", "суроо", "question", "ответ", "жооп", "answer", "правильный ответ", "туура жооп"]);

function delimiterOf(text: string): string {
  if (text.includes("\t")) return "\t";
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.includes(";") ? ";" : ",";
}

/** Rows of cells; understands quoted cells with "" escapes and line breaks inside. */
export function parseTable(text: string): string[][] {
  const delimiter = delimiterOf(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const clean = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

export function parseQuestions(text: string): ImportResult {
  const table = parseTable(text);
  const result: ImportResult = { rows: [], skipped: [] };

  table.forEach((cells, index) => {
    if (cells.every((value) => clean(value) === "")) return;
    // A header row ("Чекпоинт | Вопрос | Ответ …") is skipped quietly.
    if (index === 0 && (HEADER_WORDS.has(clean(cells[1]).toLowerCase()) || HEADER_WORDS.has(clean(cells[2]).toLowerCase()))) {
      return;
    }
    const [title, , answer, ...rest] = cells.map(clean);
    // A question may span lines (Alt+Enter in a cell); keep them like the editor does.
    const question = cleanQuestion(cells[1] ?? "");
    if (!question || !answer) {
      result.skipped.push(index + 1);
      return;
    }
    const wrong = rest.filter(Boolean).slice(0, TASK_LIMITS.options.max - 1);
    result.rows.push({ title: title ?? "", question, answer, wrong });
  });

  return result;
}

/** Fisher–Yates with an injectable random source (tests pass a fixed one). */
export function shuffled<T>(items: T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}
