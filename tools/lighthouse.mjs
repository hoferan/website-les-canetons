// Measures the public pages with Lighthouse and reports them against a budget.
//
// WHAT IT MEASURES. The production bundle, the same `vite build` the artifact
// ships, served gzipped because the production host gzips every response
// although config/htaccess/site.htaccess never asks it to. There is no API in
// CI (the host firewalls the runner; see the e2e job), so this server answers
// /api and /sanctum itself from the MSW handlers in web/src/mocks/, loaded
// through Vite because they are TypeScript with path aliases. The page never
// knows: it makes real requests over the network, as it does in production.
// A mock build would not do: MSW is a 317 KB gzipped chunk the page awaits
// before its first render, which is most of what such a run would measure.
//
// Lighthouse's default mobile profile throttles the run to a mid-range phone
// on a slow network, which is the visitor this is for.
//
// WHAT IT DOES NOT. The mocked API answers from the same machine after a fixed
// delay, and its content is not the band's. The numbers are a regression signal for
// the bundle, the layout and the images, not a forecast of production timings.
//
// INFORMATIONAL. A breach prints a warning and the run still exits 0. Turning
// it into a gate is a separate decision.

import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createGzip, gzipSync } from "node:zlib";

/** The pages a first-time visitor lands on, French and one German. */
export const PAGES = ["/", "/band", "/history", "/agenda", "/de/"];

/** Lighthouse varies run to run; the median of three is what gets reported. */
export const RUNS = 3;

/**
 * How long every API answer is held back. An instant mock answered before the
 * first paint on some runs and after it on others, so a page that shifted when
 * its data arrived measured anywhere from 0.007 to 0.566 (#236). Production's
 * API is PHP on a shared host and is never instant; 300 ms puts every answer
 * after the first paint, which is the case worth measuring.
 */
export const API_DELAY_MS = 300;

/**
 * The budget, set just outside what the site measured on 2026-10-05, so a
 * warning means something got worse. The targets are Google's "good"
 * thresholds: a score of 90, LCP 2.5 s, CLS 0.1.
 *
 * Measured, worst page, on a laptop after #236: score 91, LCP 3.02 s, CLS
 * 0.021, TBT under 100 ms, 219 KB of gzipped script (one bundle, the same on
 * every page). CLS keeps Google's 0.1: what is left is a font swap and one
 * photo, about 0.02, and anything that moves a block when data arrives costs
 * far more than the gap.
 */
export const BUDGET = {
  score: { min: 0.85 },
  lcp: { max: 3200 },
  cls: { max: 0.1 },
  tbt: { max: 200 },
  scriptKb: { max: 240 },
};

/** How each metric reads in the summary table. */
const METRICS = [
  ["score", "Score", (v) => String(Math.round(v * 100))],
  ["lcp", "LCP", (v) => `${(v / 1000).toFixed(2)} s`],
  ["cls", "CLS", (v) => v.toFixed(3)],
  ["tbt", "TBT", (v) => `${Math.round(v)} ms`],
  ["scriptKb", "JS (gzip)", (v) => `${Math.round(v)} KB`],
];

