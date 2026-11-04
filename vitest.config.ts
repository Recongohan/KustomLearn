import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "src/test/empty.ts") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // PGlite boots WASM Postgres and runs migrations per test file, which can exceed 5s on a loaded CI runner.
    testTimeout: 30_000,
    // Every test, however it is filtered, gets a throwaway in-memory database: never ./data or a real DATABASE_URL.
    env: { PGLITE_DIR: "memory://", DATABASE_URL: "", APP_SECRET: "test-secret" },
  },
});
