#!/usr/bin/env node
// Prints what the whats-next skill needs in one call: origin/main, the open
// pull requests, the milestone in progress, and the issues of every milestone
// up to it. Later milestones get one summary line each unless `--all` is
// passed. Every priority:high issue is listed at the end.
//
// The `<-` hints are guesses from labels and body text; the issue body has
// the final word. Tracker steps come from the numbered lists in "Track ..."
// issues, read as described at trackerStep below.
import { execFileSync } from "node:child_process";

const all = process.argv.includes("--all");
const run = (cmd, args) =>
  execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
const gh = (...args) => JSON.parse(run("gh", args));

run("git", ["fetch", "--quiet", "origin"]);
const head = run("git", ["log", "-1", "--format=%h %cs %s", "origin/main"]);

// REST only: `gh pr list` and `gh issue list` go through GraphQL, which
// Claude Code web sessions refuse with a 403.
const api = (path) => gh("api", path);
// `gh api --paginate` prints one JSON array per page, back to back, so walk
// the pages here instead.
function pages(path, maxPages) {
  const rows = [];
  for (let page = 1; page <= maxPages; page++) {
    const batch = api(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  return rows;
}
// The issues endpoint also returns pull requests.
const issuesOnly = (rows) => rows.filter((i) => !i.pull_request);

// Shaped like GraphQL's statusCheckRollup: check runs plus commit statuses.
function rollup(sha) {
  const runs = api(`repos/{owner}/{repo}/commits/${sha}/check-runs?per_page=100`).check_runs;
  const statuses = api(`repos/{owner}/{repo}/commits/${sha}/status`).statuses;
  return [
    ...runs.map((r) => ({ name: r.name, conclusion: r.conclusion ?? "", status: r.status })),
    ...statuses.map((s) => ({ name: s.context, state: s.state })),
  ];
}

const prs = pages("repos/{owner}/{repo}/pulls?state=open", 1).map((pr) => ({
  number: pr.number,
  title: pr.title,
  headRefName: pr.head.ref,
  isDraft: pr.draft,
  statusCheckRollup: rollup(pr.head.sha),
}));
const milestones = api("repos/{owner}/{repo}/milestones?state=open&per_page=100");
const open = issuesOnly(pages("repos/{owner}/{repo}/issues?state=open", 5));
// Closing an issue updates it, so the most recently updated pages hold the
// latest close; sort by closedAt to find it.
const closed = issuesOnly(
  pages("repos/{owner}/{repo}/issues?state=closed&sort=updated&direction=desc", 2),
)
  .map((i) => ({ ...i, closedAt: i.closed_at }))
  .sort((a, b) => b.closedAt.localeCompare(a.closedAt));

const rNumber = (title) => Number(/^R(\d+)\b/.exec(title ?? "")?.[1] ?? Infinity);
const labelsOf = (i) => i.labels.map((l) => l.name);
const isTracker = (i) => /^Track\b/i.test(i.title);
const openNumbers = new Set(open.map((i) => i.number));

// issue number -> { tracker, list, step }. A tracker body can hold several
// numbered lists; a "1." after other steps starts a new one, and a later list
// replaces an earlier one for the issues it names.
const trackerStep = new Map();
for (const t of open.filter(isTracker)) {
  let list = 0;
  let previous = 0;
  for (const line of (t.body ?? "").split("\n")) {
    const step = Number(/^\s*(\d+)\.\s/.exec(line)?.[1]);
    if (!step) continue;
    if (step === 1 && previous > 0) list += 1;
    previous = step;
    for (const m of line.matchAll(/#(\d+)/g)) {
      const n = Number(m[1]);
      const seen = trackerStep.get(n);
      // Within one list the first mention is the step; "8. #391 closes with
      // the last of #405" only refers back to #405.
      if (seen?.tracker === t.number && seen.list === list) continue;
      trackerStep.set(n, { tracker: t.number, list, step });
    }
  }
}

function stepHint(n) {
  const at = trackerStep.get(n);
  if (!at) return null;
  const waiting = [...trackerStep]
    .filter(
      ([m, s]) =>
        s.tracker === at.tracker && s.list === at.list && s.step < at.step && openNumbers.has(m),
    )
    .map(([m]) => m)
    .sort((a, b) => a - b);
  return (
    `#${at.tracker} step ${at.step}` +
    (waiting.length ? `, earlier steps still open: ${waiting.map((m) => "#" + m).join(" ")}` : "")
  );
}

// Pending and missing checks are not green.
function checks(pr) {
  const rollup = pr.statusCheckRollup ?? [];
  const state = (c) => c.conclusion || c.state || c.status;
  const bad = rollup.filter((c) => /FAIL|ERROR|CANCEL|TIMED_OUT/i.test(state(c)));
  const waiting = rollup.filter((c) => /PENDING|QUEUED|IN_PROGRESS|EXPECTED/i.test(state(c)));
  if (rollup.length === 0) return "no checks";
  if (bad.length) return `${bad.length} failing: ${bad.map((c) => c.name).join(", ")}`;
  if (waiting.length) return `${waiting.length} pending`;
  return `all ${rollup.length} green`;
}

function hints(issue) {
  if (isTracker(issue)) return "  <- tracking issue";
  const body = issue.body ?? "";
  const out = [];
  const step = stepHint(issue.number);
  if (step) out.push(step);
  const mentioned = [...new Set([...body.matchAll(/#(\d+)/g)].map((m) => Number(m[1])))].filter(
    (n) => n !== issue.number,
  );
  const list = (ns) => ns.map((n) => "#" + n).join(" ");
  const openOnes = mentioned.filter((n) => openNumbers.has(n));
  const closedOnes = mentioned.filter((n) => !openNumbers.has(n));
  if (openOnes.length) out.push(`mentions open ${list(openOnes)}`);
  if (closedOnes.length) out.push(`mentions closed ${list(closedOnes)}`);
  if (/brainstorm|to settle|decide(s)? (first|before)|open question/i.test(body))
    out.push("decisions first?");
  if (labelsOf(issue).includes("content")) out.push("content label");
  if (/\b(QA|PROD)\b.*\b(host|server|cutover)\b|host-only|on the hosts?/i.test(body))
    out.push("host/cutover?");
  return out.length ? `  <- ${out.join("; ")}` : "";
}

const latest = closed.find((c) => Number.isFinite(rNumber(c.milestone?.title)));
const current = latest?.milestone.title;

console.log(`origin/main: ${head}`);
if (latest) {
  console.log(
    `IN PROGRESS: ${current} (last close: #${latest.number} ${latest.title}, ${latest.closedAt})`,
  );
}

console.log(`\nOPEN PULL REQUESTS (${prs.length})`);
for (const pr of prs) {
  console.log(
    `  #${pr.number} ${pr.isDraft ? "[draft] " : ""}${pr.title} (${pr.headRefName}) - ${checks(pr)}`,
  );
}

const byNumber = (a, b) => a.number - b.number;
const ordered = milestones.sort((a, b) => rNumber(a.title) - rNumber(b.title) || byNumber(a, b));
const toRead = [];
for (const m of ordered) {
  const detailed = all || rNumber(m.title) <= rNumber(current);
  console.log(`\n${m.title}: ${m.open_issues} open, ${m.closed_issues} closed`);
  if (!detailed) continue;
  const issues = open.filter((i) => i.milestone?.title === m.title).sort(byNumber);
  for (const i of issues) {
    console.log(`  #${i.number} ${i.title} [${labelsOf(i).join(",")}]${hints(i)}`);
    if (!isTracker(i) && rNumber(m.title) <= rNumber(current)) toRead.push(i.number);
  }
}

const loose = open.filter((i) => !i.milestone).sort(byNumber);
if (loose.length) {
  console.log(`\nNO MILESTONE (${loose.length})`);
  for (const i of loose) console.log(`  #${i.number} ${i.title} [${labelsOf(i).join(",")}]`);
}

// Earliest tracker step first, then the lower R number, then the issue number.
const high = open
  .filter((i) => labelsOf(i).includes("priority:high"))
  .sort(
    (a, b) =>
      (trackerStep.get(a.number)?.step ?? Infinity) -
        (trackerStep.get(b.number)?.step ?? Infinity) ||
      rNumber(a.milestone?.title) - rNumber(b.milestone?.title) ||
      byNumber(a, b),
  );
console.log(`\nPRIORITY:HIGH ANYWHERE, in order (${high.length})`);
for (const i of high) {
  const step = stepHint(i.number);
  console.log(
    `  #${i.number} [${i.milestone?.title ?? "no milestone"}]${step ? ` (${step})` : ""} ${i.title}`,
  );
}
if (!all) console.log("\nLater milestones are summarised; pass --all to list their issues.");
// The skill's alternative: the first high one outside the milestone in
// progress whose tracker has nothing open before it.
const alternative = high.find(
  (i) => i.milestone?.title !== current && !stepHint(i.number)?.includes("still open"),
);
if (alternative && !toRead.includes(alternative.number)) toRead.push(alternative.number);
if (toRead.length) {
  console.log(
    `\nREAD THE BODIES: for n in ${toRead.join(" ")}; do echo "== #$n"; gh api "repos/{owner}/{repo}/issues/$n" --jq .body; done`,
  );
}