/** The numbers this script cares about, out of one Lighthouse result. */
export function metricsOf(lhr) {
  const requests = lhr.audits["network-requests"]?.details?.items ?? [];
  const scriptBytes = requests
    .filter((request) => request.resourceType === "Script")
    .reduce((sum, request) => sum + (request.transferSize ?? 0), 0);

  return {
    score: lhr.categories.performance.score,
    lcp: lhr.audits["largest-contentful-paint"].numericValue,
    cls: lhr.audits["cumulative-layout-shift"].numericValue,
    tbt: lhr.audits["total-blocking-time"].numericValue,
    scriptKb: scriptBytes / 1024,
  };
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Each metric's median across runs, taken independently: the run with the
 * median score is not necessarily the one with the median LCP.
 */
export function medianOf(runs) {
  return Object.fromEntries(
    Object.keys(runs[0]).map((key) => [key, median(runs.map((run) => run[key]))]),
  );
}

/** Every metric outside its budget, as a readable line. */
export function breaches(metrics, budget = BUDGET) {
  const out = [];
  for (const [key, label, format] of METRICS) {
    const { min, max } = budget[key] ?? {};
    const value = metrics[key];
    if (min !== undefined && value < min) out.push(`${label} ${format(value)} < ${format(min)}`);
    if (max !== undefined && value > max) out.push(`${label} ${format(value)} > ${format(max)}`);
  }
  return out;
}

/** A Markdown table of every page, for the job summary and the terminal. */
export function summary(rows, budget = BUDGET) {
  const head = `| Page | ${METRICS.map(([, label]) => label).join(" | ")} | Budget |`;
  const rule = `|${" --- |".repeat(METRICS.length + 2)}`;
  const body = rows.map(({ page, metrics }) => {
    const over = breaches(metrics, budget);
    const cells = METRICS.map(([key, , format]) => format(metrics[key]));
    return `| \`${page}\` | ${cells.join(" | ")} | ${over.length ? `over: ${over.join(", ")}` : "ok"} |`;
  });
  return [head, rule, ...body].join("\n");
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const COMPRESSIBLE = /^(text\/|application\/(json|manifest)|image\/svg)/;

/** Writes `body` (a Buffer or a stream) gzipped when the client and type allow. */
function send(request, response, status, headers, body) {
  const type = headers["content-type"] ?? "application/octet-stream";
  const gzip = COMPRESSIBLE.test(type) && /\bgzip\b/.test(request.headers["accept-encoding"] ?? "");
  response.writeHead(status, {
    ...headers,
    ...(gzip ? { "content-encoding": "gzip", vary: "Accept-Encoding" } : {}),
  });
  if (Buffer.isBuffer(body)) {
    response.end(gzip ? gzipSync(body) : body);
  } else {
    (gzip ? body.pipe(createGzip()) : body).pipe(response);
  }
}

/**
 * A server for the built SPA at `root`, in the production .htaccess's shape:
 * /api and /sanctum go to `api` (a function from a Fetch Request to a Fetch
 * Response, or undefined for 404), a file that exists is served, and anything
 * else gets the shell.
 */
export function serve(root, api) {
  return createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (/^\/(api|sanctum)(\/|$)/.test(url.pathname)) {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const answer = await api(
        new Request(url, { method: request.method, headers: request.headers, body }),
      );
      if (!answer) {
        send(request, response, 404, { "content-type": "text/plain" }, Buffer.from("no handler"));
        return;
      }
      // Lower-cased keys, so send() finds content-type however a handler spelt it.
      const headers = Object.fromEntries(answer.headers);
      delete headers["content-length"];
      delete headers["content-encoding"];
      send(request, response, answer.status, headers, Buffer.from(await answer.arrayBuffer()));
      return;
    }

    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      file = path.join(root, "index.html");
    }
    const type = TYPES[path.extname(file)] ?? "application/octet-stream";
    send(request, response, 200, { "content-type": type }, createReadStream(file));
  });
}

const OUT = path.resolve("dist/lighthouse");
const REPORTS = path.resolve("dist/lighthouse-reports");

async function main() {
  const require = createRequire(import.meta.url);
  const viteBin = path.join(path.dirname(require.resolve("vite/package.json")), "bin", "vite.js");
  // The production build, as tools/build.mjs runs it. outDir is relative to
  // vite.config.ts's root, web/, and is not dist/build so that a measurement
  // never touches the artifact a running stack is serving.
  execFileSync(
    process.execPath,
    [viteBin, "build", "--outDir", "../dist/lighthouse", "--emptyOutDir"],
    {
      stdio: "inherit",
    },
  );

  // Vite only to load the handlers: they are TypeScript, import through the
  // `@/` alias and reach into the generated client.
  const { createServer: createVite } = await import("vite");
  const vite = await createVite({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "warn",
  });
  const { handlers } = await vite.ssrLoadModule("/src/mocks/handlers.ts");
  const { getResponse } = await import("msw");

  let origin;
  const server = serve(OUT, async (request) => {
    await new Promise((resolve) => setTimeout(resolve, API_DELAY_MS));
    return getResponse(handlers, request, { baseUrl: origin });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;

  // Imported here, not at the top, so the tests can import the functions above
  // without loading Lighthouse.
  const { default: lighthouse } = await import("lighthouse");
  const { launch } = await import("chrome-launcher");
  const chrome = await launch({ chromeFlags: ["--headless=new", "--no-sandbox"] });

  rmSync(REPORTS, { recursive: true, force: true });
  mkdirSync(REPORTS, { recursive: true });

  const rows = [];
  try {
    for (const page of PAGES) {
      const runs = [];
      for (let i = 0; i < RUNS; i += 1) {
        const result = await lighthouse(`${origin}${page}`, {
          port: chrome.port,
          output: "html",
          logLevel: "error",
          onlyCategories: ["performance"],
        });
        runs.push(metricsOf(result.lhr));
        const slug = page === "/" ? "home" : page.replace(/^\/|\/$/g, "").replace(/\//g, "-");
        writeFileSync(path.join(REPORTS, `${slug}-${i + 1}.html`), result.report);
      }
      rows.push({ page, metrics: medianOf(runs) });
      console.log(`Lighthouse: measured ${page}`);
    }
  } finally {
    await chrome.kill();
    server.close();
    await vite.close();
  }

  const table = summary(rows);
  console.log(`\n${table}\n`);
  console.log(`Reports: ${path.relative(process.cwd(), REPORTS)}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Lighthouse (mobile, median of ${RUNS})\n\n${table}\n`,
      { flag: "a" },
    );
  }
  for (const { page, metrics } of rows) {
    for (const line of breaches(metrics)) {
      // A workflow annotation on GitHub, a plain line anywhere else.
      console.log(
        process.env.GITHUB_ACTIONS
          ? `::warning title=Lighthouse ${page}::${line}`
          : `over budget: ${page} ${line}`,
      );
    }
  }
}

// The CLI. Guarded so that importing this module from the test does not run it.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
