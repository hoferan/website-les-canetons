import { readdirSync } from 'node:fs';
import { defineConfig } from 'vite';

const JS_DIR = 'app/assets/js';
const CSS_DIR = 'app/assets/css';

// session.js is imported by other entries as a shared module (see
// app/assets/js/session.js) — it is never its own <script> tag, so it must
// not be a Vite entry point itself.
const JS_ENTRY_EXCLUDE = new Set(['session.js', 'icons.js']);
// main.css is @imported by every page CSS file — it is never linked
// directly, so it must not be a Vite entry point itself.
const CSS_ENTRY_EXCLUDE = new Set(['main.css']);

const jsEntries = readdirSync(JS_DIR)
  .filter((file) => file.endsWith('.js') && !JS_ENTRY_EXCLUDE.has(file))
  .map((file) => `js/${file}`);

const cssEntries = readdirSync(CSS_DIR)
  .filter((file) => file.endsWith('.css') && !CSS_ENTRY_EXCLUDE.has(file))
  .map((file) => `css/${file}`);

export default defineConfig({
  root: 'app/assets',
  base: '/assets/dist/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    rollupOptions: {
      input: [...jsEntries, ...cssEntries],
    },
  },
});
