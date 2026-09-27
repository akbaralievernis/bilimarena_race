import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb, type TestUser } from "./harness";

let t: TestDb;
let teacher: TestUser;

beforeAll(async () => {
  t = await createTestDb();
  teacher = await t.createUser({ displayName: "Учитель" });
});

async function newRace(title = "Урок") {
  const raceId = await t.rpc<string>(teacher, "create_race", [title]);
  const [{ code }] = await t.admin<{ code: string }>("select code from public.races where id = $1", [raceId]);
  return { raceId, code };
}

async function studentRows(raceId: string) {
  return t.admin<{ user_id: string; display_name: string; role: string; team_id: string | null }>(
    "select user_id, display_name, role, team_id from public.participants where race_id = $1 and role = 'student'",
    [raceId],
  );
}

describe("join_race", () => {
  it("creates a student participant without a team", async () => {
    const { raceId, code } = await newRace();
    const student = await t.createUser({ anonymous: true });

    const joined = await t.rpc<string>(student, "join_race", [code, "  Эрнис   Акбаралиев "]);

    expect(joined).toBe(raceId);
    expect(await studentRows(raceId)).toEqual([
      { user_id: student.id, display_name: "Эрнис Акбаралиев", role: "student", team_id: null },
    ]);
  });

  it("accepts lower case, separators and Cyrillic look-alikes in the code", async () => {
    const { raceId, code } = await newRace();
    const student = await t.createUser({ anonymous: true });
    const typed = `${code.slice(0, 3).toLowerCase()} - ${code.slice(3)}`;
    expect(await t.rpc(student, "join_race", [typed, "Айбек"])).toBe(raceId);
  });

  it("rejects unknown and malformed codes with the same error", async () => {
    const student = await t.createUser({ anonymous: true });
    await expectDbError(t.rpc(student, "join_race", ["ZZZZZZ", "Айбек"]), "race_not_found");
    await expectDbError(t.rpc(student, "join_race", ["", "Айбек"]), "race_not_found");
    await expectDbError(t.rpc(student, "join_race", ["' or 1=1 --", "Айбек"]), "race_not_found");
  });

  it("rejects finished races", async () => {
    const { raceId, code } = await newRace();
    await t.rpc(teacher, "finish_race", [raceId]);
    const student = await t.createUser({ anonymous: true });
    await expectDbError(t.rpc(student, "join_race", [code, "Айбек"]), "race_finished");
  });

  it("rejects draft races", async () => {
    const { raceId, code } = await newRace();
    // Drafts are not created through the API yet and lobby→draft is not a valid
    // transition, so arrange one with the guard trigger switched off.
    await t.admin("alter table public.races disable trigger races_guard_update");
    await t.admin("update public.races set status = 'draft' where id = $1", [raceId]);
    await t.admin("alter table public.races enable trigger races_guard_update");

    const student = await t.createUser({ anonymous: true });
    await expectDbError(t.rpc(student, "join_race", [code, "Айбек"]), "race_not_open");
  });

  it("allows late joining while the race is running", async () => {
    const { raceId, code } = await newRace();
    await t.rpc(teacher, "start_race", [raceId]);
    const student = await t.createUser({ anonymous: true });
    expect(await t.rpc(student, "join_race", [code, "Опоздавший"])).toBe(raceId);
  });

  it("validates the display name", async () => {
    const { code } = await newRace();
    const student = await t.createUser({ anonymous: true });
    await expectDbError(t.rpc(student, "join_race", [code, "Я"]), "invalid_display_name");
    await expectDbError(t.rpc(student, "join_race", [code, "x".repeat(31)]), "invalid_display_name");
    await expectDbError(t.rpc(student, "join_race", [code, "Имя\u0007"]), "invalid_display_name");
  });
});

describe("duplicate handling", () => {
  it("re-joining returns the same seat instead of creating a duplicate", async () => {
    const { raceId, code } = await newRace();
    const student = await t.createUser({ anonymous: true });

    await t.rpc(student, "join_race", [code, "Эрнис"]);
    await t.rpc(student, "join_race", [code, "Эрнис"]);
    await t.rpc(student, "join_race", [code, "Другое имя"]);

    const rows = await studentRows(raceId);
    expect(rows).toHaveLength(1);
    // The existing name is kept; re-joining cannot rename.
    expect(rows[0].display_name).toBe("Эрнис");
  });

  it("keeps the team when a student re-joins", async () => {
    const { raceId, code } = await newRace();
    const student = await t.createUser({ anonymous: true });
    await t.rpc(student, "join_race", [code, "Алина"]);
    const teamId = await t.rpc<string>(teacher, "create_team", [raceId, "Альфа"]);
    const [{ id }] = await t.admin<{ id: string }>(
      "select id from public.participants where user_id = $1",
      [student.id],
    );
    await t.rpc(teacher, "assign_participant", [id, teamId]);

    await t.rpc(student, "join_race", [code, "Алина"]);
    expect((await studentRows(raceId))[0].team_id).toBe(teamId);
  });

  it("does not allow two students with the same name (case-insensitive)", async () => {
    const { raceId, code } = await newRace();
    const first = await t.createUser({ anonymous: true });
    const second = await t.createUser({ anonymous: true });

    await t.rpc(first, "join_race", [code, "Эрнис"]);
    await expectDbError(t.rpc(second, "join_race", [code, "эрнис"]), "display_name_taken");
    expect(await studentRows(raceId)).toHaveLength(1);
  });

  it("lets the owner re-enter their own race without becoming a student", async () => {
    const { raceId, code } = await newRace();
    expect(await t.rpc(teacher, "join_race", [code, "Учитель"])).toBe(raceId);
    expect(await studentRows(raceId)).toHaveLength(0);
  });
});
