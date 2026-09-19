import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60000,
  use: { baseURL: "http://localhost:3100", viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure" },
  webServer: { command: "bun run dev --port 3100", url: "http://localhost:3100", reuseExistingServer: !process.env.CI, timeout: 120000 },
});
