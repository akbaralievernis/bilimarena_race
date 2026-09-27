import { describe, expect, it } from "vitest";
import {
  ROOM_CODE_ALPHABET,
  formatRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  validateDisplayName,
  validateRaceDescription,
  validateRaceTitle,
  validateRoomCode,
  validateTeamName,
} from "@/lib/race/validation";

describe("room code alphabet", () => {
  it("has 32 unambiguous symbols", () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(32);
    for (const lookAlike of ["0", "O", "1", "I"]) expect(ROOM_CODE_ALPHABET).not.toContain(lookAlike);
  });
});

describe("normalizeRoomCode", () => {
  it("uppercases and strips separators", () => {
    expect(normalizeRoomCode(" a7k-9q2 ")).toBe("A7K9Q2");
    expect(normalizeRoomCode("a7k 9q2")).toBe("A7K9Q2");
  });

  it("maps Cyrillic look-alikes typed on a Russian layout", () => {
    expect(normalizeRoomCode("А7К9Q2")).toBe("A7K9Q2");
    expect(normalizeRoomCode("е2рс4х")).toBe("E2PC4X");
  });

  it("drops characters that can never be in a code", () => {
    expect(normalizeRoomCode("AB!@#C—D")).toBe("ABCD");
  });
});

describe("validateRoomCode", () => {
  it("accepts a valid code in any typing style", () => {
    expect(validateRoomCode("a7k 9q2")).toEqual({ ok: true, value: "A7K9Q2" });
    expect(isValidRoomCode("A7K9Q2")).toBe(true);
  });

  it("explains empty, short and ambiguous input", () => {
    expect(validateRoomCode("  ")).toEqual({ ok: false, error: "Введите код гонки." });
    expect(validateRoomCode("A7K9")).toMatchObject({ ok: false, error: expect.stringContaining("6 символов") });
    expect(validateRoomCode("A7K0Q2")).toMatchObject({ ok: false, error: expect.stringContaining("0, 1, O и I") });
    expect(validateRoomCode("OOOIII")).toMatchObject({ ok: false });
  });

  it("formats codes for reading aloud", () => {
    expect(formatRoomCode("A7K9Q2")).toBe("A7K 9Q2");
  });
});

describe("validateDisplayName", () => {
  it("trims and collapses spaces", () => {
    expect(validateDisplayName("  Эрнис   Акбаралиев ")).toEqual({ ok: true, value: "Эрнис Акбаралиев" });
  });

  it("accepts Kyrgyz, Latin and common punctuation", () => {
    for (const name of ["Үмүт", "Aigerim", "Д'Артаньян", "Анна-Мария", "Эрнис А.", "Team 7"]) {
      expect(validateDisplayName(name).ok).toBe(true);
    }
  });

  it("rejects too short, too long and odd names", () => {
    expect(validateDisplayName("Я").ok).toBe(false);
    expect(validateDisplayName("x".repeat(31)).ok).toBe(false);
    expect(validateDisplayName("<script>").ok).toBe(false);
    expect(validateDisplayName("🚀🚀🚀").ok).toBe(false);
    expect(validateDisplayName("123").ok).toBe(false);
  });

  it("counts characters, not UTF-16 units", () => {
    expect(validateDisplayName("ү".repeat(30)).ok).toBe(true);
  });
});

describe("race and team fields", () => {
  it("validates the race title", () => {
    expect(validateRaceTitle("  Дроби  6А ")).toEqual({ ok: true, value: "Дроби 6А" });
    expect(validateRaceTitle("ab").ok).toBe(false);
    expect(validateRaceTitle("x".repeat(81)).ok).toBe(false);
  });

  it("treats an empty description as absent", () => {
    expect(validateRaceDescription("   ")).toEqual({ ok: true, value: null });
    expect(validateRaceDescription("x".repeat(501)).ok).toBe(false);
  });

  it("validates team names", () => {
    expect(validateTeamName(" Альфа ")).toEqual({ ok: true, value: "Альфа" });
    expect(validateTeamName("   ").ok).toBe(false);
    expect(validateTeamName("x".repeat(41)).ok).toBe(false);
  });
});
