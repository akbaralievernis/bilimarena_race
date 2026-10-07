import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, expect, it } from "vitest";
import { cleanUp, env, isConfigured, rpc, signInStudent, signInTeacher } from "../integration/support";

/*
 * Stage 6: a class-sized race against the real Supabase project.
 *
 * Every simulated phone behaves like the app (components/lobby/use-lobby.ts):
 * it listens on the private channel race:<id>, re-reads get_lobby() 120 ms
 * after a signal (one request at a time) and polls every 20–25 s while the
 * race runs. Students of a team "think" for a few seconds and answer the
 * current task — mostly right, sometimes wrong — until the team finishes.
 *
 * Measured: sign-in and join time, submit_answer and get_lobby latency, how
 * long it takes until every other phone sees a team move, and errors. At the
 * end the teacher's report must count exactly the answers the server accepted.
 *
 *   npm run test:load                      30 students, 6 teams
 *   LOAD_STUDENTS=60 LOAD_TEAMS=10 npm run test:load
 *
 * Each student is a new anonymous user: raise Authentication → Rate Limits →
 * "Anonymous sign-ins" first (default 30 per hour per IP).
 */

const STUDENTS = Number(process.env.LOAD_STUDENTS ?? 30);
const TEAMS = Number(process.env.LOAD_TEAMS ?? 6);
const CHECKPOINTS = Number(process.env.LOAD_CHECKPOINTS ?? 5);
const RACE_LIMIT_MS = Number(process.env.LOAD_RACE_SECONDS ?? 150) * 1000;
const WRONG_SHARE = 0.3;
const THINK_MS: [number, number] = [2_000, 7_000];
const SIGN_IN_CONCURRENCY = 5;

const RUN_ID = randomUUID().slice(0, 6);
const answerFor = (index: number) => `Ответ ${index + 1}`;
const TASKS = Array.from({ length: CHECKPOINTS }, (_, index) =>
  index % 2 === 0
    ? { type: "single_choice", question: `Вопрос ${index + 1}`, options: ["А", "Б", "В"], correctOption: index % 3 }
    : { type: "short_answer", question: `Вопрос ${index + 1}`, correctAnswer: answerFor(index) },
);
const rightAnswer = (index: number) => (index % 2 === 0 ? String(index % 3) : answerFor(index));
const wrongAnswer = (index: number) => (index % 2 === 0 ? String((index + 1) % 3) : "не знаю");

type Lobby = {
  race: { code: string; status: string };
  viewer: { teamId: string | null };
  currentTask: { id: string; checkpointPosition: number; cooldownSeconds: number } | null;
  teams: { id: string; position: number; finishOrder: number | null }[];
  participants: { id: string; displayName: string }[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const between = ([min, max]: [number, number]) => min + Math.random() * (max - min);

function stats(values: number[]) {
  if (values.length === 0) return { n: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]);
  return { n: values.length, p50: at(0.5), p95: at(0.95), max: Math.round(sorted.at(-1)!) };
}

/** Runs async jobs with at most `limit` at a time, in order. */
async function pool<T>(count: number, limit: number, job: (index: number) => Promise<T>) {
  const results: T[] = new Array(count);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, count) }, async () => {
      while (next < count) {
        const index = next++;
        results[index] = await job(index);
      }
    }),
  );
  return results;
}

const metrics = {
  signIn: [] as number[],
  join: [] as number[],
  lobby: [] as number[],
  submit: [] as number[],
  /** From the server accepting a move to another phone showing it. */
  visible: [] as number[],
  signals: 0,
  polls: 0,
  accepted: 0,
  expectedRejections: 0,
  errors: [] as string[],
};

/** One phone: the same refresh rules as useLobby(). */
class Phone {
  lobby: Lobby | null = null;
  private inFlight: Promise<void> | null = null;
  private rerun = false;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private poll: ReturnType<typeof setTimeout> | undefined;
  /** team id → position the server confirmed, with the time of the answer. */
  static moves = new Map<string, { position: number; at: number }[]>();
  private seen = new Map<string, number>();

  constructor(
    readonly client: SupabaseClient,
    readonly raceId: string,
  ) {}

