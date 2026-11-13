import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { expectNoA11yViolations } from "../../internal/testing/axe";
import { ActionBar, type ActionBarAction, ActionBarList, type ActionBarLook } from "./action-bar";

function cardActions({
  first = false,
  last = false,
  flag = false,
  onSelect = vi.fn(),
  onMenu = vi.fn(),
}: {
  first?: boolean;
  last?: boolean;
  flag?: boolean;
  onSelect?: (id: string) => void;
  onMenu?: (id: string) => void;
} = {}): ActionBarAction[] {
  return [
    {
      id: "before",
      move: "before",
      label: "Déplacer « Notre histoire » avant",
      word: "Avant",
      disabled: first,
      onSelect: () => onSelect("before"),
    },
    {
      id: "after",
      move: "after",
      label: "Déplacer « Notre histoire » après",
      word: "Après",
      disabled: last,
      onSelect: () => onSelect("after"),
    },
    {
      id: "more",
      label: "Plus d’actions : Notre histoire",
      menu: [
        {
          id: "duplicate",
          label: "Dupliquer la carte",
          icon: Copy,
          onSelect: () => onMenu("duplicate"),
        },
        {
          id: "delete",
          label: "Supprimer la carte",
          icon: Trash2,
          destructive: true,
          onSelect: () => onMenu("delete"),
        },
      ],
    },
    {
      id: "edit",
      icon: Pencil,
      label: flag ? "Modifier : Notre histoire (sans allemand)" : "Modifier : Notre histoire",
      word: "Modifier",
      flag,
      onSelect: () => onSelect("edit"),
    },
  ];
}

function Card(props: Parameters<typeof cardActions>[0] & { look?: ActionBarLook }) {
  return (
    <ActionBar
      look={props.look ?? "strip"}
      label="Notre histoire"
      actions={cardActions(props)}
      main="edit"
    />
  );
}

const segment = (name: RegExp | string) => screen.getByRole("button", { name });
const words = () => [...document.querySelectorAll("[data-word]")].map((word) => word.textContent);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("at rest", () => {
  test("only the main action shows its word", () => {
    render(<Card />);
    expect(words()).toEqual(["Modifier"]);
    expect(segment(/^Modifier/)).toHaveAttribute("data-open");
  });

  test("is a named toolbar of segments in order", () => {
    render(<Card />);
    const bar = screen.getByRole("toolbar", { name: "Notre histoire" });
    expect(
      within(bar)
        .getAllByRole("button")
        .map((button) => button.dataset.action),
    ).toEqual(["before", "after", "more", "edit"]);
  });
});

describe("hover", () => {
  test("a fine pointer opens the hovered segment and folds the main one", async () => {
    const user = userEvent.setup();
    render(<Card />);
    await user.hover(segment(/après$/));
    expect(words()).toEqual(["Après"]);
    expect(document.querySelectorAll("[data-open]")).toHaveLength(1);
  });

  test("leaving the bar opens the main action again", async () => {
    const user = userEvent.setup();
    render(<Card />);
    await user.hover(segment(/après$/));
    await user.unhover(screen.getByRole("toolbar"));
    expect(words()).toEqual(["Modifier"]);
  });

  test("touch never opens a word", () => {
    render(<Card />);
    fireEvent.pointerEnter(segment(/après$/), { pointerType: "touch" });
    expect(words()).toEqual(["Modifier"]);
  });

  test("the ⋯ segment has no word and opens nothing", async () => {
    const user = userEvent.setup();
    render(<Card />);
    await user.hover(segment(/^Plus d’actions/));
    expect(words()).toEqual(["Modifier"]);
  });
});

