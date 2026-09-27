import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb, type TestUser } from "./harness";

/*
 * Direct attacks through the Data API: these queries run as the same Postgres
 * roles PostgREST uses (`authenticated` / `anon`) with a user's JWT claims.
 * The database itself must refuse them — no UI involved.
 */

const PERMISSION_DENIED = "42501";

let t: TestDb;
let teacher: TestUser;
let otherTeacher: TestUser;
let student: TestUser;
let teammate: TestUser;
let otherTeamStudent: TestUser;
let outsider: TestUser;
let raceId: string;
let otherRaceId: string;
let teamA: string;
let teamB: string;
let studentParticipantId: string;

beforeAll(async () => {
  t = await createTestDb();
  teacher = await t.createUser({ displayName: "Учитель" });
  otherTeacher = await t.createUser({ displayName: "Другой учитель" });
  student = await t.createUser({ anonymous: true });
  teammate = await t.createUser({ anonymous: true });
  otherTeamStudent = await t.createUser({ anonymous: true });
  outsider = await t.createUser({ anonymous: true });

  raceId = await t.rpc<string>(teacher, "create_race", ["Безопасная гонка"]);
  otherRaceId = await t.rpc<string>(otherTeacher, "create_race", ["Чужая гонка"]);
  const [{ code }] = await t.admin<{ code: string }>("select code from public.races where id = $1", [raceId]);

  teamA = await t.rpc<string>(teacher, "create_team", [raceId, "Альфа"]);
  teamB = await t.rpc<string>(teacher, "create_team", [raceId, "Бета"]);

  const seat = async (user: TestUser, name: string, team: string) => {
    await t.rpc(user, "join_race", [code, name]);
    const [{ id }] = await t.admin<{ id: string }>("select id from public.participants where user_id = $1", [
      user.id,
    ]);
    await t.rpc(teacher, "assign_participant", [id, team]);
    return id;
  };
  studentParticipantId = await seat(student, "Эрнис", teamA);
  await seat(teammate, "Алина", teamA);
  await seat(otherTeamStudent, "Бекзат", teamB);
});

describe("no direct writes", () => {
  it("a student cannot change the race status, title or owner", async () => {
    await expectDbError(
      t.as(student, "update public.races set status = 'running' where id = $1", [raceId]),
      PERMISSION_DENIED,
    );
    await expectDbError(
      t.as(student, "update public.races set title = 'Взлом' where id = $1", [raceId]),
      PERMISSION_DENIED,
    );
    await expectDbError(
      t.as(student, "update public.races set created_by = $1 where id = $2", [student.id, raceId]),
      PERMISSION_DENIED,
    );
  });

  it("even the owner cannot bypass the trusted functions", async () => {
    await expectDbError(
      t.as(teacher, "update public.races set status = 'running' where id = $1", [raceId]),
      PERMISSION_DENIED,
    );
    await expectDbError(t.as(teacher, "delete from public.races where id = $1", [raceId]), PERMISSION_DENIED);
    await expectDbError(
      t.as(teacher, "insert into public.teams (race_id, name) values ($1, 'Прямая')", [raceId]),
      PERMISSION_DENIED,
    );
  });

  it("a student cannot rename anyone or move between teams", async () => {
    await expectDbError(
      t.as(student, "update public.participants set display_name = 'Хакер' where race_id = $1", [raceId]),
      PERMISSION_DENIED,
    );
    await expectDbError(
      t.as(student, "update public.participants set team_id = $1 where id = $2", [teamB, studentParticipantId]),
      PERMISSION_DENIED,
    );
  });

  it("a student cannot insert a participant row, e.g. into a finished or foreign race", async () => {
    await expectDbError(
      t.as(
        outsider,
        "insert into public.participants (race_id, user_id, display_name, role) values ($1, $2, 'Чужой', 'teacher')",
        [otherRaceId, outsider.id],
      ),
      PERMISSION_DENIED,
    );
  });

  it("a student cannot create a race with a chosen code", async () => {
    await expectDbError(
      t.as(
        student,
        "insert into public.races (code, title, created_by) values ('AAAAAA', 'Своя', $1)",
        [student.id],
      ),
      PERMISSION_DENIED,
    );
  });

  it("a student cannot start or finish the race through RPC", async () => {
    await expectDbError(t.rpc(student, "start_race", [raceId]), "race_not_found");
    await expectDbError(t.rpc(student, "finish_race", [raceId]), "race_not_found");
    await expectDbError(t.rpc(otherTeacher, "start_race", [raceId]), "race_not_found");

    const [race] = await t.admin<{ status: string }>("select status from public.races where id = $1", [raceId]);
    expect(race.status).toBe("lobby");
  });

  it("requests without a session cannot read or call anything", async () => {
    await expectDbError(t.asAnon("select id from public.races"), PERMISSION_DENIED);
    await expectDbError(t.asAnon("select id from public.participants"), PERMISSION_DENIED);
    await expectDbError(t.asAnon("select public.join_race('AAAAAA', 'Гость')"), PERMISSION_DENIED);
    await expectDbError(t.asAnon(`select public.get_lobby('${raceId}')`), PERMISSION_DENIED);
  });

  it("private helpers are not callable by clients", async () => {
    await expectDbError(t.as(student, "select private.generate_room_code()"), PERMISSION_DENIED);
    await expectDbError(t.as(student, `select private.lock_owned_race('${raceId}')`), PERMISSION_DENIED);
  });
});

