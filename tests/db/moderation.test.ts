import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectDbError, type TestDb, type TestUser } from "./harness";

let t: TestDb;
let teacher: TestUser;
let stranger: TestUser;

beforeAll(async () => {
  t = await createTestDb();
  teacher = await t.createUser({ displayName: "Учитель" });
  stranger = await t.createUser({ displayName: "Чужой учитель" });
});

async function raceWithStudent(name = "Посторонний") {
  const raceId = await t.rpc<string>(teacher, "create_race", ["Урок"]);
  const [{ code }] = await t.admin<{ code: string }>("select code from public.races where id = $1", [raceId]);
  const student = await t.createUser({ anonymous: true });
  await t.rpc(student, "join_race", [code, name]);
  const [{ id }] = await t.admin<{ id: string }>(
    "select id from public.participants where race_id = $1 and user_id = $2",
    [raceId, student.id],
  );
  return { raceId, code, student, participantId: id };
}

describe("remove_participant", () => {
  it("removes the student, who then cannot rejoin this race", async () => {
    const { raceId, code, student, participantId } = await raceWithStudent();
    await t.rpc(teacher, "remove_participant", [participantId]);
    expect(await t.admin("select 1 from public.participants where id = $1", [participantId])).toEqual([]);
    await expectDbError(t.rpc(student, "join_race", [code, "Снова я"]), "join_closed");
    // The removed student no longer sees the lobby
    await expectDbError(t.rpc(student, "get_lobby", [raceId]), "race_not_found");
  });

  it("only the owner can remove, and never the teacher's own seat", async () => {
    const { raceId, participantId } = await raceWithStudent();
    await expectDbError(t.rpc(stranger, "remove_participant", [participantId]), "participant_not_found");
    const other = await raceWithStudent("Одноклассник");
    await expectDbError(t.rpc(other.student, "remove_participant", [participantId]), "participant_not_found");
    const [{ id: teacherSeat }] = await t.admin<{ id: string }>(
      "select id from public.participants where race_id = $1 and role = 'teacher'",
      [raceId],
    );
    await expectDbError(t.rpc(teacher, "remove_participant", [teacherSeat]), "cannot_assign_teacher");
  });
});

describe("set_join_locked", () => {
  it("closes joining for new students; students already in keep their seat", async () => {
    const { raceId, code, student } = await raceWithStudent("Уже здесь");
    await t.rpc(teacher, "set_join_locked", [raceId, true]);
    const late = await t.createUser({ anonymous: true });
    await expectDbError(t.rpc(late, "join_race", [code, "Опоздал"]), "join_closed");
    expect(await t.rpc(student, "join_race", [code, "Уже здесь"])).toBe(raceId);
    const lobby = await t.rpc<{ race: { joinLocked: boolean } }>(teacher, "get_lobby", [raceId]);
    expect(lobby.race.joinLocked).toBe(true);

    await t.rpc(teacher, "set_join_locked", [raceId, false]);
    expect(await t.rpc(late, "join_race", [code, "Опоздал"])).toBe(raceId);
  });

  it("only the owner can lock", async () => {
    const { raceId, student } = await raceWithStudent();
    await expectDbError(t.rpc(stranger, "set_join_locked", [raceId, true]), "race_not_found");
    await expectDbError(t.rpc(student, "set_join_locked", [raceId, true]), "race_not_found");
  });
});

describe("report_focus_leave", () => {
  it("counts only while the race runs, shows the count to the teacher, removes on the 3rd time", async () => {
    const { raceId, code, student, participantId } = await raceWithStudent("Отвлёкся");
    // Before the start nothing is counted
    expect(await t.rpc(student, "report_focus_leave", [raceId])).toEqual({ leaves: 0, removed: false });
    await t.rpc(teacher, "start_race", [raceId]);
    expect(await t.rpc(student, "report_focus_leave", [raceId])).toEqual({ leaves: 1, removed: false });
    const lobby = await t.rpc<{ participants: { id: string; focusLeaves: number }[] }>(teacher, "get_lobby", [raceId]);
    expect(lobby.participants.find((p) => p.id === participantId)?.focusLeaves).toBe(1);
    expect(await t.rpc(student, "report_focus_leave", [raceId])).toEqual({ leaves: 2, removed: false });
    expect(await t.rpc(student, "report_focus_leave", [raceId])).toEqual({ leaves: 3, removed: true });
    expect(await t.admin("select 1 from public.participants where id = $1", [participantId])).toEqual([]);
    await expectDbError(t.rpc(student, "join_race", [code, "Снова"]), "join_closed");
  });

  it("a classmate cannot raise someone else's count", async () => {
    const { raceId, participantId } = await raceWithStudent("Честный");
    await t.rpc(teacher, "start_race", [raceId]);
    const outsider = await t.createUser({ anonymous: true });
    expect(await t.rpc(outsider, "report_focus_leave", [raceId])).toEqual({ leaves: 0, removed: false });
    const [{ focus_leaves }] = await t.admin<{ focus_leaves: number }>("select focus_leaves from public.participants where id = $1", [participantId]);
    expect(focus_leaves).toBe(0);
  });
});
