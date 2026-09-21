import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

import { applyDocumentMeta } from "./documentMeta";
import { de } from "./de";
import { fr } from "./fr";
import { setLocale } from "./index";

// Resolved from the Vitest root (the repo root) rather than from
// `import.meta.url`: under the jsdom environment that is an http: URL and
// readFileSync refuses it. Same reason as pages/oneLayoutPerRow.test.ts.
const WEB = resolve(process.cwd(), "web");

/** The shell, read as the deployed artifact ships it. */
const shell = readFileSync(resolve(WEB, "index.html"), "utf8");

/** Puts the two tags this module rewrites into jsdom's head, as the shell does. */
function mountShellHead() {
  document.title = fr.meta.title;
  document.head.innerHTML = `
    <meta name="description" content="${fr.meta.description}" />
    <link rel="manifest" href="/assets/icons/manifest.json" crossorigin="use-credentials" />
  `;
}

function head() {
  return {
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.getAttribute("content"),
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href"),
  };
}

test("German replaces all three, manifest included", async () => {
  mountShellHead();
  await setLocale("de-CH");

  applyDocumentMeta("de-CH");

  expect(head()).toEqual({
    title: de.meta.title,
    description: de.meta.description,
    manifest: "/assets/icons/manifest.de.json",
  });
  // The one that matters to a person: an installed app launching in the
  // language they installed it from.
  expect(head().manifest).not.toBe("/assets/icons/manifest.json");
});

test("French leaves the shell exactly as it shipped", async () => {
  mountShellHead();
  await setLocale("fr");

  applyDocumentMeta("fr");

  expect(head()).toEqual({
    title: fr.meta.title,
    description: fr.meta.description,
    manifest: "/assets/icons/manifest.json",
  });
});

/**
 * THE ATTRIBUTE THIS MUST NOT LOSE. crossorigin="use-credentials" is
 * load-bearing: without it the manifest fetch fails behind TEST/QA Basic Auth,
 * a bug this project has already fixed once. Repointing the existing element
 * keeps it; replacing the element would silently drop it, and nothing else in
 * the suite looks at that attribute.
 */
test("repoints the manifest link rather than replacing it", async () => {
  mountShellHead();
  await setLocale("de-CH");

  applyDocumentMeta("de-CH");

  expect(document.querySelector('link[rel="manifest"]')).toHaveAttribute(
    "crossorigin",
    "use-credentials",
  );
});

/**
 * THE DRIFT GUARD, and the reason this file reads index.html at all.
 *
 * The French title and description exist twice — once in the static shell,
 * which is what a crawler and the first paint get, and once in fr.ts, which is
 * what applyDocumentMeta writes over them. Let those two diverge and a FRENCH
 * visitor watches one title be replaced by a different one on every page load.
 *
 * Nothing else in the suite can catch that: both values are separately valid,
 * every other test renders components rather than the shell, and the e2e specs
 * assert on German. Only comparing the two files does it.
 */
test("the shell ships exactly the French values this module writes back", () => {
  expect(shell).toContain(`<title>${fr.meta.title}</title>`);
  expect(shell).toContain(`content="${fr.meta.description}"`);
});

/**
 * The German manifest, checked as a file rather than through the link swap.
 *
 * `start_url` is the entire point of the second file — an installed app that
 * always launched at "/" would put a German member back into French every
 * time they opened it.
 */
test("the German manifest launches under /de and differs only there", () => {
  const read = (name: string) =>
    JSON.parse(readFileSync(resolve(WEB, "public/assets/icons", name), "utf8")) as Record<
      string,
      unknown
    >;

  const french = read("manifest.json");
  const german = read("manifest.de.json");

  expect(german.start_url).toBe("/de");
  expect(german.lang).toBe("de-CH");
  expect(french.start_url).toBe("/");
  expect(french.lang).toBe("fr-CH");

  // Everything else is identical, which is the claim documentMeta.ts makes:
  // the band's name is a proper noun after a German word, so only the launch
  // URL and the language tag are locale-specific. A later edit to one file
  // that forgets the other fails here.
  const withoutLocaleFields = (manifest: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(manifest).filter(([key]) => key !== "start_url" && key !== "lang"),
    );
  expect(withoutLocaleFields(german)).toEqual(withoutLocaleFields(french));
});

/**
 * THE DECISION, RECORDED AS A TEST.
 *
 * The site title is identical in both catalogues on purpose: "Les Canetons de
 * Fribourg" is the band's name — this file never translates it, and `band` is
 * "Die Canetons" rather than "Die Entlein" — while "Guggenmusik" is already a
 * German word. There is nothing French left in the string to render.
 *
 * Asserted rather than merely commented because the pressure runs the other
 * way: a future reader meeting a "German title" that reads the same as the
 * French one will assume it was forgotten. If somebody deliberately changes
 * it, this test is what makes them say so.
 */
test("the site title is the same in both languages, and that is the decision", () => {
  expect(de.meta.title).toBe(fr.meta.title);
  expect(de.meta.description).not.toBe(fr.meta.description);
});