describe("keyboard", () => {
  test("one Tab stop, on the main action first", async () => {
    const user = userEvent.setup();
    render(<Card />);
    const stops = screen.getAllByRole("button").filter((button) => button.tabIndex === 0);
    expect(stops.map((button) => button.dataset.action)).toEqual(["edit"]);
    await user.tab();
    expect(segment(/^Modifier/)).toHaveFocus();
  });

  test("the arrow keys, Home and End move along the bar and carry the Tab stop", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Card />
        <button type="button">Suivant</button>
      </>,
    );
    await user.tab();
    await user.keyboard("{ArrowLeft}");
    expect(segment(/^Plus d’actions/)).toHaveFocus();
    await user.keyboard("{Home}");
    expect(segment(/avant$/)).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(segment(/avant$/)).toHaveFocus();
    await user.keyboard("{End}");
    expect(segment(/^Modifier/)).toHaveFocus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(segment(/après$/)).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Suivant" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(segment(/après$/)).toHaveFocus();
    expect(screen.getAllByRole("button").filter((button) => button.tabIndex === 0)).toHaveLength(2);
  });

  test("keyboard focus opens its segment and wins over hover", async () => {
    const user = userEvent.setup();
    render(<Card />);
    await user.hover(segment(/après$/));
    await user.tab();
    await user.keyboard("{Home}");
    expect(words()).toEqual(["Avant"]);
    await user.hover(segment(/après$/));
    expect(words()).toEqual(["Avant"]);
  });

  test("only keyboard focus inverts its segment", async () => {
    const user = userEvent.setup();
    render(<Card />);
    await user.tab();
    expect(segment(/^Modifier/)).toHaveAttribute("data-focused");
    await user.click(segment(/après$/));
    expect(segment(/après$/)).toHaveFocus();
    expect(document.querySelector("[data-focused]")).toBeNull();
  });

  test("Enter acts, as a click from the keyboard", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Card onSelect={onSelect} />);
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("edit");
  });
});

describe("a dimmed slot", () => {
  test("keeps its place, is aria-disabled and ignores clicks and hover", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Card first onSelect={onSelect} />);
    const before = segment(/avant$/);
    expect(before).toHaveAttribute("aria-disabled", "true");
    expect(before).not.toHaveAttribute("disabled");
    expect(before.dataset.action).toBe("before");
    await user.click(before);
    expect(onSelect).not.toHaveBeenCalled();
    await user.hover(before);
    expect(words()).toEqual(["Modifier"]);
  });

  test("is still reached by the arrow keys", async () => {
    const user = userEvent.setup();
    render(<Card first />);
    await user.tab();
    await user.keyboard("{Home}");
    expect(segment(/avant$/)).toHaveFocus();
  });
});

describe("the ⋯ menu", () => {
  test("opens from the keyboard, walks its items and selects one", async () => {
    const user = userEvent.setup();
    const onMenu = vi.fn();
    render(<Card onMenu={onMenu} />);
    await user.tab();
    await user.keyboard("{ArrowLeft}{Enter}");
    expect(await screen.findByRole("menuitem", { name: "Dupliquer la carte" })).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Supprimer la carte" })).toHaveFocus();
    // The menu's arrow keys are not the toolbar's.
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("menuitem", { name: "Supprimer la carte" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onMenu).toHaveBeenCalledWith("delete");
  });

  test("Escape closes it and gives focus back to ⋯", async () => {
    const user = userEvent.setup();
    render(<Card />);
    await user.tab();
    await user.keyboard("{ArrowLeft}{ArrowDown}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(segment(/^Plus d’actions/)).toHaveFocus();
  });

  test("sets a destructive item apart with a rule", async () => {
    const user = userEvent.setup();
    render(<Card />);
    await user.click(segment(/^Plus d’actions/));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("separator")).toHaveLength(1);
  });
});

describe("the click guard", () => {
  test("a blocked segment ignores clicks until the pointer leaves it", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Card onSelect={onSelect} />);
    const after = segment(/après$/);
    after.setAttribute("data-blocked", "");
    await user.click(after);
    expect(onSelect).not.toHaveBeenCalled();
    await user.unhover(after);
    await user.click(after);
    expect(onSelect).toHaveBeenCalledWith("after");
  });
});

describe("the corner flag", () => {
  test("sits on the flagged segment, 14px open and 12px folded", async () => {
    const user = userEvent.setup();
    render(<Card flag />);
    const flag = () => segment(/^Modifier/).querySelector("[data-flag]");
    expect(flag()).toHaveClass("size-3.5");
    expect(flag()).toHaveAttribute("aria-hidden", "true");
    await user.hover(segment(/après$/));
    expect(flag()).toHaveClass("size-3");
    expect(document.querySelectorAll("[data-flag]")).toHaveLength(1);
  });
});

