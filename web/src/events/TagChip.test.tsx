import { render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { setLocale } from "../i18n";
import { TagChip } from "./TagChip";

afterEach(async () => {
  await setLocale("fr");
});

const carnaval = { id: 4, labelFr: "Carnaval", labelDe: "Fasnacht", colour: "pink" } as const;

test("shows the French name on a French page", () => {
  render(<TagChip tag={carnaval} />);
  expect(screen.getByText("Carnaval")).toBeInTheDocument();
});

test("shows the German name on a German page", async () => {
  await setLocale("de-CH");
  render(<TagChip tag={carnaval} />);
  expect(screen.getByText("Fasnacht")).toBeInTheDocument();
});

test("falls back to the French name when there is no German one", async () => {
  await setLocale("de-CH");
  render(<TagChip tag={{ ...carnaval, labelDe: null }} />);
  expect(screen.getByText("Carnaval")).toBeInTheDocument();
});

test("takes its colour from the tag", () => {
  render(<TagChip tag={carnaval} />);
  expect(screen.getByText("Carnaval")).toHaveClass("bg-tag-pink", "text-tag-pink-ink");
});
