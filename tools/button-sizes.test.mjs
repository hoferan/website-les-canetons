// A button's height, padding and text size come from its `size` (sm, md, lg),
// never from classes at the call site (#397). A class like `h-12 px-5` beside
// a size makes that size render differently on one page.
//
// The design system itself and tests are exempt: the primitive defines the
// sizes, and a test may pass anything to check the merge.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const ROOT = "web/src";
const SKIP = [/\.test\.tsx?$/, /\.stories\.tsx$/, /^design-system\//, /^api\/generated\//];
const BUTTONS = new Set(["Button", "ButtonLink", "ActionLink"]);
// Any variant prefix (`sm:`, `hover:`), then a height, padding or text size.
const SIZE_CLASS = /^(?:[\w-]+:)*(?:h-|min-h-|px-|py-|text-(?:xs|sm|base|lg|xl|\d))/;

/** Every .tsx under `root` that the rules apply to, parsed. */
export function sources(root = ROOT) {
  const found = [];
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".tsx")) continue;
    const file = path.join(entry.parentPath, entry.name);
    const relative = path.relative(root, file).split(path.sep).join("/");
    if (SKIP.some((pattern) => pattern.test(relative))) continue;
    const text = readFileSync(file, "utf8");
    found.push({
      name: `${root}/${relative}`,
      source: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
    });
  }
  return found;
}

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/** The string literals anywhere under `node`, `cn("a", cond && "b")` included. */
function strings(node) {
  const found = [];
  walk(node, (inner) => {
    if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) found.push(inner);
  });
  return found;
}

export function tagName(element) {
  return element.tagName.getText();
}

export function attribute(element, name) {
  return element.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.getText() === name,
  );
}

function sizeClassesIn(node, file, source) {
  return strings(node).flatMap((literal) =>
    literal.text
      .split(/\s+/)
      .filter((token) => SIZE_CLASS.test(token))
      .map((token) => {
        const { line } = source.getLineAndCharacterOfPosition(literal.getStart());
        return `${file}:${line + 1}: ${token}`;
      }),
  );
}

/** Size classes passed to a button element or beside a `buttonVariants()` call. */
export function sizeClassOffenders(root = ROOT) {
  const found = [];
  for (const { name, source } of sources(root)) {
    walk(source, (node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        BUTTONS.has(tagName(node))
      ) {
        const className = attribute(node, "className");
        if (className?.initializer)
          found.push(...sizeClassesIn(className.initializer, name, source));
      }
      if (ts.isCallExpression(node)) {
        const isVariants = (arg) =>
          ts.isCallExpression(arg) && arg.expression.getText() === "buttonVariants";
        if (node.arguments.some(isVariants)) {
          for (const arg of node.arguments.filter((arg) => !isVariants(arg))) {
            found.push(...sizeClassesIn(arg, name, source));
          }
        }
      }
    });
  }
  return found;
}

// The dialog footers render a FormActions row of their own.
const ROWS = new Set(["FormActions", "DialogFooter", "AlertDialogFooter"]);
// These default to lg (components/ui/alert-dialog.tsx), so they may omit it.
const LARGE_BY_DEFAULT = new Set(["AlertDialogAction", "AlertDialogCancel"]);

/**
 * Buttons in a form's action row that are not `size="lg"`, those behind a
 * condition (`{draft ? <>…</> : …}`) included.
 */
export function formActionOffenders(root = ROOT) {
  const found = [];
  for (const { name, source } of sources(root)) {
    walk(source, (node) => {
      if (!ts.isJsxElement(node) || !ROWS.has(tagName(node.openingElement))) return;
      for (const child of node.children) {
        walk(child, (inner) => {
          if (!(ts.isJsxOpeningElement(inner) || ts.isJsxSelfClosingElement(inner))) return;
          const tag = tagName(inner);
          if (!BUTTONS.has(tag) && !LARGE_BY_DEFAULT.has(tag)) return;
          const size = attribute(inner, "size")?.initializer;
          if (!size && LARGE_BY_DEFAULT.has(tag)) return;
          if (size && ts.isStringLiteral(size) && size.text === "lg") return;
          const { line } = source.getLineAndCharacterOfPosition(inner.getStart());
          found.push(`${name}:${line + 1}`);
        });
      }
    });
  }
  return found;
}

test("buttons take their height, padding and text size from `size`, not from classes", () => {
  assert.deepEqual(sizeClassOffenders(), [], "Pick a size: sm, md or lg (#397).");
});

test("the alert dialog's own buttons default to large", () => {
  const text = readFileSync("web/src/components/ui/alert-dialog.tsx", "utf8");
  for (const tag of LARGE_BY_DEFAULT) {
    assert.match(text, new RegExp(`function ${tag}\\(\\{[^}]*size = "lg"`), tag);
  }
});

test("every button in a form's action row is large", () => {
  assert.deepEqual(formActionOffenders(), [], 'A form\'s action row is size="lg" (#397).');
});
