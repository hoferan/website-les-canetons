import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { setLocale, t } from "../../i18n";
import type { Row } from "../types";
import { RowView } from "./RowView";

/** The placeholder's words, which hold a no-break space. */
function placeholder(what: "joinContact" | "bookingNumber") {
  return t("placeholders.tbdWhat", { what: t(`placeholders.${what}`) });
}

function rows(...list: Row[]) {
  return render(
    <div data-testid="card">
      {list.map((row, index) => (
        <RowView key={index} row={row} />
      ))}
    </div>,
  );
}

test("a stored phone row renders a tel: link that does not wrap", () => {
  rows({ type: "phone", label: { fr: "Pour réserver les Canetons :" }, number: "026 555 12 34" });

  const link = screen.getByRole("link", { name: "026 555 12 34" });
  expect(link).toHaveAttribute("href", "tel:+41265551234");
  expect(link).toHaveClass("whitespace-nowrap");
  // The label's own colon is not doubled.
  expect(screen.getByTestId("card").textContent).toBe("Pour réserver les Canetons : 026 555 12 34");
});

test.each([
  ["+41 79 123 45 67", "tel:+41791234567"],
  ["0041 79 123 45 67", "tel:+41791234567"],
  ["+33 1 23 45 67 89", "tel:+33123456789"],
])("the number %s dials %s", (number, href) => {
  rows({ type: "phone", label: { fr: "" }, number });

  expect(screen.getByRole("link", { name: number })).toHaveAttribute("href", href);
});

test("an empty phone row shows its placeholder token", () => {
  rows(
    { type: "phone", label: { fr: "" }, number: "", tbd: "join-contact" },
    {
      type: "phone",
      label: { fr: "Pour réserver les Canetons :" },
      number: "",
      tbd: "booking-number",
    },
  );

  const [contact, booking] = Array.from(document.querySelectorAll("p"));
  // No label, so no stray colon in front of the placeholder.
  expect(contact?.textContent).toBe(placeholder("joinContact"));
  expect(contact?.querySelector("[data-tbd='join-contact']")).not.toBeNull();
  expect(booking?.textContent).toBe(`Pour réserver les Canetons : ${placeholder("bookingNumber")}`);
  expect(booking?.querySelector("[data-tbd='booking-number']")).not.toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
});

test("email and link rows render their links", () => {
  rows(
    { type: "email", label: { fr: "Comité" }, address: "comite@example.ch" },
    { type: "link", label: { fr: "Nos photos" }, url: "https://flickr.com/canetons" },
  );

  expect(screen.getByRole("link", { name: "comite@example.ch" })).toHaveAttribute(
    "href",
    "mailto:comite@example.ch",
  );
  const link = screen.getByRole("link", { name: "Nos photos" });
  expect(link).toHaveAttribute("href", "https://flickr.com/canetons");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noreferrer");
});

test("a stored link that is not https renders as text, never as an href", () => {
  rows(
    { type: "link", label: { fr: "Cliquez" }, url: "javascript:alert(1)" },
    { type: "link", label: { fr: "Ancien site" }, url: "http://lescanetons.ch" },
  );

  expect(screen.getByText("Cliquez")).toBeInTheDocument();
  expect(screen.getByText("Ancien site")).toBeInTheDocument();
  expect(screen.queryByRole("link")).toBeNull();
  expect(document.querySelector("[href]")).toBeNull();
});

test("text rows give a paragraph per line, and labelled rows their separator", async () => {
  rows(
    { type: "text", text: { fr: "Trompette\n\nTuba" } },
    { type: "labelValue", label: { fr: "Lieu" }, value: { fr: "Werkhof" } },
  );

  expect(Array.from(document.querySelectorAll("p"), (p) => p.textContent)).toEqual([
    "Trompette",
    "Tuba",
    "Lieu : Werkhof",
  ]);
});

test("German rows read German, and fall back to French", async () => {
  await setLocale("de-CH");
  rows(
    { type: "labelValue", label: { fr: "Lieu", de: "Ort" }, value: { fr: "Werkhof" } },
    { type: "address", address: "Planche-Inférieure 14, 1700 Fribourg" },
  );

  expect(document.querySelector("p")?.textContent).toBe("Ort: Werkhof");
  // An address with no place name is its own link text.
  expect(
    screen.getByRole("link", { name: "Planche-Inférieure 14, 1700 Fribourg" }),
  ).toHaveAttribute(
    "href",
    "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent("Planche-Inférieure 14, 1700 Fribourg"),
  );
});
