import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { rememberLanguage } from "@/proxy";

describe("?lang= from the main site", () => {
  it("remembers ky or ru and redirects to the same address without it", () => {
    const response = rememberLanguage(new NextRequest("https://race.example/join?code=A7K9Q2&lang=ru"))!;
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://race.example/join?code=A7K9Q2");
    expect(response.cookies.get("race_lang")?.value).toBe("ru");
  });

  it("drops an unknown language without changing the choice", () => {
    const response = rememberLanguage(new NextRequest("https://race.example/create?lang=en"))!;
    expect(response.headers.get("location")).toBe("https://race.example/create");
    expect(response.cookies.get("race_lang")).toBeUndefined();
  });

  it("leaves other requests alone", () => {
    expect(rememberLanguage(new NextRequest("https://race.example/join?code=A7K9Q2"))).toBeNull();
  });
});