describe("row level security on reads", () => {
  it("an outsider sees no races, teams or participants", async () => {
    expect(await t.as(outsider, "select id from public.races")).toEqual([]);
    expect(await t.as(outsider, "select id from public.teams")).toEqual([]);
    expect(await t.as(outsider, "select id from public.participants")).toEqual([]);
  });

  it("a teacher does not see another teacher's race", async () => {
    const rows = await t.as<{ id: string }>(otherTeacher, "select id from public.races");
    expect(rows.map((row) => row.id)).toEqual([otherRaceId]);
  });

  it("a student sees their race and its teams", async () => {
    const races = await t.as<{ id: string }>(student, "select id from public.races");
    expect(races.map((row) => row.id)).toEqual([raceId]);
    const teams = await t.as<{ id: string }>(student, "select id from public.teams order by name");
    expect(teams.map((row) => row.id)).toEqual([teamA, teamB]);
  });

  it("a student sees only themselves and teammates, the owner sees everyone", async () => {
    const seenByStudent = await t.as<{ display_name: string }>(
      student,
      "select display_name from public.participants order by display_name",
    );
    expect(seenByStudent.map((row) => row.display_name)).toEqual(["Алина", "Эрнис"]);

    const seenByTeacher = await t.as<{ display_name: string }>(
      teacher,
      "select display_name from public.participants where role = 'student' order by display_name",
    );
    expect(seenByTeacher.map((row) => row.display_name)).toEqual(["Алина", "Бекзат", "Эрнис"]);
  });

  it("internal auth ids are not readable at all", async () => {
    await expectDbError(t.as(teacher, "select user_id from public.participants"), PERMISSION_DENIED);
    await expectDbError(t.as(teacher, "select created_by from public.races"), PERMISSION_DENIED);
    await expectDbError(t.as(student, "select * from public.participants"), PERMISSION_DENIED);
  });

  it("get_lobby refuses non-members and hides other teams from students", async () => {
    await expectDbError(t.rpc(outsider, "get_lobby", [raceId]), "race_not_found");
    await expectDbError(t.rpc(otherTeacher, "get_lobby", [raceId]), "race_not_found");

    type Lobby = {
      viewer: { role: string; teamId: string | null };
      participants: { displayName: string }[];
      studentCount: number;
    };
    const studentView = await t.rpc<Lobby>(student, "get_lobby", [raceId]);
    expect(studentView.viewer).toMatchObject({ role: "student", teamId: teamA });
    expect(studentView.participants.map((p) => p.displayName).sort()).toEqual(["Алина", "Эрнис"]);
    expect(studentView.studentCount).toBe(3);
    expect(JSON.stringify(studentView)).not.toContain(student.id);

    const teacherView = await t.rpc<Lobby>(teacher, "get_lobby", [raceId]);
    expect(teacherView.viewer.role).toBe("teacher");
    expect(teacherView.participants).toHaveLength(3);
    expect(JSON.stringify(teacherView)).not.toContain(student.id);
  });
});

