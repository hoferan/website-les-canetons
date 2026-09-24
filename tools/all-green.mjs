// The verdict behind ci.yml's `all-green` job, the one required check on main.
//
// It reads `toJSON(needs)`, so the job's `needs:` list is the only list of jobs
// anywhere: a job added there is checked here without a second edit. The
// required-check list in the ruleset used to be that second list, and it lacked
// e2e, which is how #205 merged with e2e red.
//
// A job passes when it succeeded. It may also be skipped in two cases, both of
// which the workflow does on purpose:
//
//   - the `changes` job found a docs-only change, which skips the suites, and
//   - `pr-title` on a push, where there is no pull request title to check.
//
// Any other skip means a job it depended on did not succeed, so it fails.

import { pathToFileURL } from "node:url";

/**
 * @param {{ event: string, needs: Record<string, { result: string, outputs?: Record<string, string> }> }} input
 * @returns {{ ok: boolean, lines: string[] }}
 */
export function verdict({ event, needs }) {
  const docsOnly = needs.changes?.result === "success" && needs.changes.outputs?.code === "false";
  const lines = [];
  // An empty `needs` is a broken workflow, not a clean run.
  let ok = Object.keys(needs).length > 0;

  for (const [job, { result }] of Object.entries(needs)) {
    const excused =
      result === "skipped" && (docsOnly || (job === "pr-title" && event !== "pull_request"));
    const passed = result === "success" || excused;
    ok &&= passed;
    lines.push(`${passed ? "ok  " : "FAIL"} ${job}: ${result}${excused ? " (expected)" : ""}`);
  }

  return { ok, lines };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { ok, lines } = verdict({
    event: process.env.EVENT ?? "",
    needs: JSON.parse(process.env.NEEDS ?? "{}"),
  });
  console.log(lines.join("\n"));
  process.exit(ok ? 0 : 1);
}
