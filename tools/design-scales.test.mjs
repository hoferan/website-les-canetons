// Every text size, corner radius and shadow in web/src names a step of the
// scales declared in the theme (#398). Tailwind's own steps outside them are
// cleared there with `--text-*: initial` and the like, so a class such as
// `rounded-xl` now compiles to nothing at all, silently; and an arbitrary value
// like `text-[13px]` bypasses the scale. This guard catches both.
//
// The allowed names are read from the CSS, so the scale has one source.
// web/e2e/scales.spec.ts measures the same scales in a browser, on every
// route. Tests and stories are exempt: a test may pass anything to check a
// merge.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const ROOT = "web/src";
const THEME_FILES = ["web/src/styles.css", "web/src/design-system/tokens/tokens.css"];
const SKIP = [/\.test\.tsx?$/, /\.stories\.tsx$/, /^api\/generated\//, /^mocks\//];

/** The step names each family declares in the theme, `none` included. */
export function declaredSteps(files = THEME_FILES) {
  const steps = { text: new Set(), radius: new Set(["none"]), shadow: new Set(["none"]) };
  for (const file of files) {
    const css = readFileSync(file, "utf8");
    for (const [, family, name] of css.matchAll(/--(text|radius|shadow)-([a-z0-9-]+)\s*:/g)) {
      // `--text-xs--line-height` belongs to its step, it is not one.
      if (!name.includes("--")) steps[family].add(name);
    }
  }
  return steps;
}

/** A class without its variants: `max-xl:data-[x=y]:rounded-t-lg` gives `rounded-t-lg`. */
function utilityOf(token) {
  let depth = 0;
  let cut = -1;
  for (let index = 0; index < token.length; index++) {
    const char = token[index];
    if (char === "[" || char === "(") depth++;
    else if (char === "]" || char === ")") depth--;
    else if (char === ":" && depth === 0) cut = index;
  }
  return token.slice(cut + 1).replace(/^!|!$/g, "");
}

const TAILWIND_TEXT_SIZES = /^text-(xs|sm|base|lg|xl|[2-9]xl)(?:\/\S+)?$/;
const ARBITRARY_TEXT_SIZE = /^text-\[(?:length:)?[\d.]/;
const RADIUS = /^rounded(?:-(s|e|t|r|b|l|ss|se|ee|es|tl|tr|br|bl))?(?:-(.+))?$/;
const SHADOW = /^shadow(?:-(.+))?$/;

/** Why `utility` is off the scale, or null when it is on it or is no size at all. */
export function offence(utility, steps) {
  const text = TAILWIND_TEXT_SIZES.exec(utility);
  if (text) return steps.text.has(text[1]) ? null : "a text size the scale does not have";
  if (ARBITRARY_TEXT_SIZE.test(utility)) return "an arbitrary text size";

  const radius = RADIUS.exec(utility);
  if (radius) {
    const name = radius[2];
    if (name === undefined) return "a radius with no step named";
    // Derived from the scale: a corner that inherits its parent's, or a
    // step minus a border, so an inner edge meets the outer one.
    if (name === "[inherit]" || /^\[calc\(var\(--radius-[a-z]+\)-\d+px\)\]$/.test(name)) {
      return null;
    }
    if (name.startsWith("[") || name.startsWith("(")) return "an arbitrary radius";
    return steps.radius.has(name) ? null : "a radius the scale does not have";
  }

  const shadow = SHADOW.exec(utility);
  if (shadow) {
    const name = shadow[1];
    if (name === undefined) return "a shadow with no step named";
    return steps.shadow.has(name) ? null : "a shadow the scale does not have";
  }
  return null;
}

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/** Every class-like token in string and template literals under `root`, off the scale. */
export function offenders(root = ROOT, steps = declaredSteps()) {
  const found = [];
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
    const file = path.join(entry.parentPath, entry.name);
    const relative = path.relative(root, file).split(path.sep).join("/");
    if (SKIP.some((pattern) => pattern.test(relative))) continue;
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      entry.name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    walk(source, (node) => {
      if (
        !ts.isStringLiteral(node) &&
        !ts.isNoSubstitutionTemplateLiteral(node) &&
        !ts.isTemplateHead(node) &&
        !ts.isTemplateMiddle(node) &&
        !ts.isTemplateTail(node)
      ) {
        return;
      }
      for (const token of node.text.split(/\s+/)) {
        const why = token && offence(utilityOf(token), steps);
        if (!why) continue;
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        found.push(`${root}/${relative}:${line + 1}: ${token} (${why})`);
      }
    });
  }
  return found;
}

test("every text size, radius and shadow in web/src is a step of the scales", () => {
  assert.deepEqual(offenders(), []);
});

test("the theme declares the scales the guard checks against", () => {
  const steps = declaredSteps();
  assert.deepEqual([...steps.text].sort(), [
    "2xl",
    "3xl",
    "4xl",
    "5xl",
    "8xl",
    "9xl",
    "base",
    "lg",
    "sm",
    "xl",
    "xs",
  ]);
  assert.deepEqual([...steps.radius].sort(), [
    "button",
    "control",
    "full",
    "lg",
    "md",
    "none",
    "pill",
    "sm",
    "surface",
  ]);
  assert.deepEqual([...steps.shadow].sort(), [
    "none",
    "overlay",
    "raised",
    "raised-pressed",
    "raised-sm",
  ]);
});

test("the guard finds each kind of stray, behind variants and in templates", () => {
  const root = mkdtempSync(path.join(tmpdir(), "design-scales-"));
  mkdirSync(path.join(root, "pages"));
  writeFileSync(
    path.join(root, "pages", "Stray.tsx"),
    [
      'export const a = "text-[13px] sm:text-6xl rounded-xl max-xl:rounded-t-[18px] rounded";',
      "export const b = `shadow-lg ${a} data-[state=on]:shadow`;",
      'export const ok = "text-sm text-ink rounded-surface rounded-t-lg shadow-raised shadow-none";',
      'export const derived = "after:rounded-[inherit] rounded-t-[calc(var(--radius-surface)-3px)]";',
    ].join("\n"),
  );
  const steps = {
    text: new Set(["sm"]),
    radius: new Set(["none", "lg", "surface"]),
    shadow: new Set(["none", "raised"]),
  };
  const found = offenders(root, steps).map((line) => line.split(": ")[1].split(" (")[0]);
  assert.deepEqual(found, [
    "text-[13px]",
    "sm:text-6xl",
    "rounded-xl",
    "max-xl:rounded-t-[18px]",
    "rounded",
    "shadow-lg",
    "data-[state=on]:shadow",
  ]);
});
