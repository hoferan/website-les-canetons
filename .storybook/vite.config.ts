import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The same plugins and aliases as the app's vite.config.ts, and no more. The
// aliases must agree with tsconfig.json, vite.config.ts and vitest.config.ts
// (ADR 0001 lists the four places).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@ds": fileURLToPath(new URL("../web/src/design-system", import.meta.url)),
      "@": fileURLToPath(new URL("../web/src", import.meta.url)),
    },
  },
});
