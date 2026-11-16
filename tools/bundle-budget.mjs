// Fails if the script a visitor downloads outgrows the Lighthouse budget.
//
// WHAT IT COUNTS. The scripts the built shell loads before anything else: its
// module script and every modulepreload Vite writes beside it, gzipped as the
// production host serves them. That is the visitor's bundle. A chunk loaded
// on demand (a members' page, an editor) is not in the shell and does not
// count, which is the point: #396 moved those out, and this keeps them out.
//
// WHY NOT LIGHTHOUSE. tools/lighthouse.mjs reports the same figure from a
// browser, but it runs Chrome against a mocked API and its timings vary, so
// it only warns. This number comes from the files alone, is the same on every
// run, and can fail CI's build job. The two share BUDGET.scriptKb.
//
// Run after a build: `npm run budget:js` reads dist/build/, or pass another
// output directory.

import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

import { BUDGET } from "./lighthouse.mjs";

/** Every script the shell loads at once: its module scripts and modulepreloads. */
export function shellScripts(html) {
  const tags = html.match(/<(script|link)\b[^>]*>/g) ?? [];
  const urls = [];
  for (const tag of tags) {
    const attr = (name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
    if (tag.startsWith("<script") && attr("type") === "module" && attr("src")) {
      urls.push(attr("src"));
    } else if (tag.startsWith("<link") && attr("rel") === "modulepreload" && attr("href")) {
      urls.push(attr("href"));
    }
  }
  return urls;
}

/** Each of those scripts with its gzipped size in KB, read from the build in `root`. */
export function visitorScripts(root) {
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  return shellScripts(html).map((url) => {
    const file = path.join(root, url.replace(/^\//, ""));
    return { url, kb: gzipSync(readFileSync(file)).length / 1024 };
  });
}

/** The total against the budget, and whether it is over. */
export function verdict(scripts, maxKb = BUDGET.scriptKb.max) {
  const totalKb = scripts.reduce((sum, script) => sum + script.kb, 0);
  return { totalKb, maxKb, over: totalKb > maxKb };
}

function main() {
  const root = path.resolve(process.argv[2] ?? "dist/build");
  const scripts = visitorScripts(root);
  for (const { url, kb } of scripts) console.log(`${kb.toFixed(1).padStart(7)} KB  ${url}`);
  const { totalKb, maxKb, over } = verdict(scripts);
  console.log(`${totalKb.toFixed(1).padStart(7)} KB  visitor script, gzipped (budget ${maxKb} KB)`);
  if (over) {
    console.error(
      `The visitor's script is ${totalKb.toFixed(1)} KB gzipped, over the ${maxKb} KB budget ` +
        "(BUDGET.scriptKb in tools/lighthouse.mjs). Load the new code on demand, as " +
        "web/src/routes.tsx and web/src/lib/lazy.tsx do, or raise the budget on purpose.",
    );
    process.exitCode = 1;
  }
}

// The CLI. Guarded so that importing this module from the test does not run it.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