describe("realtime channel", () => {
  it("announces lobby changes on the race topic without row data", async () => {
    await t.admin("delete from realtime.messages");
    await t.rpc(teacher, "create_team", [raceId, "Гамма"]);

    const messages = await t.admin<{ topic: string; event: string; payload: unknown; private: boolean }>(
      "select topic, event, payload, private from realtime.messages",
    );
    expect(messages).toEqual([
      { topic: `race:${raceId}`, event: "lobby_changed", payload: { table: "teams", op: "insert" }, private: true },
    ]);
  });

  it("only race members can receive the race topic", async () => {
    await t.admin(
      "insert into realtime.messages (topic, extension, event, payload, private) values ($1, 'broadcast', 'probe', '{}', true)",
      [`race:${raceId}`],
    );
    const receive = (user: TestUser, topic: string) =>
      t.as<{ id: number }>(user, "select id from realtime.messages where topic = $1", [topic], {
        "realtime.topic": topic,
      });

    expect((await receive(teacher, `race:${raceId}`)).length).toBeGreaterThan(0);
    expect((await receive(student, `race:${raceId}`)).length).toBeGreaterThan(0);
    expect(await receive(outsider, `race:${raceId}`)).toEqual([]);
    expect(await receive(otherTeacher, `race:${raceId}`)).toEqual([]);
    expect(await receive(student, "race:not-a-uuid")).toEqual([]);
  });

  it("a failing broadcast never rolls back the lobby change", async () => {
    await t.admin(`
      create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
      returns void language plpgsql as $$ begin raise exception 'realtime is down'; end $$`);
    try {
      const teamId = await t.rpc<string>(teacher, "create_team", [raceId, "Устойчивая"]);
      const rows = await t.admin("select id from public.teams where id = $1", [teamId]);
      expect(rows).toHaveLength(1);
    } finally {
      await t.admin(`
        create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
        returns void language plpgsql as $$
        begin
          insert into realtime.messages (payload, event, topic, private, extension)
          values (payload, event, topic, private, 'broadcast');
        end $$`);
    }
  });

  it("clients cannot broadcast fake lobby events", async () => {
    await expectDbError(
      t.as(
        student,
        "insert into realtime.messages (topic, extension, event, payload, private) values ($1, 'broadcast', 'lobby_changed', '{}', true)",
        [`race:${raceId}`],
        { "realtime.topic": `race:${raceId}` },
      ),
      /row-level security/,
    );
  });
});

describe("data integrity", () => {
  it("deleting a teacher account removes their races with teams and seats", async () => {
    const shortLived = await t.createUser();
    const id = await t.rpc<string>(shortLived, "create_race", ["Временная"]);
    await t.rpc(shortLived, "create_team", [id, "Команда"]);
    await t.admin("delete from auth.users where id = $1", [shortLived.id]);
    const [counts] = await t.admin<{ races: number; teams: number; participants: number }>(
      `select (select count(*) from public.races where id = $1)::int as races,
              (select count(*) from public.teams where race_id = $1)::int as teams,
              (select count(*) from public.participants where race_id = $1)::int as participants`,
      [id],
    );
    expect(counts).toEqual({ races: 0, teams: 0, participants: 0 });
  });

  it("room code and owner are immutable", async () => {
    await expectDbError(
      t.admin("update public.races set code = 'AAAAAA' where id = $1", [raceId]),
      "immutable_field",
    );
    await expectDbError(
      t.admin("update public.races set created_by = $1 where id = $2", [otherTeacher.id, raceId]),
      "immutable_field",
    );
  });

  it("a user holds at most one seat per race", async () => {
    await expectDbError(
      t.admin(
        "insert into public.participants (race_id, user_id, display_name) values ($1, $2, 'Клон')",
        [raceId, student.id],
      ),
      "23505",
    );
  });
});
