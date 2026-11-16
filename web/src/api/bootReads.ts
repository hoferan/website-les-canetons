/**
 * The reads every page waits for before it draws anything: the config and the
 * session (SessionProvider), and the content blocks (BlocksProvider).
 *
 * The production shell asks for them itself, with a preload each (see
 * vite.config.ts), so they travel while the bundle downloads instead of after
 * it has run. On a phone that is most of the time to the first heading
 * (#396). The app's own requests then take the preloaded answers.
 *
 * A path here must be exactly the one the app requests, or the preload is
 * wasted and the read happens twice; bootReads.test.ts holds them together.
 * No imports, because vite.config.ts loads this file.
 */
export const BOOT_READS = ["/api/v1/config", "/api/v1/me", "/api/v1/blocks"] as const;
