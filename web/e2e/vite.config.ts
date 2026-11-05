import { defineConfig } from "vite";

import base from "../../vite.config";

/**
 * The dev server Playwright starts: the root config with the file watcher off.
 *
 * The mocked backend keeps its data in the page, and the mocked login sits in
 * sessionStorage. With the watcher on, editing a file under web/ while the
 * suite runs makes Vite reload every open page, so a test keeps its login and
 * loses its data. That is how #348 exported a site with 0 blocks one step
 * after saving one. Without a watcher Vite never hears of the edit, and the
 * run keeps serving the code it started with.
 *
 * The root config is a function of the mode (its preview mode is the PR
 * preview, #353), so it is called here with this run's mode and env, then
 * the result is spread. Spread rather than merged because mergeConfig skips
 * null values: it would drop `watch: null` and leave the watcher on.
 *
 * A server already listening on the port is reused instead
 * (playwright.config.ts), and that one still reloads.
 */
export default defineConfig((env) => {
  const config = base(env);

  return { ...config, server: { ...config.server, watch: null } };
});
