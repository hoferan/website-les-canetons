import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ActionBar } from "./action-bar";
import { useListMoves } from "./use-list-moves";

function Band({ initial = ["Rejoindre", "Canetons", "Histoire"] }: { initial?: string[] }) {
  const [order, setOrder] = useState(initial);
  const moves = useListMoves({
    keys: order,
    onMove: (key, to) =>
      setOrder((current) => {
        const next = current.filter((item) => item !== key);
        next.splice(to, 0, key);
        return next;
      }),
    announce: (key, position, count) => `${key} : position ${position} sur ${count}`,
  });
  return (
    <>
      <ul>
        {order.map((title) => (
          <li key={title} ref={moves.itemRef(title)} data-testid={title}>
            <ActionBar
              look="strip"
              label={title}
              main="edit"
              actions={[
                moves.moveAction(title, "before", { label: `${title} avant`, word: "Avant" }),
                moves.moveAction(title, "after", { label: `${title} après`, word: "Après" }),
                { id: "edit", icon: Pencil, label: `Modifier ${title}`, word: "Modifier" },
              ]}
            />
          </li>
        ))}
      </ul>
      {moves.liveRegion}
    </>
  );
}

const order = () => screen.getAllByRole("listitem").map((item) => item.dataset.testid);
const arrow = (name: string) => screen.getByRole("button", { name });

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error -- jsdom has no elementFromPoint; a test may stand one in.
  delete document.elementFromPoint;
});

describe("a move", () => {
  test("moves the item and keeps focus on the same arrow", async () => {
    const user = userEvent.setup();
    render(<Band />);
    arrow("Rejoindre après").focus();
    await user.keyboard("{Enter}");
    expect(order()).toEqual(["Canetons", "Rejoindre", "Histoire"]);
    expect(arrow("Rejoindre après")).toHaveFocus();
  });

  test("puts focus on the main action at an end", async () => {
    const user = userEvent.setup();
    render(<Band />);
    arrow("Canetons après").focus();
    await user.keyboard("{Enter}");
    expect(order()).toEqual(["Rejoindre", "Histoire", "Canetons"]);
    expect(arrow("Canetons après")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Modifier Canetons" })).toHaveFocus();
  });

  test("shows the keyboard's focus only after a keyboard move", async () => {
    const user = userEvent.setup();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    render(<Band />);
    await user.click(arrow("Rejoindre après"));
    expect(focus).toHaveBeenLastCalledWith({ focusVisible: false });
    arrow("Rejoindre après").focus();
    await user.keyboard("{Enter}");
    expect(focus).toHaveBeenLastCalledWith({ focusVisible: true });
  });

  test("says where the item went", async () => {
    const user = userEvent.setup();
    render(<Band />);
    await user.click(arrow("Histoire avant"));
    const live = document.querySelector("[aria-live='polite']") as HTMLElement;
    expect(live).toHaveTextContent("Histoire : position 2 sur 3");
    await user.click(arrow("Histoire avant"));
    expect(live).toHaveTextContent("Histoire : position 1 sur 3");
  });

  test("dims the arrows at the ends", () => {
    render(<Band />);
    expect(arrow("Rejoindre avant")).toHaveAttribute("aria-disabled", "true");
    expect(arrow("Histoire après")).toHaveAttribute("aria-disabled", "true");
    expect(arrow("Canetons avant")).not.toHaveAttribute("aria-disabled");
  });
});

describe("the click guard", () => {
  test("another item's arrow left under the pointer sleeps until the pointer leaves it", async () => {
    const user = userEvent.setup();
    render(<Band />);
    // After the swap, Canetons sits where Rejoindre was, its own "après" under the pointer.
    document.elementFromPoint = () => arrow("Canetons après");
    await user.click(arrow("Rejoindre après"));
    expect(order()).toEqual(["Canetons", "Rejoindre", "Histoire"]);

    await user.click(arrow("Canetons après"));
    expect(order()).toEqual(["Canetons", "Rejoindre", "Histoire"]);

    await user.unhover(arrow("Canetons après"));
    await user.click(arrow("Canetons après"));
    expect(order()).toEqual(["Rejoindre", "Canetons", "Histoire"]);
  });

  test("the moved item's own arrow is never put to sleep", async () => {
    const user = userEvent.setup();
    render(<Band />);
    document.elementFromPoint = () => arrow("Rejoindre après");
    await user.click(arrow("Rejoindre après"));
    expect(arrow("Rejoindre après")).not.toHaveAttribute("data-blocked");
  });

  test("a keyboard move puts nothing to sleep", async () => {
    const user = userEvent.setup();
    const probe = vi.fn(() => arrow("Canetons après"));
    document.elementFromPoint = probe;
    render(<Band />);
    arrow("Rejoindre après").focus();
    await user.keyboard("{Enter}");
    expect(probe).not.toHaveBeenCalled();
  });

  test("on touch, a second tap within a second and 30px is ignored", () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    render(<Band />);
    const tap = (name: string, x: number, at: number) => {
      vi.mocked(Date.now).mockReturnValue(at);
      // jsdom's click is a MouseEvent, which has no pointerType of its own.
      const click = new MouseEvent("click", { bubbles: true, clientX: x, clientY: 50, detail: 1 });
      Object.defineProperty(click, "pointerType", { value: "touch" });
      fireEvent(arrow(name), click);
    };
    tap("Rejoindre après", 100, 10_000);
    expect(order()).toEqual(["Canetons", "Rejoindre", "Histoire"]);
    tap("Canetons après", 110, 10_500);
    expect(order()).toEqual(["Canetons", "Rejoindre", "Histoire"]);
    tap("Canetons après", 110, 11_200);
    expect(order()).toEqual(["Rejoindre", "Canetons", "Histoire"]);
    tap("Canetons après", 200, 11_400);
    expect(order()).toEqual(["Rejoindre", "Histoire", "Canetons"]);
  });
});

describe("the item element", () => {
  test("is what the hook focuses in, found through itemRef", async () => {
    const user = userEvent.setup();
    render(<Band />);
    await user.click(arrow("Histoire avant"));
    const item = screen.getByTestId("Histoire");
    expect(within(item).getByRole("button", { name: "Histoire avant" })).toHaveFocus();
  });
});