  async connect() {
    await this.client.realtime.setAuth();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Realtime: подписка не удалась за 15 с")), 15_000);
      this.client
        .channel(`race:${this.raceId}`, { config: { private: true } })
        .on("broadcast", { event: "lobby_changed" }, () => {
          metrics.signals++;
          clearTimeout(this.debounce);
          this.debounce = setTimeout(() => void this.refresh(), 120);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            clearTimeout(timer);
            resolve();
          }
        });
    });
    const tick = () => {
      metrics.polls++;
      void this.refresh();
      this.poll = setTimeout(tick, 20_000 + Math.random() * 5_000);
    };
    this.poll = setTimeout(tick, 20_000 + Math.random() * 5_000);
    await this.refresh();
  }

  refresh(): Promise<void> {
    if (this.inFlight) {
      this.rerun = true;
      return this.inFlight;
    }
    const run = async () => {
      do {
        this.rerun = false;
        const started = performance.now();
        const { data, error } = await this.client.rpc("get_lobby", { p_race_id: this.raceId });
        metrics.lobby.push(performance.now() - started);
        if (error) {
          metrics.errors.push(`get_lobby: ${error.message}`);
        } else {
          this.lobby = data as Lobby;
          this.noteMoves(Date.now());
        }
      } while (this.rerun);
    };
    this.inFlight = run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private noteMoves(now: number) {
    for (const team of this.lobby!.teams) {
      const before = this.seen.get(team.id) ?? 0;
      if (team.position <= before) continue;
      this.seen.set(team.id, team.position);
      for (const move of Phone.moves.get(team.id) ?? []) {
        if (move.position > before && move.position <= team.position) metrics.visible.push(now - move.at);
      }
    }
  }

  stop() {
    clearTimeout(this.debounce);
    clearTimeout(this.poll);
  }
}

let teacher: SupabaseClient | undefined;
let raceId: string | undefined;
const clients: SupabaseClient[] = [];
const phones: Phone[] = [];

afterAll(async () => {
  phones.forEach((phone) => phone.stop());
  await cleanUp(teacher, raceId, clients);
}, 120_000);

