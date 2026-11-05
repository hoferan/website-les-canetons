import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Tailwind 4 sets `cursor: default` on buttons, so a raw <button> shows the
// arrow. jsdom applies no stylesheet, so this reads the source of the rule.
const css = readFileSync("web/src/styles.css", "utf8");

/** The body of every `@layer base { ... }` block, braces balanced. */
function baseLayers(text) {
  const bodies = [];
  const opener = /@layer\s+base\s*\{/g;
  let match;
  while ((match = opener.exec(text))) {
    let depth = 1;
    let end = opener.lastIndex;
    while (depth > 0 && end < text.length) {
      if (text[end] === "{") depth++;
      if (text[end] === "}") depth--;
      end++;
    }
    bodies.push(text.slice(opener.lastIndex, end - 1));
  }
  return bodies;
}

test("every enabled button and role=button gets the hand cursor in the base layer", () => {
  const rule = baseLayers(css).find((body) =>
    /button:not\(:disabled[^{]*\{[^}]*cursor:\s*pointer/.test(body),
  );
  assert.ok(rule, "no @layer base rule gives buttons cursor: pointer");
  assert.match(rule, /\[role="button"\]:not\(:disabled/);
});

test("an aria-disabled control does not get the hand", () => {
  const rule = baseLayers(css).find((body) => /cursor:\s*pointer/.test(body));
  assert.ok(rule);
  // The formatter may fold the two :not() calls into one list.
  assert.match(rule, /:not\([^)]*\[aria-disabled="true"\]/);
});
