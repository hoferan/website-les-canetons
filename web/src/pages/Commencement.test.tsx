import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Commencement } from "./Commencement";

// The download is the page's call to action — the flyer a parent prints and
// puts on a noticeboard. A broken href here fails silently: the link still
// looks like a link.
test("the flyer can be downloaded", () => {
  render(<Commencement />);
  const download = screen.getByRole("link", { name: /Télécharger le flyer/ });
  expect(download).toHaveAttribute("href", "/assets/img/Flyer.jpeg");
  expect(download).toHaveAttribute("download");
});
