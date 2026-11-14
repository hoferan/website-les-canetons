// Does this change need the pipeline? The verdict behind ci.yml's `changes`
// job, which feeds it `git diff --name-only` on stdin.
//
// `code=false` skips the build, both suites and the TEST deploy; all-green
// accepts those skips (tools/all-green.mjs). `guard` runs regardless.
//
// Every unknown fails towards running: an empty diff runs everything, and so
// does one file outside the list.

import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * What a change may touch and still skip the pipeline. A path goes here only
 * if no CI job reads it and it never reaches the artifact, so the pipeline
 * could not catch a mistake in it. A trailing "/" is a directory; anything
 * else names one file. lighthouse.yml's `paths-ignore` mirrors this list
 * (tools/ci-changes.test.mjs).
 *
 * Kept OUT on purpose:
 *   - .github/workflows/, which is what the pipeline runs.
 *   - CLAUDE.md, README.md and staging/README.md. CLAUDE.md is the
 *     instructions every session loads, and being wrong about it is not the
 *     same kind of cheap as being wrong about a file under docs/.
 *   - staging/ and config/, read by tools/build-overlays.mjs and its tests.
 */
export const SKIPPABLE = [
  "docs/",
  // Claude Code skills, hooks and settings: only sessions read them.
  ".claude/",
  // A local pre-commit hook.
  ".husky/",
  // Read by GitHub itself, never by a job.
  ".github/ISSUE_TEMPLATE/",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/labels.md",
  ".github/dependabot.yml",
];

const skippable = (file) =>
  SKIPPABLE.some((p) => (p.endsWith("/") ? file.startsWith(p) : file === p));

/**
 * @param {string[]} files changed paths, relative to the repository root
 * @returns {boolean} whether the build, the suites and the deploy must run
 */
export function needsPipeline(files) {
  return files.length === 0 || !files.every(skippable);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const files = readFileSync(0, "utf8").split("\n").filter(Boolean);
  const code = needsPipeline(files);
  console.log(
    files.length === 0
      ? "Empty diff — running the full pipeline."
      : code
        ? "Result: code changed — running the full pipeline."
        : `Result: only paths in tools/ci-changes.mjs's SKIPPABLE — skipping the build, the suites and the deploy.`,
  );
  const line = `code=${code}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, line);
  else process.stdout.write(line);
}
