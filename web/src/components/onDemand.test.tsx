import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArrowUp } from "lucide-react";
import { Suspense } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * What a visitor's bundle leaves out and fetches on demand (#476): sonner
 * with the first toast, the icon button's tip with the first icon button,
 * the action bar's ⋯ menu with the first bar, and the "Plus" menu with the
 * first hover or focus of its trigger.
 *
 * The setup file loads all but "Plus" up front for every other test, so
 * these re-import the modules with vi.resetModules(), where none of it is
 * loaded yet.
 */
beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
});

test("the first toast fetches sonner and still shows", async () => {
  const { notify, ToastOutlet } = await import("./ui/toast");

  render(<ToastOutlet />);
  expect(document.querySelector("[data-sonner-toaster]")).toBeNull();

  act(() => {
    notify.success("Texte enregistré.");
  });

  expect(await screen.findByText("Texte enregistré.")).toBeInTheDocument();
});

test("an icon button focused before its tip arrives keeps the focus", async () => {
  const { IconButton, loadIconButtonTip } = await import("./ui/icon-button");

  render(<IconButton icon={ArrowUp} label="Monter Cloches" word="Monter" />);
  const before = screen.getByRole("button", { name: "Monter Cloches" });
  act(() => before.focus());

  await act(() => loadIconButtonTip());

  // Wrapping it in the tip replaced the element; the focus moved with it.
  const after = screen.getByRole("button", { name: "Monter Cloches" });
  expect(after).not.toBe(before);
  expect(after).toHaveFocus();
});

test("an action bar's ⋯ button focused before its menu arrives keeps the focus and opens it", async () => {
  const { ActionBar, loadActionMenu } = await import("@ds");

  render(
    <ActionBar
      look="chip"
      label="Carte"
      actions={[
        {
          id: "more",
          label: "Plus d’actions pour la carte",
          menu: [{ id: "copy", label: "Dupliquer la carte", onSelect: () => {} }],
        },
      ]}
    />,
  );
  const before = screen.getByRole("button", { name: "Plus d’actions pour la carte" });
  act(() => before.focus());

  await act(() => loadActionMenu());

  const after = screen.getByRole("button", { name: "Plus d’actions pour la carte" });
  expect(after).not.toBe(before);
  expect(after).toHaveFocus();
  await userEvent.click(after);
  expect(await screen.findByRole("menuitem", { name: "Dupliquer la carte" })).toBeInTheDocument();
});

describe('"Plus"', () => {
  const folded = [
    { key: "history", label: "Histoire", to: "/history" },
    { key: "join", label: "Nous rejoindre", to: "/join" },
  ];

  async function renderMore() {
    const { More } = await import("./DesktopNav");
    render(
      <MemoryRouter>
        <Suspense fallback={null}>
          <More folded={folded} active="/" />
        </Suspense>
      </MemoryRouter>,
    );
  }

  test("a press before the menu's chunk is in opens the menu when it arrives", async () => {
    // The chunk is held back until the press has landed on the copy.
    let deliver = () => {};
    const delivered = new Promise<void>((resolve) => (deliver = resolve));
    vi.doMock("./MoreMenu", async (importOriginal) => {
      await delivered;
      return importOriginal();
    });

    await renderMore();
    // The plain copy, which looks like the trigger and fetches nothing yet.
    const copy = screen.getByRole("button", { name: "Plus" });
    expect(copy).toHaveAttribute("aria-haspopup", "menu");

    await userEvent.pointer({ keys: "[MouseLeft]", target: copy });
    expect(copy).toBeInTheDocument();
    expect(screen.queryByRole("menu")).toBeNull();

    act(() => deliver());

    const menu = await screen.findByRole("menu");
    expect(menu).toHaveTextContent("Histoire");
    expect(menu).toHaveTextContent("Nous rejoindre");
  });

  test("focus on the copy fetches the menu and stays on its trigger", async () => {
    await renderMore();
    const copy = screen.getByRole("button", { name: "Plus" });

    // The swap can land before tab() returns, so only where focus ends up is
    // asserted: on Radix's trigger, which replaced the copy.
    await userEvent.tab();

    await waitFor(() => {
      const trigger = screen.getByRole("button", { name: "Plus" });
      expect(trigger).not.toBe(copy);
      expect(trigger).toHaveFocus();
    });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