describe("the list", () => {
  function setWidths(scroll: number, client: number) {
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scroll);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(client);
  }

  function Band() {
    return (
      <ActionBarList>
        <Card first />
        <Card last />
      </ActionBarList>
    );
  }

  test("shows every word on every bar when the widest fits", () => {
    setWidths(200, 237);
    render(<Band />);
    expect(words()).toEqual(["Avant", "Après", "Modifier", "Avant", "Après", "Modifier"]);
  });

  test("keeps only the main words when one bar does not fit", () => {
    setWidths(291, 237);
    render(<Band />);
    expect(words()).toEqual(["Modifier", "Modifier"]);
  });

  test("turns the move arrows up and down when no two bars sit side by side", () => {
    let top = 0;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => {
      top += 300;
      return { top, bottom: top + 46, left: 16, right: 374, width: 358, height: 46 } as DOMRect;
    });
    render(<Band />);
    expect(screen.getAllByRole("button", { name: /avant$/ })[0]?.querySelector("svg")).toHaveClass(
      "lucide-arrow-up",
    );
  });

  test("keeps them left and right side by side", () => {
    let left = 0;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => {
      left += 260;
      return { top: 40, bottom: 86, left, right: left + 237, width: 237, height: 46 } as DOMRect;
    });
    render(<Band />);
    expect(screen.getAllByRole("button", { name: /avant$/ })[0]?.querySelector("svg")).toHaveClass(
      "lucide-arrow-left",
    );
  });

  test("leaves a row folded, since it grows with its words and always fits", () => {
    setWidths(200, 237);
    render(
      <ActionBarList stacked>
        <ActionBar look="row" label="Téléphone" actions={cardActions().slice(0, 3)} />
      </ActionBarList>,
    );
    expect(words()).toEqual([]);
  });

  test("measures again once the fonts have loaded", async () => {
    let loaded!: () => void;
    const ready = new Promise<void>((resolve) => (loaded = resolve));
    Object.defineProperty(document, "fonts", { value: { ready }, configurable: true });
    setWidths(200, 237);
    render(<Band />);
    expect(words()).toHaveLength(6);
    setWidths(291, 237);
    await act(async () => {
      loaded();
      await ready;
    });
    expect(words()).toEqual(["Modifier", "Modifier"]);
    // @ts-expect-error -- jsdom has no FontFaceSet; drop the stand-in.
    delete document.fonts;
  });
});

describe("a chip", () => {
  function Chip({ flag = false }: { flag?: boolean }) {
    return (
      <ActionBar
        look="chip"
        label="Notre histoire"
        main="edit"
        actions={cardActions({ flag }).slice(2)}
      />
    );
  }

  test("is as wide with the flag as without it, so a column of chips lines up", () => {
    const { unmount } = render(<Chip />);
    const plain = segment(/^Modifier/).className;
    unmount();
    render(<Chip flag />);
    expect(segment(/^Modifier/).className).toBe(plain);
  });
});

describe("a strip's main action", () => {
  // jsdom has no layout, so this reads the classes that place the word.
  test("starts at the left with or without the flag, so a column of strips lines up", () => {
    const { unmount } = render(<Card />);
    const plain = segment(/^Modifier/).className;
    unmount();
    render(<Card flag />);
    expect(segment(/^Modifier/).className).toBe(plain);
    expect(plain).toContain("justify-start");
  });
});

describe("accessibility", () => {
  test.each(["chip", "strip", "row"] as const)("the %s look has no axe violation", async (look) => {
    const { container } = render(<Card look={look} flag />);
    await expectNoA11yViolations(container);
  });

  test("an open menu has no axe violation", async () => {
    const user = userEvent.setup();
    render(<Card />);
    await user.click(segment(/^Plus d’actions/));
    await expectNoA11yViolations(screen.getByRole("menu"));
  });
});
