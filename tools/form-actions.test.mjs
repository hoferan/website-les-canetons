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
// JSX usage, not the bare word, so an import alone does not count.
const FOOTER_USE = /<(FormActions|DialogFooter|AlertDialogFooter)\b/;
const FOOTER_BLOCK = /<(FormActions|DialogFooter|AlertDialogFooter)\b[\s\S]*?<\/\1>/g;

/** Every footer element in the app code (not the ui components, not tests). */
function footers() {
  return files
    .filter((file) => !file.path.includes("components\\ui") && !file.path.includes("components/ui"))
    .flatMap((file) =>
      (file.text.match(FOOTER_BLOCK) ?? []).map((block) => ({ path: file.path, block })),
    );
}

test("every file with a submit button uses a form footer", () => {
  const withSubmit = files.filter((file) => file.text.includes('type="submit"'));
  // A floor, so the scan cannot pass by finding nothing.
  assert.ok(withSubmit.length >= 10, `only ${withSubmit.length} files have a submit button`);
  const bare = withSubmit.filter((file) => !FOOTER_USE.test(file.text)).map((file) => file.path);
  assert.deepEqual(bare, []);
});

test("no footer holds a yellow accent button", () => {
  const found = footers();
  assert.ok(found.length >= 25, `only ${found.length} footers matched`);
  const yellow = found
    .filter(({ block }) => block.includes('variant="accent"'))
    .map(({ path }) => path);
  assert.deepEqual(yellow, []);
});

test("a dialog footer lists the action before Cancel", () => {
  const dialogs = footers().filter(({ block }) => block.startsWith("<AlertDialogFooter"));
  assert.ok(dialogs.length >= 8, `only ${dialogs.length} dialog footers matched`);
  const cancelFirst = dialogs
    .filter(({ block }) => {
      // Drop the opening tag and any leading JSX comments, then look at the
      // first element.
      const body = block
        .replace(/^<AlertDialogFooter[^>]*>/, "")
        .replace(/^(\s*\{\/\*[\s\S]*?\*\/\}\s*)+/, "")
        .trimStart();
      return body.startsWith("<AlertDialogCancel");
    })
    .map(({ path }) => path);
  assert.deepEqual(cancelFirst, []);
});
