import { defineConfig } from "@playwright/test";

import base from "./playwright.config";

// The screenshot sweep (#42): the e2e config's server, port and browser
// settings, pointed at web/screenshots instead of web/e2e. A config of its own
// so that `npm run test:e2e` never spends a minute taking pictures.
export default defineConfig({
  ...base,
  testDir: "web/screenshots",
  // One retry in CI, for a rare failure to land on the URL that local runs
  // could not reproduce. A page that really renders the wrong thing fails
  // both tries.
  retries: process.env.CI ? 1 : 0,
  use: {
    ...base.use,
    // The band's own zone. The e2e config runs in New York on purpose, to
    // catch a formatter that lost its pinned zone, but these pictures are for
    // a reviewer, and the souper at 00:30 reads as a bug.
    timezoneId: "Europe/Zurich",
  },
});
