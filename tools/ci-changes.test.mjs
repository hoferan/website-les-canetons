import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { SKIPPABLE, needsPipeline } from "./ci-changes.mjs";

test("a change under docs/ only skips the pipeline", () => {
  assert.equal(needsPipeline(["docs/adr/0001-x.md", "docs/traps.md"]), false);
});

test("a change to the Claude Code skills only skips the pipeline", () => {
  assert.equal(needsPipeline([".claude/skills/whats-next/roadmap.mjs"]), false);
});

test("a change to GitHub's issue and PR templates, labels or Dependabot only skips it", () => {
  assert.equal(
    needsPipeline([
      ".github/ISSUE_TEMPLATE/bug_report.md",
      ".github/PULL_REQUEST_TEMPLATE.md",
      ".github/labels.md",
      ".github/dependabot.yml",
    ]),
    false,
  );
});

test("a change to the local git hook only skips the pipeline", () => {
  assert.equal(needsPipeline([".husky/pre-commit"]), false);
});

test("one file outside the list runs the pipeline", () => {
  assert.equal(needsPipeline(["docs/traps.md", "web/src/main.tsx"]), true);
});

// A workflow change is exactly what the pipeline has to run against.
test("a workflow change runs the pipeline", () => {
  assert.equal(needsPipeline([".github/workflows/ci.yml"]), true);
});

// Kept out on purpose: CLAUDE.md is what every session loads, and the
// READMEs are the runbooks (see the comment on SKIPPABLE).
test("CLAUDE.md and the READMEs run the pipeline", () => {
  for (const file of ["CLAUDE.md", "README.md", "staging/README.md"]) {
    assert.equal(needsPipeline([file]), true, file);
  }
});

// A prefix is a directory, not the start of a name.
test("a sibling whose name only starts like a listed directory runs the pipeline", () => {
  assert.equal(needsPipeline(["docs-old/x.md"]), true);
  assert.equal(needsPipeline([".claudeignore"]), true);
});

// Nothing to diff means nothing is known, and an unknown fails towards running.
test("an empty change runs the pipeline", () => {
  assert.equal(needsPipeline([]), true);
});

const script = fileURLToPath(new URL("./ci-changes.mjs", import.meta.url));
const cli = (stdin) =>
  spawnSync(process.execPath, [script], {
    input: stdin,
    env: { ...process.env, GITHUB_OUTPUT: "" },
    encoding: "utf8",
  });

// The job runs the file, not needsPipeline(). If the entry-point check stopped
// matching, it would print nothing and the step would have no output at all.
test("run as the job runs it, a skippable change prints code=false", () => {
  const run = cli(".claude/skills/x.md\ndocs/a.md\n");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /^code=false$/m);
});

test("run as the job runs it, a code change prints code=true", () => {
  const run = cli("web/src/main.tsx\n");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /^code=true$/m);
});

const workflow = (name) =>
  parse(readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8"));

// The decision lives in this script; the workflow only feeds it the diff.
test("ci.yml's changes job classifies with this script", () => {
  const steps = workflow("ci.yml").jobs.changes.steps;
  assert.ok(steps.some((s) => String(s.run ?? "").includes("node tools/ci-changes.mjs")));
});

// lighthouse.yml filters on its trigger instead, which is safe there because
// nothing waits on it. Its list must be this one, or the two drift apart.
test("lighthouse.yml ignores exactly the paths listed here", () => {
  const globs = SKIPPABLE.map((p) => (p.endsWith("/") ? `${p}**` : p));
  const on = workflow("lighthouse.yml").on;
  assert.deepEqual(on.push["paths-ignore"], globs);
  assert.deepEqual(on.pull_request["paths-ignore"], globs);
});
