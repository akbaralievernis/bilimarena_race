import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb, type TestUser } from "./harness";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

async function setup() {
  const teacher = await t.createUser({ displayName: "Учитель" });
  const raceId = await t.rpc<string>(teacher, "create_race", ["Командная гонка"]);
  const [{ code }] = await t.admin<{ code: string }>("select code from public.races where id = $1", [raceId]);
  return { teacher, raceId, code };
}

async function join(code: string, name: string) {
  const user = await t.createUser({ anonymous: true });
  await t.rpc(user, "join_race", [code, name]);
  const [{ id }] = await t.admin<{ id: string }>("select id from public.participants where user_id = $1", [
    user.id,
  ]);
  return { user, participantId: id };
}

async function teamOf(participantId: string) {
  const [row] = await t.admin<{ team_id: string | null }>(
    "select team_id from public.participants where id = $1",
    [participantId],
  );
  return row.team_id;
}

describe("team management by the race owner", () => {
  it("creates, renames and deletes an empty team", async () => {
    const { teacher, raceId } = await setup();

    const teamId = await t.rpc<string>(teacher, "create_team", [raceId, "  Альфа  "]);
    await t.rpc(teacher, "rename_team", [teamId, "Альфа-центавра"]);
    let [team] = await t.admin<{ name: string }>("select name from public.teams where id = $1", [teamId]);
    expect(team.name).toBe("Альфа-центавра");

    await t.rpc(teacher, "delete_team", [teamId]);
    [team] = await t.admin("select name from public.teams where id = $1", [teamId]);
    expect(team).toBeUndefined();
  });

  it("rejects duplicate team names in the same race (case-insensitive)", async () => {
    const { teacher, raceId } = await setup();
    await t.rpc(teacher, "create_team", [raceId, "Барс"]);
    await expectDbError(t.rpc(teacher, "create_team", [raceId, "барс"]), "team_name_taken");

    const other = await t.rpc<string>(teacher, "create_team", [raceId, "Комета"]);
    await expectDbError(t.rpc(teacher, "rename_team", [other, "БАРС"]), "team_name_taken");
  });

  it("validates team names", async () => {
    const { teacher, raceId } = await setup();
    await expectDbError(t.rpc(teacher, "create_team", [raceId, "   "]), "invalid_team_name");
    await expectDbError(t.rpc(teacher, "create_team", [raceId, "x".repeat(41)]), "invalid_team_name");
  });

  it("refuses to delete a team that still has members", async () => {
    const { teacher, raceId, code } = await setup();
    const teamId = await t.rpc<string>(teacher, "create_team", [raceId, "Альфа"]);
    const { participantId } = await join(code, "Эрнис");
    await t.rpc(teacher, "assign_participant", [participantId, teamId]);

    await expectDbError(t.rpc(teacher, "delete_team", [teamId]), "team_not_empty");

    await t.rpc(teacher, "assign_participant", [participantId, null]);
    await t.rpc(teacher, "delete_team", [teamId]);
  });

  it("assigns, moves and unassigns a student", async () => {
    const { teacher, raceId, code } = await setup();
    const alpha = await t.rpc<string>(teacher, "create_team", [raceId, "Альфа"]);
    const beta = await t.rpc<string>(teacher, "create_team", [raceId, "Бета"]);
    const { participantId } = await join(code, "Эрнис");

    await t.rpc(teacher, "assign_participant", [participantId, alpha]);
    expect(await teamOf(participantId)).toBe(alpha);
    await t.rpc(teacher, "assign_participant", [participantId, beta]);
    expect(await teamOf(participantId)).toBe(beta);
    await t.rpc(teacher, "assign_participant", [participantId, null]);
    expect(await teamOf(participantId)).toBeNull();
  });

  it("cannot put a student into a team of another race", async () => {
    const first = await setup();
    const second = await setup();
    const foreignTeam = await t.rpc<string>(second.teacher, "create_team", [second.raceId, "Чужая"]);
    const { participantId } = await join(first.code, "Эрнис");

    await expectDbError(
      t.rpc(first.teacher, "assign_participant", [participantId, foreignTeam]),
      "team_not_found",
    );
    // The composite foreign key blocks it even for privileged writes.
    await expectDbError(
      t.admin("update public.participants set team_id = $1 where id = $2", [foreignTeam, participantId]),
      "23503",
    );
  });

  it("does not assign the teacher to a team", async () => {
    const { teacher, raceId } = await setup();
    const teamId = await t.rpc<string>(teacher, "create_team", [raceId, "Альфа"]);
    const [{ id }] = await t.admin<{ id: string }>(
      "select id from public.participants where race_id = $1 and role = 'teacher'",
      [raceId],
    );
    await expectDbError(t.rpc(teacher, "assign_participant", [id, teamId]), "cannot_assign_teacher");
  });

  it("locks team changes once the race is finished", async () => {
    const { teacher, raceId } = await setup();
    const teamId = await t.rpc<string>(teacher, "create_team", [raceId, "Альфа"]);
    await t.rpc(teacher, "finish_race", [raceId]);
    await expectDbError(t.rpc(teacher, "create_team", [raceId, "Бета"]), "race_finished");
    await expectDbError(t.rpc(teacher, "rename_team", [teamId, "Гамма"]), "race_finished");
    await expectDbError(t.rpc(teacher, "delete_team", [teamId]), "race_finished");
  });
});

describe("students cannot manage teams", () => {
  let teacher: TestUser;
  let raceId: string;
  let teamId: string;
  let student: TestUser;
  let studentParticipantId: string;
  let classmateParticipantId: string;

  beforeAll(async () => {
    ({ teacher, raceId } = await setup());
    const [{ code }] = await t.admin<{ code: string }>("select code from public.races where id = $1", [raceId]);
    teamId = await t.rpc<string>(teacher, "create_team", [raceId, "Альфа"]);
    ({ user: student, participantId: studentParticipantId } = await join(code, "Эрнис"));
    ({ participantId: classmateParticipantId } = await join(code, "Алина"));
  });

  it("cannot create, rename or delete teams via RPC", async () => {
    await expectDbError(t.rpc(student, "create_team", [raceId, "Моя"]), "race_not_found");
    await expectDbError(t.rpc(student, "rename_team", [teamId, "Моя"]), "team_not_found");
    await expectDbError(t.rpc(student, "delete_team", [teamId]), "team_not_found");
  });

  it("cannot assign themselves or a classmate via RPC", async () => {
    await expectDbError(
      t.rpc(student, "assign_participant", [studentParticipantId, teamId]),
      "participant_not_found",
    );
    await expectDbError(
      t.rpc(student, "assign_participant", [classmateParticipantId, teamId]),
      "participant_not_found",
    );
    expect(await teamOf(studentParticipantId)).toBeNull();
    expect(await teamOf(classmateParticipantId)).toBeNull();
  });

  it("cannot manage teams of a race they do not own even as another teacher", async () => {
    const stranger = await t.createUser();
    await expectDbError(t.rpc(stranger, "create_team", [raceId, "Захват"]), "race_not_found");
    await expectDbError(
      t.rpc(stranger, "assign_participant", [studentParticipantId, teamId]),
      "participant_not_found",
    );
  });
});
