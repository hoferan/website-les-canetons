import type { StorybookConfig } from "@storybook/react-vite";

/**
 * The design system's playground (ADR 0047). Only stories under the design
 * system are collected: a story that needs the router, i18n or the session
 * does not belong here, and rendering with no providers is the proof that a
 * component respects the dependency rule.
 *
 * It has its own Vite config (.storybook/vite.config.ts) instead of reading the
 * app's: that one sets `root: "web"`, the dev proxy, the mock and preview modes,
 * none of which a story wants.
 */
const config: StorybookConfig = {
  stories: ["../web/src/design-system/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: { builder: { viteConfigPath: ".storybook/vite.config.ts" } },
  },
  core: { disableTelemetry: true },
};

export default config;
