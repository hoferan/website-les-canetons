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
  },
});
