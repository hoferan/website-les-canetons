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

  // "Guggenmusik" appears nowhere in the current header. The old JPEG had it
  // baked into the image, where it was both illegible at 64px and invisible to
  // a screen reader.
  const link = screen.getByRole("link", { name: /Les Canetons de Fribourg/ });
  expect(link).toHaveTextContent("Les Canetons de Fribourg");
  expect(link).toHaveTextContent("Guggenmusik");
});

test("the mark is decorative, because the wordmark beside it says the same thing", () => {
  const { container } = renderLogo();
  const duck = container.querySelector("img")!;

  // alt="" not alt="Logo": the band's name is right there as real text, so
  // announcing the image too makes a screen reader say it twice.
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

// REGRESSION. The label was "Les Canetons de Fribourg — accueil" at first, and
// because accessible-name matching is substring and case-insensitive, every
// query for the nav's own "Accueil" link then resolved to two elements. The e2e
// suite caught it as a strict mode violation; this catches it in milliseconds.
test("the accessible name does not collide with the nav's Accueil link", () => {
  renderLogo();
  const name = screen.getByRole("link").getAttribute("aria-label")!;

  expect(name.toLowerCase()).not.toContain("accueil");
});

// THE E2-ROUND DECISION THIS PINS. The duck's beak is red; the wordmark used to
// highlight "Canetons" in pink, so the header carried two competing accents an
// inch apart. The beak is now the only colour in the header — colour in the
// header means the MARK, colour in the nav means STATE. Asserted on the class
// because that is where the colour lives; the real check is looking at it.
test("the wordmark carries no accent colour of its own", () => {
  const { container } = renderLogo();
  const link = container.querySelector("a")!;

  expect(link.innerHTML).not.toMatch(/text-pink/);
  expect(link.innerHTML).not.toMatch(/text-danger/);
});

test("the brand logo renders the original artwork, and is described", () => {
  render(<BrandLogo />);
  const img = screen.getByRole("img");

  // This one is NOT decorative. It is the mark on the flyers, the costumes and
  // the instruments — it is content, so it gets a real description.
  expect(img).toHaveAttribute("src", "/assets/img/Les_Canetons_Fribourg_logo_2.jpg");
  expect(img.getAttribute("alt")).toMatch(/Canetons/);
});

test("the brand logo can be sized by its caller without losing its own classes", () => {
  const { container } = render(<BrandLogo className="w-40" />);

  const img = within(container).getByRole("img");
  expect(img.className).toMatch(/w-40/);
});

// LAYOUT SHIFT, and it was measured rather than guessed. Neither image carried
// width/height, so the browser had no aspect ratio until the bytes arrived: the
// badge's `h-auto` computed to 0 and the whole /accueil hero — heading,
// sentence, photo slot, next event — sat 141px too high and jumped down when
// the JPEG landed. Caught on TEST, where a measurement taken a beat early read
// the badge as h=0 and the page looked like it had no badge at all.
//
// The numbers are each file's INTRINSIC pixels, so the reserved box has the
// right shape; the CSS still decides the rendered size. Asserted here because
// nothing else can see a missing attribute — a browser renders identically once
// the image is cached, so this regresses silently and only on a first visit.
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

// The hero image of the front page must not be lazy: `loading="lazy"` was on the
// badge and defers the one image a first-time visitor is meant to see, which on
// a slow connection guarantees the shift the width/height above prevent. `lazy`
// belongs on images below the fold, of which this site currently has none.
test("the brand logo is not lazy-loaded", () => {
  render(<BrandLogo />);

  expect(screen.getByRole("img")).not.toHaveAttribute("loading", "lazy");
});
