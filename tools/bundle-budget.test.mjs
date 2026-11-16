import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { shellScripts, verdict, visitorScripts } from "./bundle-budget.mjs";

// The head Vite writes for a build, shortened: the entry, a modulepreload, and
// the preloads that are not script (a font, a boot read).
const SHELL = `<!doctype html><html><head>
<link rel="preload" href="/assets/bungee.woff2" as="font" type="font/woff2" crossorigin>
<script type="module" crossorigin src="/assets/index-abc.js"></script>
<link rel="modulepreload" crossorigin href="/assets/visitor-def.js">
<link rel="stylesheet" crossorigin href="/assets/visitor-def.css">
<link rel="preload" href="/api/v1/config" as="fetch" crossorigin="use-credentials">
</head><body><div id="root"></div></body></html>`;

test("counts the module script and every modulepreload, nothing else", () => {
  assert.deepEqual(shellScripts(SHELL), ["/assets/index-abc.js", "/assets/visitor-def.js"]);
});

test("ignores a classic script, which a build never writes for the app", () => {
  assert.deepEqual(shellScripts(`<script src="/legacy.js"></script>`), []);
});

test("measures each script gzipped, from the build directory", () => {
  const root = mkdtempSync(join(tmpdir(), "bundle-budget-"));
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "index.html"), SHELL);
  writeFileSync(join(root, "assets", "index-abc.js"), "export {};\n");
  // Incompressible, so its gzipped size stays near its length.
  writeFileSync(
    join(root, "assets", "visitor-def.js"),
    Array.from({ length: 4096 }, (_, i) => ((i * 2654435761) % 4294967296).toString(36)).join(""),
  );

  const scripts = visitorScripts(root);

  assert.deepEqual(
    scripts.map((script) => script.url),
    ["/assets/index-abc.js", "/assets/visitor-def.js"],
  );
  assert.ok(scripts[0].kb < 0.1);
  assert.ok(scripts[1].kb > 10, `expected over 10 KB, got ${scripts[1].kb}`);
});

test("is over budget only above the limit", () => {
  const scripts = [{ kb: 200 }, { kb: 79 }];
  assert.equal(verdict(scripts, 280).over, false);
  assert.equal(verdict(scripts, 279).over, false);
  assert.equal(verdict(scripts, 278.9).over, true);
  assert.equal(verdict(scripts, 280).totalKb, 279);
});
