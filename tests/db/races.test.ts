import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb } from "./harness";

const CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

describe("room code generation", () => {
  it("produces 6-character codes without look-alike symbols", async () => {
    const rows = await t.admin<{ code: string }>(
      "select private.generate_room_code() as code from generate_series(1, 2000)",
    );
    const codes = rows.map((row) => row.code);

    for (const code of codes) expect(code).toMatch(CODE_PATTERN);
    // 32^6 ≈ 1.07e9 combinations: collisions among 2000 codes are practically impossible.
    expect(new Set(codes).size).toBe(codes.length);
    // Every symbol of the alphabet shows up, so none is structurally excluded.
    expect(new Set(codes.join("")).size).toBe(32);
  });

  it("normalizes user input, including Cyrillic look-alikes", async () => {
    const rows = await t.admin<{ code: string }>(
      `select private.normalize_room_code(input) as code
       from unnest(array['a7k 9q2', 'A7K-9Q2', 'А7К9Q2', ' е2рс4х ']) as input`,
    );
    expect(rows.map((row) => row.code)).toEqual(["A7K9Q2", "A7K9Q2", "A7K9Q2", "E2PC4X"]);
  });
});

describe("create_race", () => {
  it("creates a lobby race owned by the teacher with a server-generated code", async () => {
    const teacher = await t.createUser({ displayName: "Айгуль Сыдыкова" });
    const raceId = await t.rpc<string>(teacher, "create_race", ["  Физика   9Б ", "Кинематика"]);

    const [race] = await t.admin<{ code: string; title: string; status: string; created_by: string }>(
      "select code, title, status, created_by from public.races where id = $1",
      [raceId],
    );
    expect(race.code).toMatch(CODE_PATTERN);
    expect(race.title).toBe("Физика 9Б");
    expect(race.status).toBe("lobby");
    expect(race.created_by).toBe(teacher.id);

    const participants = await t.admin<{ role: string; display_name: string; team_id: string | null }>(
      "select role, display_name, team_id from public.participants where race_id = $1",
      [raceId],
    );
    expect(participants).toEqual([{ role: "teacher", display_name: "Айгуль Сыдыкова", team_id: null }]);
  });

  it("gives every race a distinct code", async () => {
    const teacher = await t.createUser();
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) ids.push(await t.rpc<string>(teacher, "create_race", [`Гонка ${i}`]));
    const rows = await t.admin<{ count: number }>(
      "select count(distinct code)::int as count from public.races where id = any($1::uuid[])",
      [ids],
    );
    expect(rows[0].count).toBe(20);
  });

  it("rejects anonymous (student) sessions", async () => {
    const student = await t.createUser({ anonymous: true });
    await expectDbError(t.rpc(student, "create_race", ["Моя гонка"]), "teacher_account_required");
  });

  it("rejects callers without a session", async () => {
    await expectDbError(t.asAnon("select public.create_race('Гонка')"), "42501");
  });

  it("validates title and description", async () => {
    const teacher = await t.createUser();
    await expectDbError(t.rpc(teacher, "create_race", ["ab"]), "invalid_title");
    await expectDbError(t.rpc(teacher, "create_race", ["x".repeat(81)]), "invalid_title");
    await expectDbError(t.rpc(teacher, "create_race", ["Гонка", "x".repeat(501)]), "invalid_description");
  });

  it("falls back to a safe teacher name", async () => {
    const teacher = await t.createUser();
    const raceId = await t.rpc<string>(teacher, "create_race", ["Без имени"]);
    const [row] = await t.admin<{ display_name: string }>(
      "select display_name from public.participants where race_id = $1",
      [raceId],
    );
    // Derived from the e-mail local part when no display name is set.
    expect(row.display_name).toMatch(/^teacher-/);
  });
});

describe("race status transitions", () => {
  it("allows exactly draft→lobby, lobby→running, lobby→finished, running→finished", async () => {
    const rows = await t.admin<{ from_status: string; to_status: string; allowed: boolean }>(
      `select f::text as from_status, s::text as to_status, private.can_transition(f, s) as allowed
       from unnest(enum_range(null::public.race_status)) f,
            unnest(enum_range(null::public.race_status)) s`,
    );
    const allowed = rows.filter((row) => row.allowed).map((row) => `${row.from_status}→${row.to_status}`);
    expect(allowed.sort()).toEqual(["draft→lobby", "lobby→finished", "lobby→running", "running→finished"]);
  });

  it("starts and finishes a race through the owner's trusted calls", async () => {
    const teacher = await t.createUser();
    const raceId = await t.rpc<string>(teacher, "create_race", ["Старт и финиш"]);

    await t.rpc(teacher, "start_race", [raceId]);
    let [race] = await t.admin<{ status: string; started_at: string | null }>(
      "select status, started_at from public.races where id = $1",
      [raceId],
    );
    expect(race.status).toBe("running");
    expect(race.started_at).not.toBeNull();

    await expectDbError(t.rpc(teacher, "start_race", [raceId]), "invalid_status_transition");

    await t.rpc(teacher, "finish_race", [raceId]);
    [race] = await t.admin("select status, started_at from public.races where id = $1", [raceId]);
    expect(race.status).toBe("finished");

    await expectDbError(t.rpc(teacher, "finish_race", [raceId]), "invalid_status_transition");
    await expectDbError(t.rpc(teacher, "start_race", [raceId]), "invalid_status_transition");
  });

  it("enforces transitions even for privileged direct updates", async () => {
    const teacher = await t.createUser();
    const raceId = await t.rpc<string>(teacher, "create_race", ["Защита статуса"]);
    await t.rpc(teacher, "finish_race", [raceId]);
    await expectDbError(
      t.admin("update public.races set status = 'running', finished_at = null where id = $1", [raceId]),
      "invalid_status_transition",
    );
  });
});

describe("list_my_races", () => {
  it("returns only races created by the caller", async () => {
    const teacherA = await t.createUser();
    const teacherB = await t.createUser();
    const raceA = await t.rpc<string>(teacherA, "create_race", ["Гонка A"]);
    await t.rpc<string>(teacherB, "create_race", ["Гонка B"]);

    const races = await t.rpc<{ id: string; title: string }[]>(teacherA, "list_my_races");
    expect(races.map((race) => race.id)).toEqual([raceA]);
    expect(Object.keys(races[0]).sort()).toEqual(["code", "createdAt", "id", "status", "title"]);
  });
});
