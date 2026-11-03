import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";

import { setMockUser } from "../../mocks/handlers";
import { server } from "../../mocks/node";
import { recordBlockPuts } from "../../test/renderBlockEditor";
import { renderWithSession } from "../../test/renderWithSession";
import { EDIT_MODE_KEY } from "../EditMode";
import { FieldsBlock } from "./FieldsBlock";

afterEach(() => server.events.removeAllListeners());

function Godparents() {
  return (
    <FieldsBlock blockKey="band.godparents" labels={{ heading: "Titre", names: "Noms" }}>
      {(texts) => (
        <div>
          <h2>{texts.heading}</h2>
          <p>{texts.names}</p>
        </div>
      )}
    </FieldsBlock>
  );
}

test("the texts render in the page's own markup, with one chip in edit mode", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  setMockUser("demo.direction");
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  await renderWithSession(<Godparents />, { route: "/band" });

  expect(screen.getByRole("heading", { name: "Le parrain et la marraine" })).toBeInTheDocument();
  expect(screen.getByText("Richard Hertig et Annick Bürgisser")).toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: "Modifier : Les canetons · parrain et marraine" }),
  );
  const dialog = await screen.findByRole("dialog");
  const names = within(dialog).getByRole("textbox", { name: "Noms FR" });
  await user.clear(names);
  await user.type(names, "Anne et Paul");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(1);
  expect(puts[0]?.body).toEqual({
    data: {
      heading: { fr: "Le parrain et la marraine", de: expect.any(String) },
      names: { fr: "Anne et Paul", de: expect.any(String) },
    },
  });
  await waitFor(() => expect(screen.getByText("Anne et Paul")).toBeInTheDocument());
});

test("a visitor gets the texts and no chip", async () => {
  await renderWithSession(<Godparents />, { route: "/band" });

  expect(screen.getByRole("heading", { name: "Le parrain et la marraine" })).toBeInTheDocument();
  expect(screen.queryByRole("button")).toBeNull();
});
