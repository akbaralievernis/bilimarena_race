import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Need a real Supabase project: `npm run test:integration` / `npm run test:load`.
    exclude: ["tests/integration/**", "tests/load/**"],
    // Database tests boot an in-process Postgres (PGlite) per file.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
