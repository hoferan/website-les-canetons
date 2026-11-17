import { fileURLToPath } from "node:url";

import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";

import storybookVite from "./.storybook/vite.config.js";

// Runs every design-system story as a test in a real Chromium: the story must
// render, its `play` function must pass, and axe must find no violation
// (`a11y.test: "error"` in .storybook/preview.ts). Contrast is the reason for
// the real browser, since jsdom cannot compute it.
//
// A config of its own, not a project in vitest.config.ts: that suite runs in
// jsdom under a deliberately wrong time zone, and neither belongs here.
// `npm run test:web` is unaffected.
//
// PW_CHROMIUM_PATH is for a Claude Code web session, where Playwright's own
// download is blocked; playwright.config.ts reads it the same way.
const executablePath = process.env.PW_CHROMIUM_PATH;

export default mergeConfig(
  storybookVite,
  defineConfig({
    plugins: [
      storybookTest({ configDir: fileURLToPath(new URL("./.storybook", import.meta.url)) }),
    ],
    test: {
      name: "storybook",
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(executablePath ? { launchOptions: { executablePath } } : {}),
        instances: [{ browser: "chromium" }],
      },
    },
  }),
);
