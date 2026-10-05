import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { breaches, median, medianOf, metricsOf, serve, summary } from "./lighthouse.mjs";

/** Just enough of a Lighthouse result for metricsOf(). */
function lhr({ score = 0.95, lcp = 2000, cls = 0.05, tbt = 100, scripts = [] } = {}) {
  return {
    categories: { performance: { score } },
    audits: {
      "largest-contentful-paint": { numericValue: lcp },
      "cumulative-layout-shift": { numericValue: cls },
      "total-blocking-time": { numericValue: tbt },
      "network-requests": {
        details: {
          items: [
            { resourceType: "Document", transferSize: 4096 },
            ...scripts.map((transferSize) => ({ resourceType: "Script", transferSize })),
          ],
        },
      },
    },
  };
}

const GOOD = { score: 0.95, lcp: 2000, cls: 0.05, tbt: 100, scriptKb: 200 };

test("metricsOf reads the metrics and sums only the scripts", () => {
  const metrics = metricsOf(lhr({ scripts: [100 * 1024, 20 * 1024] }));

  assert.deepEqual(metrics, { ...GOOD, scriptKb: 120 });
});

test("median takes the middle value, or the mean of the middle two", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test("medianOf takes each metric independently", () => {
  // The run with the median score is not the run with the median LCP.
  const runs = [
    { ...GOOD, score: 0.8, lcp: 1000 },
    { ...GOOD, score: 0.9, lcp: 3000 },
    { ...GOOD, score: 0.7, lcp: 2000 },
  ];

  assert.deepEqual(medianOf(runs), { ...GOOD, score: 0.8, lcp: 2000 });
});

test("a page inside every budget has no breaches", () => {
  assert.deepEqual(breaches(GOOD), []);
});

test("a breach names the metric, the value and the limit", () => {
  const over = breaches(
    { ...GOOD, score: 0.72, cls: 0.25 },
    { score: { min: 0.9 }, cls: { max: 0.1 } },
  );

  assert.deepEqual(over, ["Score 72 < 90", "CLS 0.250 > 0.100"]);
});

test("the summary has a row per page and says which are over", () => {
  const table = summary(
    [
      { page: "/", metrics: GOOD },
      { page: "/band", metrics: { ...GOOD, lcp: 4000 } },
    ],
    { lcp: { max: 2500 } },
  );
  const [, , home, band] = table.split("\n");

  assert.match(home, /^\| `\/` \|.*\| ok \|$/);
  assert.match(band, /^\| `\/band` \|.*over: LCP 4\.00 s > 2\.50 s \|$/);
});

/** A built SPA in a temporary directory, with a file just outside it. */
function site() {
  const parent = mkdtempSync(join(tmpdir(), "lighthouse-"));
  writeFileSync(join(parent, "secret.txt"), "outside the build");
  const root = join(parent, "build");
  mkdirSync(join(root, "assets"), { recursive: true });
  writeFileSync(join(root, "index.html"), "<!doctype html><title>shell</title>");
  writeFileSync(join(root, "assets", "index.js"), 'console.log("app")');
  return root;
}

/** Starts `server`, sends one request, and closes it again. */
async function fetchFrom(server, path, { method = "GET", body } = {}) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await new Promise((resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port: server.address().port,
          path,
          method,
          headers: { "accept-encoding": "gzip" },
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const raw = Buffer.concat(chunks);
            const gzipped = res.headers["content-encoding"] === "gzip";
            resolve({
              status: res.statusCode,
              headers: res.headers,
              gzipped,
              text: String(gzipped ? gunzipSync(raw) : raw),
            });
          });
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  } finally {
    server.close();
  }
}

const noApi = () => undefined;

test("a file that exists is served as itself, gzipped like the host", async () => {
  const res = await fetchFrom(serve(site(), noApi), "/assets/index.js");

  assert.equal(res.status, 200);
  assert.equal(res.gzipped, true);
  assert.match(res.headers["content-type"], /^text\/javascript/);
  assert.equal(res.text, 'console.log("app")');
});

test("any other path gets the shell, as the .htaccess fallback does", async () => {
  const res = await fetchFrom(serve(site(), noApi), "/band");

  assert.equal(res.status, 200);
  assert.match(res.text, /<title>shell<\/title>/);
});

test("a path that climbs out of the build gets the shell, not the file", async () => {
  // Encoded slashes: URL parsing leaves ..%2f alone, and only decoding turns it
  // into a climb, so this is the request the root check exists for.
  const res = await fetchFrom(serve(site(), noApi), "/assets/..%2f..%2fsecret.txt");

  assert.doesNotMatch(res.text, /outside the build/);
  assert.match(res.text, /<title>shell<\/title>/);
});

test("/api is answered by the handler, body and all", async () => {
  let seen;
  const api = async (req) => {
    seen = { method: req.method, path: new URL(req.url).pathname, body: await req.text() };
    return Response.json({ ok: true }, { status: 201 });
  };
  const res = await fetchFrom(serve(site(), api), "/api/v1/contact", {
    method: "POST",
    body: '{"a":1}',
  });

  assert.deepEqual(seen, { method: "POST", path: "/api/v1/contact", body: '{"a":1}' });
  assert.equal(res.status, 201);
  assert.deepEqual(JSON.parse(res.text), { ok: true });
});

test("/api with no matching handler is a 404, not the shell", async () => {
  // Otherwise a renamed endpoint would answer HTML and the page would measure
  // its own error state without anybody noticing.
  const res = await fetchFrom(serve(site(), noApi), "/api/v1/nothing");

  assert.equal(res.status, 404);
});
