import { defineConfig } from "vitest/config";

// A dedicated config for web/ tests. The project already has app/assets/
// bundled by vite.config.js (root: 'app/assets', for the old front end);
// without this file vitest would auto-load that config and search for tests
// under app/assets/ instead of web/src/, finding none. This file keeps the
// two front ends' build/test tooling independent.
//
// This split (two configs describing two different roots) is deliberately
// temporary, not something to reconcile: vite.config.js serves the OLD front
// end and is deleted once the SPA cutover lands, at which point this file's
// config likely becomes the project's only one.
export default defineConfig({
  test: {
    include: ["web/src/**/*.test.ts"],
    environment: "node",
  },
});
