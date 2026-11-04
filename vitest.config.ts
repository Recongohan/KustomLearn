import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "src/test/empty.ts") } },
  // PGlite boots WASM Postgres and runs migrations per test file, which can exceed 5s on a loaded CI runner.
  test: { environment: "node", include: ["src/**/*.test.ts"], testTimeout: 30_000 },
});
