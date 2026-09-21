import { expect, test } from "vitest";

import { renderWithSession } from "../test/renderWithSession";
import { Hreflang } from "./Hreflang";

/** The alternates currently in the document, as [hreflang, href] pairs. */
function alternates(): Array<[string, string]> {
  return [...document.head.querySelectorAll("link[rel='alternate']")].map((link) => [
    link.getAttribute("hreflang") ?? "",
    link.getAttribute("href") ?? "",
  ]);
}

test("it publishes both languages and an x-default pointing at French", () => {
  // THE TAG SET IS THE POINT. A crawler that matches neither listed language
  // needs somewhere to go, and for a Fribourg band that is French — the same
  // choice main.tsx makes by not reading navigator.language.
  //
  // jsdom serves every test from "/", so these are the root's alternates.
  const origin = window.location.origin;

  return renderWithSession(<Hreflang />).then(() => {
    expect(alternates()).toEqual([
      ["fr-CH", `${origin}/`],
      ["de-CH", `${origin}/de`],
      ["x-default", `${origin}/`],
    ]);
  });
});

test("the hrefs are ABSOLUTE, because a relative alternate is ignored", async () => {
  await renderWithSession(<Hreflang />);

  for (const [, href] of alternates()) {
    expect(href).toMatch(/^https?:\/\//);
  }
});

test("it removes its own tags on unmount and leaves other people's alone", async () => {
  // A stray <link rel="alternate"> that nothing owns — an RSS feed, say.
  const foreign = document.createElement("link");
  foreign.rel = "alternate";
  foreign.setAttribute("hreflang", "it");
  foreign.href = "https://example.test/it";
  document.head.append(foreign);

  const { unmount } = await renderWithSession(<Hreflang />);
  expect(alternates()).toHaveLength(4);

  unmount();

  // MUTATION TEST: widen the cleanup selector to `link[rel='alternate']` and
  // this fails — the component would start deleting tags it never created.
  expect(alternates()).toEqual([["it", "https://example.test/it"]]);

  foreign.remove();
});
