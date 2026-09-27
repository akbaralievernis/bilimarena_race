import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Needs a real Supabase project: run with `npm run test:integration`.
    exclude: ["tests/integration/**"],
    // Database tests boot an in-process Postgres (PGlite) per file.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
