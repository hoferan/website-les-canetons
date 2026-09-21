import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

function Harness({ onPick = () => {} }: { onPick?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Autres actions">…</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onPick}>Premier</DropdownMenuItem>
        <DropdownMenuItem>Second</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("DropdownMenu", () => {
  it("opens from the trigger and closes on Escape, returning focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Autres actions" });
    await user.click(trigger);

    expect(await screen.findByRole("menuitem", { name: "Premier" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menuitem", { name: "Premier" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("moves through items with the arrow keys and selects with Enter", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);

    await user.click(screen.getByRole("button", { name: "Autres actions" }));
    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("menuitem", { name: "Premier" })).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(onPick).toHaveBeenCalledTimes(1);
  });
});
