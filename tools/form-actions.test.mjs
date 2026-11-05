import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Every form ends in the one footer (FormActions, or a dialog footer that
// renders it), so Save sits first and on the left everywhere. A form that
// hand-rolls its own button row drifts back to the old mix of orders.

function sources(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sources(path));
    } else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

const files = sources("web/src").map((path) => ({ path, text: readFileSync(path, "utf8") }));
const FOOTER = /\b(FormActions|DialogFooter|AlertDialogFooter)\b/;

test("every file with a submit button uses a form footer", () => {
  const withSubmit = files.filter((file) => file.text.includes('type="submit"'));
  // A floor, so the scan cannot pass by finding nothing.
  assert.ok(withSubmit.length >= 10, `only ${withSubmit.length} files have a submit button`);
  const bare = withSubmit.filter((file) => !FOOTER.test(file.text)).map((file) => file.path);
  assert.deepEqual(bare, []);
});

test("no footer holds a yellow accent button", () => {
  const footers = /<(FormActions|DialogFooter|AlertDialogFooter)[\s\S]*?<\/>/g;
  const withFooter = files.filter(
    (file) => !file.path.includes("components") && FOOTER.test(file.text),
  );
  assert.ok(withFooter.length >= 10, `only ${withFooter.length} files use a footer`);
  const yellow = withFooter
    .filter((file) =>
      (file.text.match(footers) ?? []).some((footer) => footer.includes('variant="accent"')),
    )
    .map((file) => file.path);
  assert.deepEqual(yellow, []);
});
