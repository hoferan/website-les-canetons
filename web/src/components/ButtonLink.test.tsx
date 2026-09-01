import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";

import { ButtonLink } from "./ButtonLink";

test("an internal destination renders a router link", () => {
  render(
    <MemoryRouter>
      <ButtonLink to="/planning_repet">Résumé</ButtonLink>
    </MemoryRouter>,
  );
  const link = screen.getByRole("link", { name: "Résumé" });
  expect(link).toHaveAttribute("href", "/planning_repet");
});

// An external link that opens a new tab without rel="noreferrer" hands the
// destination a window.opener it can navigate. The nav's Flickr link already
// gets this right by hand; this makes it structural.
test("an external destination opens a new tab and cannot reach window.opener", () => {
  render(
    <MemoryRouter>
      <ButtonLink to="https://example.org" external>
        Galerie
      </ButtonLink>
    </MemoryRouter>,
  );
  const link = screen.getByRole("link", { name: "Galerie" });
  expect(link).toHaveAttribute("href", "https://example.org");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noreferrer");
});
