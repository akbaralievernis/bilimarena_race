import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const root = join(import.meta.dirname, "..", "..");
const migrationsDir = join(root, "supabase", "migrations");

export type TestUser = {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  displayName?: string;
};

type Params = unknown[];

/**
 * A fresh Postgres (PGlite) with the Supabase shim and every migration from
 * supabase/migrations applied in order — the same SQL that runs in production.
 *
 * `until` stops after the migration whose file name starts with that prefix,
 * so a test can seed data and then `applyPendingMigrations()` — exactly what
 * `supabase db push` does to a project that already has data.
 */
export async function createTestDb(options: { until?: string } = {}) {
  const db = new PGlite();
  await db.exec(readFileSync(join(import.meta.dirname, "supabase-shim.sql"), "utf8"));

  const migrations = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const cut = options.until ? migrations.findIndex((file) => file.startsWith(options.until!)) + 1 : migrations.length;
  if (cut === 0) throw new Error(`No migration starts with ${options.until}`);
  let applied = 0;

  async function applyPendingMigrations(limit = migrations.length) {
    for (; applied < limit; applied++) {
      await db.exec(readFileSync(join(migrationsDir, migrations[applied]), "utf8"));
    }
  }
  await applyPendingMigrations(cut);

  async function asRole<T>(
    role: "anon" | "authenticated",
    claims: Record<string, unknown>,
    run: (tx: Transaction) => Promise<T>,
    settings: Record<string, string> = {},
  ): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      for (const [key, value] of Object.entries(settings)) {
        await tx.query(`select set_config($1, $2, true)`, [key, value]);
      }
      await tx.exec(`set local role ${role}`);
      return run(tx);
    });
  }

  function claimsFor(user: TestUser) {
    return {
      sub: user.id,
      role: "authenticated",
      email: user.email ?? "",
      is_anonymous: user.isAnonymous,
      user_metadata: user.displayName ? { display_name: user.displayName } : {},
    };
  }

  return {
    db,

    /** Applies the migrations skipped by `until`. */
    applyPendingMigrations: () => applyPendingMigrations(),

    /** Creates an auth user (as Supabase Auth would). */
    async createUser(options: { anonymous?: boolean; displayName?: string } = {}): Promise<TestUser> {
      const id = randomUUID();
      const email = options.anonymous ? null : `teacher-${id.slice(0, 8)}@example.test`;
      await db.query(
        `insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values ($1, $2, $3, $4)`,
        [id, email, options.anonymous ?? false, JSON.stringify({ display_name: options.displayName })],
      );
      return { id, email, isAnonymous: options.anonymous ?? false, displayName: options.displayName };
    },

    /** Runs SQL as a signed-in user through the `authenticated` role, like PostgREST. */
    async as<T = Record<string, unknown>>(user: TestUser, sql: string, params: Params = [], settings?: Record<string, string>) {
      return asRole("authenticated", claimsFor(user), async (tx) => (await tx.query<T>(sql, params)).rows, settings);
    },

    /** Runs SQL as a request without any session (publishable key only). */
    async asAnon<T = Record<string, unknown>>(sql: string, params: Params = []) {
      return asRole("anon", { role: "anon" }, async (tx) => (await tx.query<T>(sql, params)).rows);
    },

    /** Calls a public RPC function as the given user and returns its value. */
    async rpc<T = unknown>(user: TestUser, fn: string, args: Params = []) {
      const placeholders = args.map((_, index) => `$${index + 1}`).join(", ");
      const rows = await asRole("authenticated", claimsFor(user), async (tx) =>
        (await tx.query<{ result: T }>(`select public.${fn}(${placeholders}) as result`, args)).rows,
      );
      return rows[0].result;
    },

    /** Superuser query for arranging state and asserting results. */
    async admin<T = Record<string, unknown>>(sql: string, params: Params = []) {
      return (await db.query<T>(sql, params)).rows;
    },
  };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/** Asserts that a promise rejects with the given Postgres message or SQLSTATE. */
export async function expectDbError(promise: Promise<unknown>, expected: string | RegExp) {
  try {
    await promise;
  } catch (error) {
    const { message = "", code = "" } = error as { message?: string; code?: string };
    const matches =
      typeof expected === "string" ? message === expected || code === expected : expected.test(message);
    if (!matches) {
      throw new Error(`Expected DB error ${String(expected)}, got [${code}] ${message}`);
    }
    return;
  }
  throw new Error(`Expected DB error ${String(expected)}, but the query succeeded`);
}
