import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parse } from "yaml";

import { fetchAll, newest, verdict } from "./qa-gate.mjs";

const workflow = (name) =>
  parse(readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), "utf8"));

// Recorded from GET /repos/hoferan/website-les-canetons/deployments?environment=qa
// on 2026-11-26, trimmed to the fields the gate reads. The API listed them
// newest first.
const QA_DEPLOYMENTS = [
  {
    id: 5570127544,
    sha: "bddb473d80f15428e5c10fbce039463589fe5363",
    ref: "2026-07-23-bddb473",
    created_at: "2026-07-23T09:36:30Z",
  },
  {
    id: 5563637405,
    sha: "ed6f5eef9d44d7f4f30e79093f1ae3e030085673",
    ref: "main",
    created_at: "2026-07-22T22:08:07Z",
  },
  {
    id: 5559438473,
    sha: "674f3f6dd6e08df0080b14e76a7b20a87d85254a",
    ref: "main",
    created_at: "2026-07-22T16:52:35Z",
  },
];

// Recorded from .../deployments/5570127544/statuses on the same day.
const SUCCESS = [{ id: 15836793570, state: "success", created_at: "2026-07-23T09:38:31Z" }];

const A = QA_DEPLOYMENTS[0];

// The cause of #425: every run of _deploy.yml named its environment, so GitHub
// recorded a successful deployment for a dry run too. A QA dry run of tag B
// then became QA's newest deployment, PROD accepted B, which QA never received,
// and refused A, which QA was running.
test("a dry run records no deployment, so it can neither satisfy nor block the gate", () => {
  const { environment } = workflow("_deploy.yml").jobs.deploy;
  assert.deepEqual(environment, {
    name: "${{ inputs.environment }}",
    deployment: "${{ !inputs.dry_run }}",
  });
});

test("Deploy PROD decides through this script", () => {
  const steps = workflow("deploy-prod.yml").jobs["validate-qa"].steps;
  assert.ok(steps.some((s) => s.run?.trim() === "node tools/deploy/qa-gate.mjs"));
});

test("accepts the commit of QA's newest deployment when it succeeded", () => {
  const { ok, message } = verdict({ deployment: A, statuses: SUCCESS, sha: A.sha });
  assert.equal(ok, true, message);
  assert.match(message, /2026-07-23-bddb473/);
});

test("takes the newest deployment whatever order the API lists them in", () => {
  const shuffled = [QA_DEPLOYMENTS[2], QA_DEPLOYMENTS[0], QA_DEPLOYMENTS[1]];
  assert.equal(newest(shuffled), A);
});

test("breaks a tie on the creation time by the higher id", () => {
  const twin = { ...QA_DEPLOYMENTS[1], created_at: A.created_at };
  assert.equal(newest([A, twin]), A);
  assert.equal(newest([twin, A]), A);
});

// A PROD rollback to an older tag is refused the same way until QA runs it.
test("refuses a commit QA is not running and says to deploy it to QA first", () => {
  const older = QA_DEPLOYMENTS[2].sha;
  const { ok, message } = verdict({ deployment: A, statuses: SUCCESS, sha: older });
  assert.equal(ok, false);
  assert.match(message, /2026-07-23-bddb473/);
  assert.match(message, /to QA first/);
});

test("refuses while QA's newest deployment is unfinished or failed", () => {
  for (const state of ["failure", "error", "in_progress", "queued", "inactive"]) {
    const statuses = [{ id: 2, state, created_at: "2026-07-23T09:40:00Z" }, ...SUCCESS];
    const { ok, message } = verdict({ deployment: A, statuses, sha: A.sha });
    assert.equal(ok, false, state);
    assert.match(message, new RegExp(`'${state}'`));
  }
});

test("refuses a deployment without any status", () => {
  const { ok, message } = verdict({ deployment: A, statuses: [], sha: A.sha });
  assert.equal(ok, false);
  assert.match(message, /'unknown'/);
});

test("refuses when QA has never been deployed", () => {
  const { ok, message } = verdict({ deployment: undefined, statuses: [], sha: A.sha });
  assert.equal(ok, false);
  assert.match(message, /No deployments found for the qa environment/);
});

// QA's 101st deployment is on the second page.
test("reads every page the API links to", async () => {
  const pages = {
    "https://api.example/deployments?environment=qa&per_page=100": {
      body: [QA_DEPLOYMENTS[1]],
      link: '<https://api.example/deployments?environment=qa&per_page=100&page=2>; rel="next", <https://api.example/deployments?environment=qa&per_page=100&page=2>; rel="last"',
    },
    "https://api.example/deployments?environment=qa&per_page=100&page=2": {
      body: [A],
      link: null,
    },
  };
  const fetcher = async (url) => {
    const page = pages[url];
    assert.ok(page, `unexpected request ${url}`);
    return {
      ok: true,
      status: 200,
      headers: new Headers(page.link ? { link: page.link } : {}),
      json: async () => page.body,
    };
  };

  const all = await fetchAll(
    "https://api.example/deployments?environment=qa&per_page=100",
    "token",
    fetcher,
  );
  assert.deepEqual(all, [QA_DEPLOYMENTS[1], A]);
});

test("fails loudly on an API error rather than judging an empty list", async () => {
  const fetcher = async () => ({
    ok: false,
    status: 403,
    headers: new Headers(),
    text: async () => "Resource not accessible by integration",
  });
  await assert.rejects(fetchAll("https://api.example/deployments", "token", fetcher), /403/);
});
