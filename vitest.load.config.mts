import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Load test (tests/load): a class-sized race against a real Supabase project.
// Same env files as the integration tests; run by hand, never in `npm test`.
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/load/**/*.test.ts"],
    env: loadEnv(mode, process.cwd(), ""),
    fileParallelism: false,
    hookTimeout: 120_000,
  },
}));
