import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The screenshot sweep (#42) photographs the pages listed in
// web/screenshots/pages.json. A list is what lets each route name a login and
// a concrete id, and a list drifts, so these tests hold it to the route table:
// a route added to routes.tsx and not to the list fails here, and so does a
// list entry for a route that no longer exists.

const routesSource = readFileSync("web/src/routes.tsx", "utf8");
const pages = JSON.parse(readFileSync("web/screenshots/pages.json", "utf8"));

/** Every route pattern in the table. The index route is `/`. */
function routePatterns(source) {
  const patterns = [...source.matchAll(/\bpath="([^"]+)"/g)].map((match) => match[1]);
  if (/<Route\s+index\b/.test(source)) {
    patterns.push("/");
  }
  return new Set(patterns);
}

test("the route table parses into the routes it plainly has", () => {
  const routes = routePatterns(routesSource);
  // A floor, so a change in how routes.tsx spells its routes cannot make the
  // two tests below pass by finding nothing.
  for (const known of ["/", "/agenda", "/events/:id/book", "/media/:id", "*"]) {
    assert.ok(routes.has(known), `expected ${known} in routes.tsx`);
  }
});

test("every route in routes.tsx is photographed", () => {
  const listed = new Set(pages.map((entry) => entry.route));
  const missing = [...routePatterns(routesSource)].filter((route) => !listed.has(route));
  assert.deepEqual(missing, [], "add these routes to web/screenshots/pages.json");
});

test("every listed route still exists", () => {
  const routes = routePatterns(routesSource);
  const stale = pages.filter((entry) => !routes.has(entry.route)).map((entry) => entry.route);
  assert.deepEqual(stale, [], "these routes are gone from routes.tsx");
});

// The heading is what proves a page rendered as itself. Without it, the
// password gate's form at /events would pass as the planning.
test("every entry names the heading its page shows", () => {
  const bare = pages.filter((entry) => typeof entry.heading !== "string" || entry.heading === "");
  assert.deepEqual(
    bare.map((entry) => entry.path),
    [],
  );
});

// Two entries with one name under one login would write the same file, and
// the second picture would silently replace the first.
test("no two pictures share a file", () => {
  const files = pages.map((entry) => `${entry.as ?? "visitor"}/${entry.name}`);
  const duplicates = files.filter((file, index) => files.indexOf(file) !== index);
  assert.deepEqual(duplicates, []);
});
