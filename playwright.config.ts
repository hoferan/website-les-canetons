import { defineConfig } from "@playwright/test";

// A smoke harness, not a cross-browser matrix: one browser, one project.
// webServer starts the Vite dev server for the run and tears it down after.
//
// `--mode mock` loads web/.env.mock, so the run gets MSW's mocked backend and
// needs no Docker — which is what lets CI run these at all. It is a real
// browser against real routing, guards and rendering; it is NOT proof of the
// API contract, and cannot be. That is what the Laravel suite and a manual pass
// against the stack's own :5173 are for.
//
// PORT 5174, NOT 5173, and that is the whole point of this comment. The dev
// stack's `assets` container publishes an UNMOCKED dev server on 5173, and
// `reuseExistingServer` cannot tell the two apart: with the stack up, Playwright
// silently adopts it, `--mode mock` never takes effect, and the suite runs
// against the real API and the real database. It fails on a seeded row count,
// which reads as a broken assertion rather than "you are testing the wrong
// server". A port of its own removes the collision entirely.
const PORT = 5174;

export default defineConfig({
  testDir: "web/e2e",
  use: {
    baseURL: `http://localhost:${PORT}`,

    // A DELIBERATELY WRONG TIMEZONE, matching vitest.config.ts (#177), and a
    // SEPARATE SETTING FROM IT — `TZ` in the environment moves Node, not the
    // browser Playwright drives, so the whole e2e half would keep running in
    // whatever zone the machine has if this line were not here.
    //
    // Same reasoning as there: every formatter in the app pins its own
    // `timeZone`, nothing enforced that, and UTC (CI) and Europe/Zurich (a
    // Fribourg laptop) are both zones where a formatter that lost its pin
    // still renders correctly. New York is five hours west, so it renders the
    // wrong DAY instead — which a spec can see.
    //
    // No spec asserts a formatted date today, so this guards nothing yet. It
    // is here so that the first one to do so is written somewhere the bug is
    // visible, rather than somewhere it is not.
    timezoneId: "America/New_York",

    // PW_CHROMIUM_PATH IS FOR A CLAUDE CODE WEB SESSION, and is unset
    // everywhere else — CI included, which is why this is a spread rather than
    // a value. Such a session ships a Chromium under /opt/pw-browsers at
    // whatever revision the image was built with, and downloading another one
    // is blocked; when that revision is not the one this @playwright/test
    // expects, every run dies on "Executable doesn't exist at
    // .../chromium_headless_shell-<n>/..." and reads as a broken install
    // rather than as a version mismatch. Pointing at the binary that IS there
    // skips the bundled-browser lookup entirely.
    //
    // It takes a PATH, not a flag, so nothing here has to know the revision.
    // docs/web-session.md carries the command.
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  webServer: {
    command: `npx vite --config vite.config.ts --mode mock --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
