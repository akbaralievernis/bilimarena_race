import type { Messages } from "./config";

/*
 * Dates and times without the runtime's locale data: Node on the server and a
 * phone's browser do not always know Kyrgyz the same way (a server rendered
 * "7 октября", the browser "7-октябрь" and hydration failed). Numbers come
 * from a fixed en-GB 24-hour format; month names come from the dictionary.
 */

type Parts = { day: number; month: number; year: string; hour: string; minute: string; second: string };

function parts(value: string | Date, timeZone?: string): Parts {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    formatter.formatToParts(new Date(value)).find((part) => part.type === type)?.value ?? "";
  return {
    day: Number(get("day")),
    month: Number(get("month")),
    year: get("year"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** "15:00:30" — the same in every language. */
export function clockTime(value: string | Date, timeZone?: string): string {
  const p = parts(value, timeZone);
  return `${p.hour}:${p.minute}:${p.second}`;
}

/** "7 октября в 15:00" / "7-октябрь, 15:00". */
export function dayAndTime(value: string | Date, m: Messages, timeZone?: string): string {
  const p = parts(value, timeZone);
  return m.dates.dayTime(p.day, m.dates.months[p.month - 1], `${p.hour}:${p.minute}`);
}

/** "07.10.2026 15:00:30" — for CSV cells, which spreadsheets parse as a date. */
export function stamp(value: string | Date, timeZone?: string): string {
  const p = parts(value, timeZone);
  return `${String(p.day).padStart(2, "0")}.${String(p.month).padStart(2, "0")}.${p.year} ${p.hour}:${p.minute}:${p.second}`;
}
