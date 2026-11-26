// The check behind deploy-prod.yml's `validate-qa` job: PROD takes only the
// commit QA is running (ADR 0006).
//
// QA runs whatever its newest deployment put there, so that is the one record
// read. It must have succeeded and carry the same commit. The check refuses
// when it failed or is still running, because QA's state is then unknown.
//
// A dry run records no deployment (`deployment:` in _deploy.yml), so it can
// neither satisfy this check nor block it. A dispatch runs the workflow files
// of the tag it was given, so a dry run of a tag cut before that line existed
// still records one.
//
// Older deployments are never read, so it does not matter that GitHub marked
// the previous successful one `inactive` when a newer one succeeded until
// 2026-11-17, and has not since.

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const older = (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id;

/**
 * The newest record by creation time, the higher id breaking a tie. The API's
 * own order is not documented, so it is not relied on.
 *
 * @template {{ id: number, created_at: string }} T
 * @param {T[]} records
 * @returns {T | undefined}
 */
export function newest(records) {
  return records.reduce(
    (best, r) => (best === undefined || older(best, r) < 0 ? r : best),
    undefined,
  );
}

/**
 * @param {{
 *   deployment: { sha: string, ref: string } | undefined,
 *   statuses: { id: number, state: string, created_at: string }[],
 *   sha: string,
 *   refName?: string,
 * }} input
 * @returns {{ ok: boolean, message: string }}
 */
export function verdict({ deployment, statuses, sha, refName = sha }) {
  if (deployment === undefined) {
    return {
      ok: false,
      message: "No deployments found for the qa environment. Deploy this ref to QA first.",
    };
  }

  const qa = `tag ${deployment.ref}, commit ${deployment.sha}`;
  const state = newest(statuses)?.state ?? "unknown";

  if (state !== "success") {
    return {
      ok: false,
      message: `QA's newest deployment (${qa}) has status '${state}', not success. Refusing to deploy to PROD.`,
    };
  }
  if (deployment.sha !== sha) {
    return {
      ok: false,
      message: `This ref (${refName}, commit ${sha}) is not what QA is running (${qa}). Deploy it to QA first, a PROD rollback included.`,
    };
  }
  return { ok: true, message: `Confirmed: QA is running this commit (${qa}).` };
}

/**
 * Every item of a paginated GitHub list, following the `Link` header.
 *
 * @param {string} url
 * @param {string} token
 * @param {typeof fetch} [fetcher]
 * @returns {Promise<any[]>}
 */
export async function fetchAll(url, token, fetcher = fetch) {
  const items = [];
  for (let next = url; next;) {
    const res = await fetcher(next, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) {
      throw new Error(`GET ${next} answered ${res.status}: ${await res.text()}`);
    }
    items.push(...(await res.json()));
    next = res.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
  }
  return items;
}

async function main() {
  const env = process.env;
  for (const name of ["GH_TOKEN", "GITHUB_REPOSITORY", "GITHUB_SHA"]) {
    if (!env[name]) throw new Error(`${name} is not set.`);
  }

  const api = `${env.GITHUB_API_URL ?? "https://api.github.com"}/repos/${env.GITHUB_REPOSITORY}/deployments`;
  const deployment = newest(await fetchAll(`${api}?environment=qa&per_page=100`, env.GH_TOKEN));
  const statuses = deployment
    ? await fetchAll(`${api}/${deployment.id}/statuses?per_page=100`, env.GH_TOKEN)
    : [];

  const { ok, message } = verdict({
    deployment,
    statuses,
    sha: env.GITHUB_SHA,
    refName: env.GITHUB_REF_NAME,
  });
  if (!ok) {
    console.log(`::error::${message}`);
    process.exitCode = 1;
    return;
  }

  console.log(message);
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      [
        "### PROD validation",
        `- Deploying: \`${env.GITHUB_REF_NAME}\` (\`${env.GITHUB_SHA}\`)`,
        `- QA is running: \`${deployment.ref}\` (\`${deployment.sha}\`)`,
        "",
      ].join("\n"),
    );
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.log(`::error::${error.message}`);
    process.exitCode = 1;
  });
}
