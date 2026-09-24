import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { verdict } from "./all-green.mjs";

const result = (r, outputs = {}) => ({ result: r, outputs });
const code = (changed) => result("success", { code: changed ? "true" : "false" });

test("every job green on a pull request passes", () => {
  const { ok } = verdict({
    event: "pull_request",
    needs: { changes: code(true), guard: result("success"), e2e: result("success") },
  });
  assert.equal(ok, true);
});

// The case that let #205 merge: one red job among green ones.
test("one failed job fails the whole check", () => {
  const { ok, lines } = verdict({
    event: "pull_request",
    needs: { changes: code(true), guard: result("success"), e2e: result("failure") },
  });
  assert.equal(ok, false);
  assert.ok(lines.some((l) => l.includes("e2e") && l.includes("failure")));
});

test("a cancelled job fails the check", () => {
  const { ok } = verdict({
    event: "pull_request",
    needs: { changes: code(true), e2e: result("cancelled") },
  });
  assert.equal(ok, false);
});

// A docs-only change skips the suites on purpose (see the `changes` job).
test("skipped jobs pass when the change touched docs/ only", () => {
  const { ok } = verdict({
    event: "pull_request",
    needs: { changes: code(false), guard: result("success"), e2e: result("skipped") },
  });
  assert.equal(ok, true);
});

// The skip must be the docs-only one. A job skipped on a code change means a
// job it depends on did not succeed, and passing that would be a green light
// over a suite that never ran.
test("a skipped job on a code change fails the check", () => {
  const { ok } = verdict({
    event: "pull_request",
    needs: { changes: code(true), e2e: result("skipped") },
  });
  assert.equal(ok, false);
});

test("the title check may be skipped on a push, where there is no title", () => {
  const { ok } = verdict({
    event: "push",
    needs: { changes: code(true), "pr-title": result("skipped") },
  });
  assert.equal(ok, true);
});

test("the title check may not be skipped on a pull request", () => {
  const { ok } = verdict({
    event: "pull_request",
    needs: { changes: code(true), "pr-title": result("skipped") },
  });
  assert.equal(ok, false);
});

test("a failed changes job fails the check even if everything after it skipped", () => {
  const { ok } = verdict({
    event: "pull_request",
    needs: { changes: result("failure"), e2e: result("skipped") },
  });
  assert.equal(ok, false);
});

// A mistyped NEEDS in the workflow would otherwise hand this an empty object,
// and "no job failed" would read as green.
test("no jobs at all fails rather than passing vacuously", () => {
  assert.equal(verdict({ event: "pull_request", needs: {} }).ok, false);
});

// The job runs the file, not verdict(). If the entry-point check at the bottom
// stopped matching, the script would import, print nothing and exit 0, and
// all-green would pass every run.
const cli = (needs, event = "pull_request") =>
  spawnSync(process.execPath, [fileURLToPath(new URL("./all-green.mjs", import.meta.url))], {
    env: { ...process.env, NEEDS: JSON.stringify(needs), EVENT: event },
    encoding: "utf8",
  });

test("run as the job runs it, a failed job exits non-zero and is named", () => {
  const run = cli({ changes: code(true), e2e: result("failure") });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /FAIL e2e: failure/);
});

test("run as the job runs it, a green run exits zero", () => {
  assert.equal(cli({ changes: code(true), e2e: result("success") }).status, 0);
});

const ci = parse(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"));
const jobs = Object.keys(ci.jobs);

// all-green is the one required check on main. A job missing from its needs
// can go red and the pull request still merges, which is how #205 landed with
// e2e failing.
test("all-green needs every job in ci.yml", () => {
  const needs = ci.jobs["all-green"].needs;
  const missing = jobs.filter(
    (j) => !["all-green", "deploy-test"].includes(j) && !needs.includes(j),
  );
  assert.deepEqual(missing, []);
});

test("all-green runs even when a job it needs failed", () => {
  assert.equal(ci.jobs["all-green"].if, "always()");
});

test("deploy-test waits on all-green rather than on a list of its own", () => {
  assert.ok(ci.jobs["deploy-test"].needs.includes("all-green"));
});

test("the title check is part of ci.yml, so all-green covers it", () => {
  assert.ok(jobs.includes("pr-title"));
  assert.ok(ci.on.pull_request.types.includes("edited"));
});
