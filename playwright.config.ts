import { defineConfig } from "@playwright/test";

// A smoke harness, not a cross-browser matrix: one browser, one project.
// webServer starts the Vite dev server for the run and tears it down after.
// The --config flag goes away with vite.config.js in the cutover commit.
export default defineConfig({
  testDir: "web/e2e",
  use: { baseURL: "http://localhost:5173" },
  webServer: {
    command: "npx vite --config vite.config.ts --port 5173",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
  },
});
