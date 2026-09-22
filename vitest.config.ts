import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// A dedicated config for web/ tests, kept separate from vite.config.ts.
//
// It originally existed because the repo also carried vite.config.js for the
// OLD front end, and without this file vitest auto-loaded that config and
// searched app/assets/ for tests, finding none. That front end is gone as of
// the SPA cutover, so the original reason has lapsed and these two configs
// could be merged -- but that is sub-project B's business, not a side effect of
// a mobile pass.
//
// While it exists it MUST carry the same `@/` alias as vite.config.ts and
// tsconfig.json. Vitest does not read vite.config.ts when this file is present,
// so omitting the alias here fails every test that imports a vendored shadcn
// component while `npm run build` stays perfectly green.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./web/src", import.meta.url)),
    },
  },
  test: {
    include: ["web/src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["web/src/setupTests.ts"],

    // A DELIBERATELY WRONG TIMEZONE, and the wrongness is the point (#177).
    //
    // Every date formatter in the app pins its own `timeZone` -- an invariant
    // #161 established and web/src/lib/date.ts states in a docblock. Nothing
    // enforced it, because nothing pinned a zone for the test run: the suite
    // inherited whatever the machine had, which is UTC on CI and Europe/Zurich
    // on a Fribourg laptop. Both are zones where reading the ambient zone and
    // pinning Europe/Zurich agree, so a formatter that lost its pin would
    // render correctly here and wrongly in the Americas, and no test would say
    // so. #161's own guard died of exactly this -- it passed for its whole life
    // whether or not the code under it was right.
    //
    // America/New_York is five hours west and observes DST, so a formatter
    // that reads the ambient zone renders the wrong DAY for a late-evening UTC
    // instant, not merely the wrong hour. Europe/Zurich would have been the
    // worst choice available: it agrees with the one audience that cannot see
    // the bug.
    //
    // Set here rather than in the npm script because `TZ=... vitest` is not a
    // thing on Windows, and this repo is developed from PowerShell.
    env: { TZ: "America/New_York" },
  },
});
