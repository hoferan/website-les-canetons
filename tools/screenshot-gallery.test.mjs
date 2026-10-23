import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { collect, render } from "./screenshot-gallery.mjs";

// The gallery is built from whatever the sweep wrote, so these tests write the
// files a sweep would. The pictures are empty files: the gallery only links
// them, it never reads one.

const PAGES = [
  { route: "/", path: "/", as: null, name: "home", heading: "Accueil" },
  { route: "/events", path: "/events", as: "demo.player", name: "events", heading: "Planning" },
  {
    route: "/members",
    path: "/members",
    as: "demo.direction",
    name: "members",
    heading: "Membres",
  },
];

function sweep(files) {
  const dir = mkdtempSync(join(tmpdir(), "gallery-"));
  for (const file of files) {
    mkdirSync(join(dir, file, ".."), { recursive: true });
    writeFileSync(join(dir, file), "");
  }
  return dir;
}

test("groups each page's desktop and phone picture, in the page list's order", () => {
  const dir = sweep([
    "phone/demo.player/events.png",
    "desktop/visitor/home.png",
    "desktop/demo.player/events.png",
    "phone/visitor/home.png",
  ]);

  const groups = collect(dir, PAGES);

  assert.deepEqual(
    groups.map((group) => [group.path, group.who, group.shots]),
    [
      ["/", "visitor", { desktop: "desktop/visitor/home.png", phone: "phone/visitor/home.png" }],
      [
        "/events",
        "demo.player",
        { desktop: "desktop/demo.player/events.png", phone: "phone/demo.player/events.png" },
      ],
    ],
  );
});

// A page that failed at one width is the page a reviewer most needs to find,
// so it stays in the gallery with the gap shown.
test("keeps a page that was taken at one width only", () => {
  const dir = sweep(["desktop/demo.direction/members.png"]);

  const [members] = collect(dir, PAGES);

  assert.equal(members.path, "/members");
  assert.deepEqual(members.shots, { desktop: "desktop/demo.direction/members.png", phone: null });
});

test("leaves out a listed page that has no picture at all", () => {
  const dir = sweep(["desktop/visitor/home.png"]);

  assert.deepEqual(
    collect(dir, PAGES).map((group) => group.name),
    ["home"],
  );
});

// The page list and the sweep can disagree, say on a branch that renamed an
// entry. A picture on disk is shown even then, under its file name.
test("shows a picture the page list does not name, after the listed ones", () => {
  const dir = sweep(["desktop/visitor/old-name.png", "desktop/visitor/home.png"]);

  const groups = collect(dir, PAGES);

  assert.deepEqual(
    groups.map((group) => [group.name, group.path]),
    [
      ["home", "/"],
      ["old-name", null],
    ],
  );
});

test("finds nothing in a sweep that wrote no directory", () => {
  assert.deepEqual(collect(join(tmpdir(), "no-such-sweep-dir"), PAGES), []);
});

test("links every picture by a relative path", () => {
  const dir = sweep(["desktop/visitor/home.png", "phone/visitor/home.png"]);

  const html = render(collect(dir, PAGES), { title: "Screenshots" });

  const sources = [...html.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((match) => match[1]);
  assert.ok(sources.includes("desktop/visitor/home.png"));
  assert.ok(sources.includes("phone/visitor/home.png"));
  // Relative, so the page works straight out of the unzipped artifact, and
  // nothing external, so it works offline.
  for (const source of sources) {
    assert.match(source, /^(#|[a-z]+\/)/, `${source} is not a relative link`);
  }
  assert.doesNotMatch(html, /<link\b|<script\b/);
});

test("labels each page with its route and login, and says which width is missing", () => {
  const dir = sweep(["desktop/demo.player/events.png"]);

  const html = render(collect(dir, PAGES), { title: "Screenshots" });

  assert.match(html, /\/events/);
  assert.match(html, /demo\.player/);
  assert.match(html, /Planning/);
  assert.match(html, /390px[^<]*<\/[a-z0-9]+>\s*<p[^>]*>Not taken/);
});

test("escapes what it prints", () => {
  const pages = [{ ...PAGES[0], heading: "<b>Tom & Jerry</b>" }];
  const dir = sweep(["desktop/visitor/home.png"]);

  const html = render(collect(dir, pages), { title: "Screenshots" });

  assert.match(html, /&lt;b&gt;Tom &amp; Jerry&lt;\/b&gt;/);
});

test("says so when the sweep took no picture", () => {
  assert.match(render([], { title: "Screenshots" }), /No screenshots were taken/);
});

test("the CLI writes index.html into the sweep's directory", () => {
  const dir = sweep(["desktop/visitor/home.png"]);

  const output = execFileSync(process.execPath, ["tools/screenshot-gallery.mjs", dir], {
    encoding: "utf8",
  });

  assert.match(readFileSync(join(dir, "index.html"), "utf8"), /desktop\/visitor\/home\.png/);
  assert.match(output, /1 picture/);
});
