import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanUp, expectLobbySignal, isConfigured, listen, rpc, rpcError, signInStudent, signInTeacher } from "./support";

/*
 * Stage 2 end-to-end: route creation, team movement through advance_team(),
 * the N → N+1 rule, direct-write protection and Realtime delivery of moves.
 * Same setup as lobby.test.ts; 2 anonymous students per run.
 */

const RUN_ID = randomUUID().slice(0, 8);

type Lobby = {
  race: { code: string };
  route: { position: number; title: string; type: string }[];
  teams: { id: string; name: string; position: number }[];
  participants: { id: string; displayName: string }[];
};

describe.skipIf(!isConfigured)("Supabase integration: route and team movement", () => {
  let teacher: SupabaseClient | undefined;
  let alphaStudent: SupabaseClient;
  let betaStudent: SupabaseClient;
  let raceId: string | undefined;
  let alpha: string;
  let beta: string;
  const clients: SupabaseClient[] = [];

  const lobbyFor = (client: SupabaseClient) => rpc<Lobby>(client, "get_lobby", { p_race_id: raceId });
  const positionOf = async (teamId: string) => (await lobbyFor(teacher!)).teams.find((team) => team.id === teamId)!.position;

  beforeAll(async () => {
    teacher = await signInTeacher();
    clients.push(teacher);
    [alphaStudent, betaStudent] = await Promise.all([signInStudent(), signInStudent()]);
    clients.push(alphaStudent, betaStudent);

    raceId = await rpc<string>(teacher, "create_race", {
      p_title: `Маршрут ${RUN_ID}`,
      p_description: null,
      p_checkpoints: ["Дроби", "Проценты"],
    });
    const { race } = await lobbyFor(teacher);
    await rpc(alphaStudent, "join_race", { p_code: race.code, p_display_name: "Эрнис" });
    await rpc(betaStudent, "join_race", { p_code: race.code, p_display_name: "Алина" });

    alpha = await rpc<string>(teacher, "create_team", { p_race_id: raceId, p_name: "Альфа" });
    beta = await rpc<string>(teacher, "create_team", { p_race_id: raceId, p_name: "Бета" });
    const { participants } = await lobbyFor(teacher);
    const seat = (name: string) => participants.find((participant) => participant.displayName === name)!.id;
    await rpc(teacher, "assign_participant", { p_participant_id: seat("Эрнис"), p_team_id: alpha });
    await rpc(teacher, "assign_participant", { p_participant_id: seat("Алина"), p_team_id: beta });
  });

  afterAll(() => cleanUp(teacher, raceId, clients));

  it("stores the route in order and puts teams on START", async () => {
    const lobby = await lobbyFor(alphaStudent);
    expect(lobby.route).toEqual([
      { position: 0, title: "Старт", type: "start" },
      { position: 1, title: "Дроби", type: "checkpoint" },
      { position: 2, title: "Проценты", type: "checkpoint" },
      { position: 3, title: "Финиш", type: "finish" },
    ]);
    expect(lobby.teams.map((team) => team.position)).toEqual([0, 0]);
  });

  it("does not move teams before the start", async () => {
    expect(await rpcError(alphaStudent, "advance_team", { p_team_id: alpha, p_to_position: 1 })).toBe("race_not_started");
  });

  it("shows a move to other clients over Realtime", async () => {
    await rpc(teacher!, "start_race", { p_race_id: raceId });

    const subscription = await listen(betaStudent, raceId!);
    expect(subscription.status).toBe("SUBSCRIBED");
    const moved = subscription.nextEvent();
    const result = await rpc<{ position: number; moved: boolean }>(alphaStudent, "advance_team", {
      p_team_id: alpha,
      p_to_position: 1,
    });
    expect(result).toMatchObject({ position: 1, moved: true });
    expectLobbySignal(await moved, { table: "teams", op: "update" }, [raceId!, alpha, beta]);

    const seenByBeta = await lobbyFor(betaStudent);
    expect(seenByBeta.teams.find((team) => team.id === alpha)!.position).toBe(1);
  });

  it("allows only N → N+1", async () => {
    expect(await rpcError(alphaStudent, "advance_team", { p_team_id: alpha, p_to_position: 3 })).toBe("invalid_move");
    expect(await rpcError(alphaStudent, "advance_team", { p_team_id: alpha, p_to_position: 0 })).toBe("invalid_move");
    expect(await rpcError(betaStudent, "advance_team", { p_team_id: beta, p_to_position: 2 })).toBe("invalid_move");
    expect(await positionOf(alpha)).toBe(1);
    expect(await positionOf(beta)).toBe(0);
  });

  it("does not let a student move another team", async () => {
    expect(await rpcError(betaStudent, "advance_team", { p_team_id: alpha, p_to_position: 2 })).toBe("team_not_found");
    expect(await rpcError(teacher!, "advance_team", { p_team_id: alpha, p_to_position: 2 })).toBe("team_not_found");
  });

  it("blocks direct writes to positions and the route", async () => {
    const update = await alphaStudent.from("teams").update({ current_position: 3 }).eq("id", alpha);
    expect(update.error?.code).toBe("42501");
    const insert = await teacher!
      .from("checkpoints")
      .insert({ race_id: raceId, position: 9, title: "Лишний", type: "checkpoint" });
    expect(insert.error?.code).toBe("42501");
    expect(await positionOf(alpha)).toBe(1);
  });

  it("reaches FINISH and stops, then the finished race freezes", async () => {
    await rpc(alphaStudent, "advance_team", { p_team_id: alpha, p_to_position: 2 });
    expect(await rpc(alphaStudent, "advance_team", { p_team_id: alpha, p_to_position: 3 })).toMatchObject({
      position: 3,
      finished: true,
    });
    expect(await rpcError(alphaStudent, "advance_team", { p_team_id: alpha, p_to_position: 4 })).toBe("team_finished");

    await rpc(teacher!, "finish_race", { p_race_id: raceId });
    expect(await rpcError(betaStudent, "advance_team", { p_team_id: beta, p_to_position: 1 })).toBe("race_finished");
    expect(await positionOf(beta)).toBe(0);
  });
});
