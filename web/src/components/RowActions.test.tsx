import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { RowActions, type RowAction } from "./RowActions";

function show(actions: RowAction[], inlineKey = "first") {
  return render(
    <MemoryRouter>
      <RowActions actions={actions} inlineKey={inlineKey} rowName="X" />
    </MemoryRouter>,
  );
}

// A UNION OF ITS OWN, MIRRORING RowAction — `Partial<RowAction>` cannot
// stand in here: `Partial` of a discriminated union collapses to the
// members' COMMON keys (both branches declare `to` and `onSelect`, just
// with opposite optionality), so the result is a plain object that would let
// this helper build the exact unrepresentable shape M6/M7 closed off
// (`to` and `onSelect` together). This keeps the fixture honest about the
// same two shapes the component itself accepts.
type ActionOverride =
  | { onSelect?: () => void; disabled?: boolean; destructive?: boolean; to?: never }
  | { to: string; destructive?: boolean; onSelect?: never; disabled?: never };

const action = (key: string, over: ActionOverride = {}): RowAction => {
  const base = { key, label: key, ariaLabel: `${key} X`, destructive: over.destructive };
  return over.to !== undefined
    ? { ...base, to: over.to }
    : { ...base, onSelect: over.onSelect ?? (() => {}), disabled: over.disabled };
};

describe("RowActions", () => {
  it("keeps the designated action inline and puts the rest behind the trigger", async () => {
    const user = userEvent.setup();
    show([action("first"), action("second"), action("third")]);

    expect(screen.getByRole("button", { name: "first X" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "second X" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Autres actions pour X" }));

    expect(await screen.findByRole("menuitem", { name: "second X" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "third X" })).toBeInTheDocument();
  });

  it("promotes the first remaining action when the designated one is absent", () => {
    show([action("second"), action("third")], "first");

    expect(screen.getByRole("button", { name: "second X" })).toBeInTheDocument();
  });

  it("draws no trigger when the menu would hold fewer than two items", () => {
    show([action("first"), action("second")]);

    expect(screen.getByRole("button", { name: "first X" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "second X" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Autres actions pour X" })).not.toBeInTheDocument();
  });

  it("renders a single action inline with no trigger", () => {
    show([action("only")], "absent");

    expect(screen.getByRole("button", { name: "only X" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Autres actions pour X" })).not.toBeInTheDocument();
  });

  it("renders nothing at all for an empty list", () => {
    const { container } = show([]);

    expect(container).toBeEmptyDOMElement();
  });

  it("gives a link-shaped action a real link, inline and in the menu", async () => {
    const user = userEvent.setup();
    show([action("first", { to: "/somewhere" }), action("b", { to: "/elsewhere" }), action("c")]);

    // The inline action is a real link: this one-level `asChild` (Button ->
    // Link) works fine and is exercised throughout the app already.
    expect(screen.getByRole("link", { name: "first X" })).toHaveAttribute("href", "/somewhere");

    // The in-menu action is ALSO a real anchor: DropdownMenuItem's `asChild`
    // goes straight to react-router's `Link`, one Slot layer, no
    // intermediate component to drop props. Assert the actual element, not
    // just that a menuitem with the right name exists — Testing Library
    // resolves the role from the merged `role="menuitem"` attribute
    // regardless of tag name, so the underlying element could in principle
    // be anything; pin it down to an anchor with the right href.
    await user.click(screen.getByRole("button", { name: "Autres actions pour X" }));
    const item = await screen.findByRole("menuitem", { name: "b X" });
    expect(item.tagName).toBe("A");
    expect(item).toHaveAttribute("href", "/elsewhere");
  });

  it("does not fire a disabled item", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    show([action("first"), action("second", { onSelect, disabled: true }), action("third")]);

    await user.click(screen.getByRole("button", { name: "Autres actions pour X" }));
    await user.click(await screen.findByRole("menuitem", { name: "second X" }));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("types ahead on the visible label, not the accessible name", async () => {
    const user = userEvent.setup();
    show([action("first"), action("alpha"), action("beta")]);

    await user.click(screen.getByRole("button", { name: "Autres actions pour X" }));
    await user.keyboard("b");

    expect(screen.getByRole("menuitem", { name: "beta X" })).toHaveFocus();
  });

  it("puts a separator above a destructive item that is not first", async () => {
    const user = userEvent.setup();
    show([action("first"), action("second"), action("third", { destructive: true })]);

    await user.click(screen.getByRole("button", { name: "Autres actions pour X" }));

    const destructiveItem = await screen.findByRole("menuitem", { name: "third X" });
    expect(destructiveItem.previousElementSibling).toHaveAttribute(
      "data-slot",
      "dropdown-menu-separator",
    );
  });

  it("gives a destructive item no separator when it is first in the menu", async () => {
    const user = userEvent.setup();
    show([action("first"), action("second", { destructive: true }), action("third")]);

    await user.click(screen.getByRole("button", { name: "Autres actions pour X" }));

    const destructiveItem = await screen.findByRole("menuitem", { name: "second X" });
    expect(destructiveItem.previousElementSibling).toBeNull();
  });
});