it.skipIf(!isConfigured)(
  `a class of ${STUDENTS} students in ${TEAMS} teams finishes a race`,
  async () => {
    console.log(`\nНагрузка: ${env.url} — ${STUDENTS} учеников, ${TEAMS} команд, ${CHECKPOINTS} чекпоинтов`);
    teacher = await signInTeacher();
    clients.push(teacher);
    raceId = await rpc<string>(teacher, "create_race", {
      p_title: `Нагрузка ${RUN_ID}`,
      p_description: null,
      p_checkpoints: TASKS.map((_, index) => `Точка ${index + 1}`),
      p_tasks: TASKS,
    });
    const { race } = await rpc<Lobby>(teacher, "get_lobby", { p_race_id: raceId });
    const teamIds: string[] = [];
    for (let index = 0; index < TEAMS; index++) {
      teamIds.push(await rpc<string>(teacher, "create_team", { p_race_id: raceId, p_name: `Команда ${index + 1}` }));
    }

    // Sign-in and join, a few phones at a time — like a class typing the code.
    const students = await pool(STUDENTS, SIGN_IN_CONCURRENCY, async (index) => {
      let started = performance.now();
      const client = await signInStudent();
      metrics.signIn.push(performance.now() - started);
      clients.push(client);
      started = performance.now();
      await rpc(client, "join_race", { p_code: race.code, p_display_name: `Ученик ${index + 1}` });
      metrics.join.push(performance.now() - started);
      return client;
    });

    const { participants } = await rpc<Lobby>(teacher, "get_lobby", { p_race_id: raceId });
    const seat = new Map(participants.map((participant) => [participant.displayName, participant.id]));
    await pool(STUDENTS, 5, (index) =>
      rpc(teacher!, "assign_participant", {
        p_participant_id: seat.get(`Ученик ${index + 1}`),
        p_team_id: teamIds[index % TEAMS],
      }),
    );

    const teacherPhone = new Phone(teacher, raceId);
    phones.push(teacherPhone, ...students.map((client) => new Phone(client, raceId!)));
    await pool(phones.length, 10, (index) => phones[index].connect());
    console.log(`Подключены: ${phones.length} устройств (Realtime + get_lobby)`);

    await rpc(teacher, "start_race", { p_race_id: raceId });
    const startedAt = Date.now();
    await Promise.all(phones.map((phone) => phone.refresh()));

    const play = async (phone: Phone, teamId: string) => {
      while (Date.now() - startedAt < RACE_LIMIT_MS) {
        await sleep(between(THINK_MS));
        const task = phone.lobby?.currentTask;
        const own = phone.lobby?.teams.find((team) => team.id === teamId);
        if (own?.finishOrder) return;
        if (!task || task.cooldownSeconds > 0) {
          await phone.refresh();
          continue;
        }
        const index = task.checkpointPosition - 1;
        const answer = Math.random() < WRONG_SHARE ? wrongAnswer(index) : rightAnswer(index);
        const started = performance.now();
        const { data, error } = await phone.client.rpc("submit_answer", {
          p_team_id: teamId,
          p_task_id: task.id,
          p_answer: answer,
        });
        metrics.submit.push(performance.now() - started);
        if (error) {
          // A teammate answered first or the team is paused: normal in a real class.
          if (["answer_cooldown", "task_not_current", "team_finished"].includes(error.message)) {
            metrics.expectedRejections++;
          } else {
            metrics.errors.push(`submit_answer: ${error.message}`);
          }
          await phone.refresh();
          continue;
        }
        const result = data as { moved: boolean; position: number; finished: boolean; alreadyPassed: boolean };
        if (!result.alreadyPassed) metrics.accepted++;
        if (result.moved) {
          const list = Phone.moves.get(teamId) ?? [];
          list.push({ position: result.position, at: Date.now() });
          Phone.moves.set(teamId, list);
        }
        if (result.finished) return;
      }
    };
    await Promise.all(students.map((_, index) => play(phones[index + 1], teamIds[index % TEAMS])));
    const raceSeconds = Math.round((Date.now() - startedAt) / 1000);

    // Let the last signals arrive, then close the race.
    await sleep(3_000);
    await rpc(teacher, "finish_race", { p_race_id: raceId });
    await sleep(2_000);
    phones.forEach((phone) => phone.stop());

    const report = await rpc<{ tasks: { attempts: number }[]; teams: { finishOrder: number | null }[] }>(
      teacher,
      "get_race_report",
      { p_race_id: raceId },
    );
    const recorded = report.tasks.reduce((sum, task) => sum + task.attempts, 0);
    const finished = report.teams.filter((team) => team.finishOrder !== null).length;

    const table = {
      "вход (анонимно), мс": stats(metrics.signIn),
      "подключение по коду, мс": stats(metrics.join),
      "get_lobby, мс": stats(metrics.lobby),
      "submit_answer, мс": stats(metrics.submit),
      "ход виден на других телефонах, мс": stats(metrics.visible),
    };
    console.table(table);
    const lobbyRate = (metrics.lobby.length / Math.max(1, raceSeconds)).toFixed(1);
    console.log(
      [
        `Гонка: ${raceSeconds} с, финишировали ${finished} из ${TEAMS} команд`,
        `Ответов принято: ${metrics.accepted} (в отчёте ${recorded}), штатных отказов (пауза / уже прошли): ${metrics.expectedRejections}`,
        `Сигналов Realtime получено: ${metrics.signals}, фоновых опросов: ${metrics.polls}, get_lobby в среднем ${lobbyRate}/с`,
        `Ошибок: ${metrics.errors.length}${metrics.errors.length ? ` — ${[...new Set(metrics.errors)].slice(0, 5).join("; ")}` : ""}`,
      ].join("\n"),
    );

    expect(metrics.errors).toEqual([]);
    expect(recorded).toBe(metrics.accepted);
    expect(finished).toBeGreaterThan(0);
    // Everyone sees a move within a few seconds (polling would take 20+ s).
    expect(stats(metrics.visible).p95).toBeLessThan(5_000);
  },
  15 * 60_000,
);
