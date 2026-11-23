import { expect, test } from "vitest";

import { asSaved } from "./useSaveBlock";

test("an empty pair left by the bar is not saved", () => {
  const saved = asSaved("home.hero", {
    title: { fr: "Les Canetons" },
    intro: { fr: "Viens ****jouer", de: "Komm **" },
  });
  expect(saved.intro).toEqual({ fr: "Viens jouer", de: "Komm " });
});

test("a German text that held only an empty pair is no German, so the page falls back to French", () => {
  const saved = asSaved("home.hero", {
    title: { fr: "Les Canetons" },
    intro: { fr: "Viens jouer", de: "****" },
  });
  expect(saved.intro).toEqual({ fr: "Viens jouer" });
});
