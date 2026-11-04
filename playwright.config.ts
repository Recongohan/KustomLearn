import { defineConfig, devices } from "@playwright/test";

// End-to-end run of the core flow on the fixture course: no API key, no network calls to Anthropic.
// Needs `npm run build` first. The app and the Inngest dev server start here, on a throwaway database.
const PORT = 3210;
const DB = `${process.env.RUNNER_TEMP ?? "/tmp"}/kl-e2e-${Date.now()}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", testMatch: "core.spec.ts", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "phone", testMatch: "phone.spec.ts", dependencies: ["desktop"], use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: `npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      env: { KL_FAKE_AI: "1", APP_SECRET: "e2e-secret", PGLITE_DIR: `${DB}/pglite`, INNGEST_DEV: "1", INNGEST_BASE_URL: "http://localhost:8288" },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx inngest-cli dev -u http://localhost:${PORT}/api/inngest --no-discovery`,
      url: "http://localhost:8288",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
