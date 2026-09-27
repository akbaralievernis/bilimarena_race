import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Integration tests talk to a real Supabase project (see tests/integration).
// Vitest runs in mode "test", so loadEnv reads .env.local (project URL and
// publishable key) and .env.test.local (test teacher credentials). Never part
// of `npm test`; the app itself never loads .env.test*.
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    env: loadEnv(mode, process.cwd(), ""),
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
}));
