// Writes dist/screenshots/index.html, one page showing every picture the
// screenshot sweep (#42) took, so a reviewer who downloads the artifact opens
// one file instead of clicking through a folder per width and login (#321).
//
// Built from the files on disk, not from web/screenshots/pages.json: a sweep
// that failed halfway uploads what it took, and the gallery must show exactly
// that. The page list only supplies each picture's route and heading.
//
// Self-contained on purpose: relative links, inline CSS, no script, so it works
// straight out of the unzipped artifact and offline.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// The widths web/screenshots/screenshots.spec.ts takes, in the order shown.
// A width the sweep gains and this list lacks is still shown, after these.
const WIDTHS = { desktop: 1280, phone: 390 };

/**
 * @typedef {{ route: string, path: string, as: string | null, name: string, heading: string }} Page
 * @typedef {{ name: string, who: string, path: string | null, heading: string | null,
 *   shots: Record<string, string | null> }} Group
 */

/**
 * Every page that has at least one picture under `dir`, in the page list's
 * order, then any picture the list does not name.
 *
 * @param {string} dir
 * @param {Page[]} pages
 * @returns {Group[]}
 */
export function collect(dir, pages) {
  if (!existsSync(dir)) return [];

  // The known widths even when no folder exists for one, so a sweep that
  // failed every phone page shows the gap instead of hiding the column.
  const widths = [...new Set([...Object.keys(WIDTHS), ...subdirectories(dir)])].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b),
  );

  /** @type {Map<string, Group>} */
  const groups = new Map();
  for (const page of pages) {
    const who = page.as ?? "visitor";
    groups.set(`${who}/${page.name}`, {
      name: page.name,
      who,
      path: page.path,
      heading: page.heading,
      shots: {},
    });
  }

  for (const width of widths) {
    if (!existsSync(join(dir, width))) continue;
    for (const who of subdirectories(join(dir, width))) {
      for (const file of readdirSync(join(dir, width, who))) {
        if (!file.endsWith(".png")) continue;
        const name = file.slice(0, -".png".length);
        const key = `${who}/${name}`;
        if (!groups.has(key)) {
          groups.set(key, { name, who, path: null, heading: null, shots: {} });
        }
        groups.get(key).shots[width] = `${width}/${who}/${file}`;
      }
    }
  }

  return [...groups.values()]
    .filter((group) => Object.keys(group.shots).length > 0)
    .map((group) => ({
      ...group,
      shots: Object.fromEntries(widths.map((width) => [width, group.shots[width] ?? null])),
    }));
}

function rank(width) {
  const known = Object.keys(WIDTHS).indexOf(width);
  return known === -1 ? Infinity : known;
}

function subdirectories(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );

/** "1 picture", "64 pictures": every picture actually taken, over all groups. */
function count(groups, noun) {
  const n = groups.flatMap((group) => Object.values(group.shots).filter(Boolean)).length;
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

const label = (width) => (WIDTHS[width] ? `${width} · ${WIDTHS[width]}px` : width);

/**
 * The gallery page: a section per login, a figure per page, its widths side by
 * side on a wide screen and one after the other on a phone.
 *
 * @param {Group[]} groups
 * @param {{ title: string }} options
 */
export function render(groups, { title }) {
  /** @type {Map<string, Group[]>} */
  const byLogin = new Map();
  for (const group of groups) {
    if (!byLogin.has(group.who)) byLogin.set(group.who, []);
    byLogin.get(group.who).push(group);
  }

  const contents = [...byLogin.keys()]
    .map((who) => `<a href="#${escape(who)}">${escape(who)}</a>`)
    .join(" ");

  const sections = [...byLogin.entries()].map(
    ([who, list]) => `
<section id="${escape(who)}">
<h2>${escape(who)}</h2>
${list.map(figure).join("\n")}
</section>`,
  );

  const body =
    groups.length === 0
      ? "<p>No screenshots were taken. The run's log says why.</p>"
      : `<p>${count(groups, "picture")} of ${groups.length} page${groups.length === 1 ? "" : "s"}. Click one for full size.</p>
<nav>${contents}</nav>
${sections.join("\n")}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
:root { color-scheme: light dark; --fg: #1a1a1a; --muted: #666; --bg: #fff; --card: #f4f4f4; --line: #ddd; }
@media (prefers-color-scheme: dark) {
  :root { --fg: #eee; --muted: #aaa; --bg: #161616; --card: #222; --line: #333; }
}
* { box-sizing: border-box; }
body { margin: 0 auto; max-width: 1400px; padding: 16px; font: 15px/1.5 system-ui, sans-serif; color: var(--fg); background: var(--bg); }
h1 { font-size: 1.4rem; margin: 0 0 4px; }
h2 { font-size: 1.15rem; margin: 32px 0 12px; padding-bottom: 4px; border-bottom: 1px solid var(--line); }
nav { display: flex; flex-wrap: wrap; gap: 8px 16px; }
a { color: inherit; }
figure { margin: 0 0 24px; padding: 12px; background: var(--card); border-radius: 8px; }
figcaption { margin-bottom: 12px; overflow-wrap: anywhere; }
figcaption code { font-size: 1rem; font-weight: 600; }
.heading { color: var(--muted); }
.shots { display: grid; gap: 16px; align-items: start; }
@media (min-width: 760px) { .shots { grid-template-columns: minmax(0, 3fr) minmax(0, 1fr); } }
h3 { font-size: 0.85rem; font-weight: 500; color: var(--muted); margin: 0 0 4px; }
img { display: block; width: 100%; height: auto; border: 1px solid var(--line); }
.phone img { max-width: 390px; }
.missing { margin: 0; padding: 24px; border: 1px dashed var(--line); color: var(--muted); }
</style>
</head>
<body>
<h1>${escape(title)}</h1>
${body}
</body>
</html>
`;
}

/** @param {Group} group */
function figure(group) {
  const shots = Object.entries(group.shots).map(([width, file]) => {
    const picture = file
      ? `<a href="${escape(file)}"><img src="${escape(file)}" alt="${escape(group.path ?? group.name)} at ${escape(width)} width" loading="lazy"></a>`
      : `<p class="missing">Not taken. The sweep failed on this page at this width.</p>`;
    return `<div class="${escape(width)}">
<h3>${escape(label(width))}</h3>
${picture}
</div>`;
  });

  const heading = group.heading
    ? ` <span class="heading">${escape(group.heading)}</span>`
    : ` <span class="heading">not in web/screenshots/pages.json</span>`;

  return `<figure id="${escape(`${group.who}/${group.name}`)}">
<figcaption><code>${escape(group.path ?? group.name)}</code>${heading}</figcaption>
<div class="shots">
${shots.join("\n")}
</div>
</figure>`;
}

// The CLI. Guarded so that importing this module from the test does not run it.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const dir = process.argv[2] ?? "dist/screenshots";
  const pages = JSON.parse(readFileSync("web/screenshots/pages.json", "utf8"));
  const title = process.env.GALLERY_TITLE || "Screenshots";

  const groups = collect(dir, pages);
  // Written even when the sweep took nothing, so the artifact still says so
  // and the PR comment does not keep pointing at an older run's pictures.
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), render(groups, { title }));

  console.log(`Screenshot gallery: ${join(dir, "index.html")}, ${count(groups, "picture")}.`);
}
