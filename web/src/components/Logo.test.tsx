import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";

import { BrandLogo, Logo } from "./Logo";

const renderLogo = () =>
  render(
    <MemoryRouter>
      <Logo />
    </MemoryRouter>,
  );

test("the header lockup names the band, and says what kind of band it is", () => {
  renderLogo();

  // "Guggenmusik" is real text, readable by a screen reader.
  const link = screen.getByRole("link", { name: /Les Canetons de Fribourg/ });
  expect(link).toHaveTextContent("Les Canetons de Fribourg");
  expect(link).toHaveTextContent("Guggenmusik");
});

test("the mark is decorative, because the wordmark beside it says the same thing", () => {
  const { container } = renderLogo();
  const duck = container.querySelector("img")!;

  // The band's name is right there as text; announcing the image repeats it.
  expect(duck).toHaveAttribute("alt", "");
  expect(duck).toHaveAttribute("src", "/assets/img/duck-white.png");
});

test("the lockup goes home", () => {
  renderLogo();

  expect(screen.getByRole("link", { name: /Les Canetons de Fribourg/ })).toHaveAttribute(
    "href",
    "/",
  );
});

// Name matching can be substring and case insensitive, so "accueil" in the
// label would make any query for an "accueil" link match the logo too.
test("the accessible name does not collide with the nav's Accueil link", () => {
  renderLogo();
  const name = screen.getByRole("link").getAttribute("aria-label")!;

  expect(name.toLowerCase()).not.toContain("accueil");
});

// The duck's red beak is the only colour in the header: colour in the header
// means the mark, colour in the nav means state.
test("the wordmark carries no accent colour of its own", () => {
  const { container } = renderLogo();
  const link = container.querySelector("a")!;

  expect(link.innerHTML).not.toMatch(/text-pink/);
  expect(link.innerHTML).not.toMatch(/text-danger/);
});

test("the brand logo renders the original artwork, and is described", () => {
  render(<BrandLogo />);
  const img = screen.getByRole("img");

  // The mark on the flyers, costumes and instruments is content.
  expect(img).toHaveAttribute("src", "/assets/img/Les_Canetons_Fribourg_logo_2.jpg");
  expect(img.getAttribute("alt")).toMatch(/Canetons/);
});

test("the brand logo can be sized by its caller without losing its own classes", () => {
  const { container } = render(<BrandLogo className="w-40" />);

  const img = within(container).getByRole("img");
  expect(img.className).toMatch(/w-40/);
});

// Without width/height the browser has no aspect ratio until the bytes
// arrive, and the front page's hero jumps when the badge lands. The numbers
// are each file's intrinsic pixels. A cached image hides the regression, so
// it shows only on a first visit and nowhere but here.
test("both marks reserve their own space, so nothing jumps when they load", () => {
  const { container } = renderLogo();
  const duck = container.querySelector("img")!;
  expect(duck).toHaveAttribute("width", "139");
  expect(duck).toHaveAttribute("height", "172");

  render(<BrandLogo />);
  const badge = screen.getByRole("img", { name: /Canetons/ });
  expect(badge).toHaveAttribute("width", "237");
  expect(badge).toHaveAttribute("height", "174");
});

// The front page's hero image must not be lazy: that would defer the one
// image a first-time visitor is meant to see.
test("the brand logo is not lazy-loaded", () => {
  render(<BrandLogo />);

  expect(screen.getByRole("img")).not.toHaveAttribute("loading", "lazy");
});
