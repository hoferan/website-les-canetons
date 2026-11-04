import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { server } from "../../mocks/node";
import { recordBlockPuts, renderBlockEditor } from "../../test/renderBlockEditor";
import { MarkPicker } from "./MarkPicker";
import { TranslatedField } from "./TranslatedField";

const open = (german = false) =>
  renderBlockEditor("join.hero", () => (
    <>
      <TranslatedField name="title" label="Titre" required />
      <MarkPicker titleName="title" markName="mark" />
    </>
  )).then(async (dialog) => {
    const user = userEvent.setup();
    const title = within(dialog).getByRole("textbox", { name: "Titre FR" });
    await user.clear(title);
    await user.type(title, "guggen d’enfants de Fribourg, depuis 2002.");
    // The shipped hero already has a German title.
    if (german) {
      const de = within(dialog).getByRole("textbox", { name: "Titre DE" });
      await user.clear(de);
      await user.type(de, "Die Kinder-Guggenmusik");
    }
    return { dialog, user, title };
  });

const frRow = (dialog: HTMLElement) =>
  within(dialog).getByRole("group", { name: "Mots en évidence FR" });

test("tapping two words picks the run between them", async () => {
  const { dialog, user } = await open();
  await user.click(within(frRow(dialog)).getByRole("button", { name: "guggen" }));
  await user.click(within(frRow(dialog)).getByRole("button", { name: "enfants" }));

  for (const word of ["guggen", "d’", "enfants"]) {
    expect(within(frRow(dialog)).getByRole("button", { name: word })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  expect(within(frRow(dialog)).getByRole("button", { name: "de" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  // Punctuation is text, not a button.
  expect(within(frRow(dialog)).queryByRole("button", { name: "," })).toBeNull();
});

test("Aucun clears the words", async () => {
  const { dialog, user } = await open();
  await user.click(within(frRow(dialog)).getByRole("button", { name: "guggen" }));
  await user.click(within(frRow(dialog)).getByRole("button", { name: "Aucun" }));
  expect(within(frRow(dialog)).getByRole("button", { name: "guggen" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("changing the title so the words vanish clears them", async () => {
  const { dialog, user, title } = await open();
  await user.click(within(frRow(dialog)).getByRole("button", { name: "guggen" }));
  await user.click(within(frRow(dialog)).getByRole("button", { name: "d’" }));
  await user.clear(title);
  await user.type(title, "Une fanfare");
  expect(within(frRow(dialog)).getByRole("button", { name: "fanfare" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(within(frRow(dialog)).getByRole("button", { name: "Aucun" })).toBeDisabled();
});

test("the German title gets its own row, and none while German is absent", async () => {
  const { dialog, user } = await open(true);
  expect(within(dialog).getByRole("group", { name: "Mots en évidence DE" })).toBeVisible();
  await user.click(
    within(within(dialog).getByRole("group", { name: "Mots en évidence DE" })).getByRole("button", {
      name: "Kinder-",
    }),
  );
  expect(
    within(within(dialog).getByRole("group", { name: "Mots en évidence DE" })).getByRole("button", {
      name: "Kinder-",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await user.click(within(dialog).getByRole("button", { name: "Retirer l’allemand" }));
  expect(screen.queryByRole("group", { name: /DE$/ })).toBeNull();
});

test("the stored mark is the picked text of the title", async () => {
  const puts = recordBlockPuts();
  try {
    const { dialog, user } = await open();
    await user.click(within(frRow(dialog)).getByRole("button", { name: "guggen" }));
    await user.click(within(frRow(dialog)).getByRole("button", { name: "enfants" }));
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

    await expect.poll(() => puts).toHaveLength(1);
    const data = (puts[0]!.body as { data: { mark: { fr: string } } }).data;
    expect(data.mark.fr).toBe("guggen d’enfants");
  } finally {
    server.events.removeAllListeners();
  }
});
