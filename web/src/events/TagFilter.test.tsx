import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { TagFilter, shownTag } from "./TagFilter";

const tags = [
  { id: 1, labelFr: "Répétition", labelDe: "Probe", colour: "violet" },
  { id: 3, labelFr: "Sortie", labelDe: "Auftritt", colour: "amber" },
] as const;

test("offers every tag and 'Tous', with 'Tous' chosen by default", () => {
  render(<TagFilter tags={[...tags]} value={null} onChange={() => {}} />);

  const group = screen.getByRole("radiogroup", { name: "Filtrer par catégorie" });
  expect(group).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Tous" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Sortie" })).not.toBeChecked();
});

test("hands back the id of the tag chosen, and null for 'Tous'", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const { rerender } = render(<TagFilter tags={[...tags]} value={null} onChange={onChange} />);

  await user.click(screen.getByRole("radio", { name: "Sortie" }));
  expect(onChange).toHaveBeenLastCalledWith(3);

  rerender(<TagFilter tags={[...tags]} value={3} onChange={onChange} />);
  await user.click(screen.getByRole("radio", { name: "Tous" }));
  expect(onChange).toHaveBeenLastCalledWith(null);
});

test("renders nothing when there are no tags", () => {
  const { container } = render(<TagFilter tags={[]} value={null} onChange={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});

test("a chosen tag that has since been deleted reads as 'Tous'", () => {
  expect(shownTag(3, [...tags])).toBe(3);
  expect(shownTag(4, [...tags])).toBeNull();
  expect(shownTag(null, [...tags])).toBeNull();
});
