import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, MESSAGES, isLocale, toLocale } from "@/lib/i18n/config";
import { ky } from "@/lib/i18n/messages/ky";
import { ru } from "@/lib/i18n/messages/ru";
import { raceErrorMessage } from "@/lib/race/errors";
import { pointLabel } from "@/lib/race/route";
import { pointsWord, rulesSummary } from "@/lib/race/scoring";
import { minutesLabel } from "@/lib/race/timer";

/*
 * Stage 8: Kyrgyz and Russian. Both dictionaries must have the same shape,
 * nothing may be left untranslated by accident, and every error code the
 * database can raise needs a text in both languages.
 */

type Tree = Record<string, unknown>;

/** "a.b.c" → kind of the leaf: "string", "function", "array:N" or "object". */
function shape(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) {
      out[path] = `array:${value.length}`;
      value.forEach((item, index) => {
        if (item && typeof item === "object") Object.assign(out, shape(item as Tree, `${path}.${index}`));
      });
    } else if (value && typeof value === "object") Object.assign(out, shape(value as Tree, path));
    else out[path] = typeof value;
  }
  return out;
}

/** Every plain string leaf with its path. */
function strings(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]): [string, string][] => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") return [[path, value]];
    if (value && typeof value === "object") return strings(value as Tree, path);
    return [];
  });
}

describe("dictionaries", () => {
  it("Kyrgyz and Russian have exactly the same keys, lists and functions", () => {
    expect(shape(ky)).toEqual(shape(ru));
  });

  it("nothing is left in Russian by accident", () => {
    // The same in both languages on purpose: names, symbols, technical terms.
    const SAME = new Set([
      "common.dash",
      "common.start",
      "common.finish",
      "common.startLetter",
      "common.finishLetter",
      "language.short.ky",
      "language.short.ru",
      "language.names.ky",
      "language.names.ru",
      "preview.start",
      "preview.finish",
      "preview.teams.1",
      "preview.teams.2",
      "create.report",
      "route.addOption",
      "connection.live",
      "lobby.route",
      "lobby.team",
      "lobby.routeLabel",
      "projector.site",
      "race.finishBang",
      "race.report",
      "report.started",
      "report.columns.team",
      "report.timeline",
      "report.csv.standings.1",
      "report.csv.standings.3",
      "report.csv.answers.1",
      "report.csv.answers.3",
    ]);
    const kyStrings = new Map(strings(ky));
    const same = strings(ru)
      .filter(([path, text]) => kyStrings.get(path) === text && !SAME.has(path))
      .map(([path]) => path);
    expect(same).toEqual([]);
  });

  it("every error code raised by the database has a text in both languages", () => {
    const dir = join(process.cwd(), "supabase", "migrations");
    const sql = readdirSync(dir)
      .filter((file) => file.endsWith(".sql"))
      .map((file) => readFileSync(join(dir, file), "utf8"))
      .join("\n");
    const raised = new Set(
      [...sql.matchAll(/private\.fail\('([a-z_]+)'\)|message = '([a-z_]+)'/g)].map((match) => match[1] ?? match[2]),
    );
    raised.delete("immutable_field"); // only direct table writes, which clients cannot do
    const missing = [...raised].filter((code) => !(code in ru.errors.race) || !(code in ky.errors.race));
    expect(missing).toEqual([]);
  });
});

describe("Kyrgyz forms", () => {
  it("numbers do not change the noun", () => {
    expect([1, 5, 21].map((n) => pointsWord(n, ky))).toEqual(["упай", "упай", "упай"]);
    expect([60, 300, 1260].map((n) => minutesLabel(n, ky))).toEqual(["1 мүнөт", "5 мүнөт", "21 мүнөт"]);
  });

  it("ordinals come before the noun", () => {
    const point = { position: 2, title: "Бөлчөктөр", type: "checkpoint" as const, hasTask: true, task: null };
    expect(pointLabel(point, ky)).toBe("2-чекпоинт");
    expect(pointLabel(point, ru)).toBe("Чекпоинт 2");
    expect(ky.leaderboard.place(1)).toBe("1-орун");
  });

  it("explains errors and rules in the chosen language", () => {
    expect(raceErrorMessage({ message: "race_finished" }, {}, ky)).toBe("Бул жарыш бүтүп калган.");
    expect(raceErrorMessage({ message: "fetch failed" }, {}, ky)).toBe(ky.errors.network);
    expect(rulesSummary(ky)).toContain("10 секунд тыныгуу");
    expect(rulesSummary(ru)).toContain("пауза 10 секунд");
  });
});

describe("locale", () => {
  it("defaults to Kyrgyz, like the main site", () => {
    expect(DEFAULT_LOCALE).toBe("ky");
    expect(toLocale(undefined)).toBe("ky");
    expect(toLocale("en")).toBe("ky");
    expect(toLocale("ru")).toBe("ru");
    expect(LOCALES.every(isLocale)).toBe(true);
    expect(MESSAGES.ky).toBe(ky);
  });
});

describe("dates without the runtime's locale data", () => {
  it("formats the same on the server and in any browser", async () => {
    const { clockTime, dayAndTime, stamp } = await import("@/lib/i18n/format");
    const iso = "2026-10-07T09:05:30Z";
    expect(clockTime(iso, "Asia/Bishkek")).toBe("15:05:30");
    expect(dayAndTime(iso, ky, "Asia/Bishkek")).toBe("7-октябрь, 15:05");
    expect(dayAndTime(iso, ru, "Asia/Bishkek")).toBe("7 октября в 15:05");
    expect(stamp(iso, "Asia/Bishkek")).toBe("07.10.2026 15:05:30");
  });
});
