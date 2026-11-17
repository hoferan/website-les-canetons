import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { de } from "./de";
import { fr } from "./fr";

/**
 * German is a chunk of its own (#476). The setup file loads it up front for
 * every other test, so these re-import the app's modules with
 * vi.resetModules(), where only French is in memory, and watch it arrive.
 *
 * The mocked server's handlers stay the ones imported above: the server set
 * up in setupTests.ts answers with that instance, so `setMockUser` must come
 * from it too.
 */
beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
});

const FRENCH = fr.join.heading;
const GERMAN = de.join.heading;

test("only French is in memory until German is loaded", async () => {
  const { catalogueOf, loadCatalogue } = await import("./catalogues");
  const { fromCatalogue } = await import("./catalogueText");

  expect(catalogueOf("de-CH")).toBeUndefined();
  expect(fromCatalogue("join.heading")).toEqual({ fr: FRENCH });

  await loadCatalogue("de-CH");
  expect(fromCatalogue("join.heading")).toEqual({ fr: FRENCH, de: GERMAN });
});

test("a navigation to a German URL waits for German, then renders it", async () => {
  const { renderWithSession } = await import("../test/renderWithSession");
  const { t } = await import("./index");
  const { useLocale } = await import("./routing");
  const { catalogueOf } = await import("./catalogues");

  // useLocale() renders it again when the language changes, as the route
  // table does for every page.
  function Heading() {
    useLocale();
    return <h1>{t("join.heading")}</h1>;
  }

  const { router } = await renderWithSession(<Heading />, { route: "/join" });
  // textContent, because toHaveTextContent folds the non-breaking space
  // before the French "?" and then misses the catalogue's string.
  expect(screen.getByRole("heading").textContent).toBe(FRENCH);
  expect(catalogueOf("de-CH")).toBeUndefined();

  await act(() => router.navigate("/de/join"));

  // Never the French fallback under a German URL: German, once it is in.
  expect(await screen.findByRole("heading", { name: GERMAN })).toBeInTheDocument();
});

test("a block's default gains its German when German arrives", async () => {
  const { renderWithSession } = await import("../test/renderWithSession");
  const { useSavedBlock } = await import("../content/BlocksProvider");
  const { loadCatalogue } = await import("./catalogues");

  function Title() {
    return <p>{useSavedBlock("join.hero").title.de ?? "no German"}</p>;
  }

  await renderWithSession(<Title />, { route: "/join" });
  expect(screen.getByText("no German")).toBeInTheDocument();

  await act(() => loadCatalogue("de-CH"));

  // What an editor opens on and a save compares against: without German
  // here, saving the default would drop it.
  expect(screen.getByText(GERMAN)).toBeInTheDocument();
});

test("edit mode shows no control before German is in", async () => {
  setMockUser("demo.direction");
  sessionStorage.setItem("canetons.editMode", "1");
  const { renderWithSession } = await import("../test/renderWithSession");
  const { useEditMode } = await import("../content/EditMode");
  const { catalogueOf } = await import("./catalogues");

  // Every render, so an "on" without German is caught however short it was.
  const seen: { on: boolean; german: boolean }[] = [];
  function Probe() {
    const { on } = useEditMode();
    seen.push({ on, german: catalogueOf("de-CH") !== undefined });
    return <p>{on ? "editing" : "reading"}</p>;
  }

  await renderWithSession(<Probe />, { route: "/" });

  // Turned on by the provider fetching German as soon as the account may edit.
  expect(await screen.findByText("editing")).toBeInTheDocument();
  expect(seen.some((render) => !render.on)).toBe(true);
  expect(seen.filter((render) => render.on && !render.german)).toEqual([]);
});
