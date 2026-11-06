import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

import { ICONS } from "../types";
import { ICON_GLYPHS, IconPicker } from "./IconPicker";

// Radix sizes a radio's hidden form input with ResizeObserver, which jsdom
// lacks. Stubbed here only: DesktopNav and Confetti test their jsdom fallback.
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterAll(() => vi.unstubAllGlobals());

function Harness({ value = "star" }: { value?: string | null }) {
  // null stands for a card stored without an icon, which the form holds as absent.
  const form = useForm({ defaultValues: { icon: value ?? undefined } });
  return (
    <FormProvider {...form}>
      <IconPicker name="icon" />
      <output data-testid="value">{form.watch("icon")}</output>
    </FormProvider>
  );
}

const swatch = (name: string) => screen.queryByRole("radio", { name });

test("every icon has a glyph, and the set is about forty", () => {
  expect(ICONS.length).toBeGreaterThanOrEqual(38);
  expect(ICONS.length).toBeLessThanOrEqual(45);
  for (const icon of ICONS) expect(ICON_GLYPHS[icon]).toBeDefined();
});

test("the ten original icons keep their names, so a stored card keeps its picture", () => {
  expect(ICONS.slice(0, 10)).toEqual([
    "music",
    "clock",
    "cake",
    "map-pin",
    "phone",
    "users",
    "calendar",
    "star",
    "info",
    "mail",
  ]);
});

test("every icon is offered when the search is empty, after 'Aucune icône'", () => {
  render(<Harness />);

  const radios = screen.getAllByRole("radio");
  expect(radios).toHaveLength(ICONS.length + 1);
  expect(radios[0]).toHaveAccessibleName("Aucune icône");
});

test("a card stored without an icon shows 'Aucune icône' as picked", () => {
  render(<Harness value={null} />);

  expect(swatch("Aucune icône")).toBeChecked();
  expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(1);
});

test("'Aucune icône' holds the icon as '', and an icon can be picked again", async () => {
  const user = userEvent.setup();
  render(<Harness value="star" />);

  await user.click(swatch("Aucune icône")!);
  expect(swatch("Aucune icône")).toBeChecked();
  expect(screen.getByTestId("value")).toBeEmptyDOMElement();

  await user.click(swatch("Étoile")!);
  expect(swatch("Étoile")).toBeChecked();
  expect(screen.getByTestId("value")).toHaveTextContent("star");
});

test("'Aucune icône' stays offered whatever the search", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  await user.type(screen.getByRole("searchbox", { name: "Chercher une icône" }), "zzz");

  expect(swatch("Aucune icône")).toBeInTheDocument();
});

test("searching 'tel' finds the telephone and hides the rest", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  await user.type(screen.getByRole("searchbox", { name: "Chercher une icône" }), "tel");

  expect(swatch("Téléphone")).toBeInTheDocument();
  expect(swatch("Calendrier")).toBeNull();
});

test("the German name finds the icon too", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  await user.type(screen.getByRole("searchbox", { name: "Chercher une icône" }), "Kalender");

  expect(swatch("Calendrier")).toBeInTheDocument();
  expect(swatch("Téléphone")).toBeNull();
});

test("the search ignores case and accents, typed with or without them", async () => {
  const user = userEvent.setup();
  render(<Harness value="phone" />);
  const box = screen.getByRole("searchbox", { name: "Chercher une icône" });

  await user.type(box, "etoile");
  expect(swatch("Étoile")).toBeInTheDocument();

  await user.clear(box);
  await user.type(box, "ÉTOILE");
  expect(swatch("Étoile")).toBeInTheDocument();

  await user.clear(box);
  await user.type(box, "gateau");
  expect(swatch("Gâteau")).toBeInTheDocument();
});

test("the picked icon stays on screen while the search hides the others", async () => {
  const user = userEvent.setup();
  render(<Harness value="star" />);

  await user.type(screen.getByRole("searchbox", { name: "Chercher une icône" }), "kalender");

  expect(swatch("Étoile")).toBeChecked();
  expect(swatch("Calendrier")).toBeInTheDocument();
});

test("a search that matches nothing says so, and picking from the filtered list still works", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const box = screen.getByRole("searchbox", { name: "Chercher une icône" });

  await user.type(box, "zzz");
  expect(screen.getByText("Aucune icône ne correspond.")).toBeInTheDocument();

  await user.clear(box);
  await user.type(box, "tel");
  await user.click(screen.getByRole("radio", { name: "Téléphone" }));
  expect(screen.getByTestId("value")).toHaveTextContent("phone");
});

test("Enter in the search box does not submit the dialog's form", async () => {
  const user = userEvent.setup();
  let submitted = false;
  render(
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submitted = true;
      }}
    >
      <Harness />
    </form>,
  );

  await user.type(screen.getByRole("searchbox", { name: "Chercher une icône" }), "tel{Enter}");

  expect(submitted).toBe(false);
});
